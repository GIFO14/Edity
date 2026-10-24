const fs=require('node:fs'),path=require('node:path'),{createHash,randomUUID}=require('node:crypto');
const {bridgeError}=require('./local-agent-bridge');
const legacyHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const hash=value=>legacyHash(canonical(value));
class AgentStateStore{
  constructor(directory){this.directory=directory;this.active=new Set();this.inflight=new Map();fs.mkdirSync(directory,{recursive:true});}
  path(kind,id){if(!/^[a-z0-9-]{1,120}$/i.test(id))throw bridgeError('INVALID_DATA','Invalid state ID');return path.join(this.directory,`${kind}-${id}.json`);}
  write(kind,id,value){const file=this.path(kind,id),temporary=`${file}.${randomUUID()}.tmp`;fs.writeFileSync(temporary,JSON.stringify(value));fs.renameSync(temporary,file);}
  read(kind,id){try{return JSON.parse(fs.readFileSync(this.path(kind,id),'utf8'));}catch(error){if(error.code==='ENOENT')throw bridgeError('NOT_FOUND',`${kind} not found`);throw error;}}
  key(params){const key=params.idempotencyKey;if(typeof key!=='string'||!key.length||key.length>200)throw bridgeError('INVALID_DATA','Supply a stable idempotencyKey of 1–200 characters');return hash(key);}
  async once(method,params,fn){
    const id=this.key(params),fingerprint=hash({method,params}),file=this.path('request',id);
    if(fs.existsSync(file)){const saved=this.read('request',id);if(saved.fingerprint!==fingerprint&&saved.fingerprint!==legacyHash({method,params}))throw bridgeError('IDEMPOTENCY_CONFLICT','This idempotencyKey already describes another request');if(saved.complete)return saved.result;}
    if(this.inflight.has(id)){const pending=this.inflight.get(id);if(pending.fingerprint!==fingerprint)throw bridgeError('IDEMPOTENCY_CONFLICT','This idempotencyKey already describes another request');return pending.promise;}
    this.write('request',id,{method,fingerprint,complete:false});
    const promise=Promise.resolve().then(()=>fn(id)).then(result=>{this.write('request',id,{method,fingerprint,complete:true,result});return result;}).finally(()=>this.inflight.delete(id));this.inflight.set(id,{fingerprint,promise});return promise;
  }
  open(projectId,key){const id=hash({projectId,key}).slice(0,32),file=this.path('session',id);if(!fs.existsSync(file))this.write('session',id,{id,projectId,requestId:`agent-session-${id}`,checkpoint:{},createdAt:new Date().toISOString()});return this.read('session',id);}
  assertAvailable(id){if(this.active.has(id))throw bridgeError('SESSION_BUSY','Another tool is updating this session; wait for its job');}
}
module.exports={AgentStateStore,hash,legacyHash};
