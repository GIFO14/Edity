const fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {randomUUID,randomBytes,timingSafeEqual}=require('node:crypto');
const {execFileSync}=require('node:child_process');
function bridgeError(code,message,details){const error=new Error(message);error.code=code;error.details=details;return error;}
function protectDirectory(directory){
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  if(process.platform==='win32'){
    const identity=execFileSync('whoami.exe',['/user','/fo','csv','/nh'],{windowsHide:true,encoding:'utf8'}),sid=identity.match(/S-1-[0-9-]+/)?.[0];
    if(!sid)throw new Error('Cannot identify the owner of the local bridge descriptor');
    execFileSync('icacls.exe',[directory,'/inheritance:r','/grant:r',`*${sid}:(OI)(CI)F`,'*S-1-5-18:(OI)(CI)F','*S-1-5-32-544:(OI)(CI)F'],{windowsHide:true,stdio:'pipe'});
  }else fs.chmodSync(directory,0o700);
}
const statuses={INVALID_REQUEST:400,UNAUTHORIZED:401,FORBIDDEN:403,METHOD_NOT_FOUND:404,NOT_FOUND:404,REVISION_CONFLICT:409,IDEMPOTENCY_CONFLICT:409,SESSION_BUSY:409,PROJECT_NOT_READY:409,INVALID_DATA:422,ACTION_INVALID:422,INTERNAL_ERROR:500};
async function startLocalAgentBridge({directory,methods,info={},onClose,artifacts=new Map(),protect=true}){
  directory=path.resolve(directory);if(protect)protectDirectory(directory);else fs.mkdirSync(directory,{recursive:true});
  const instanceId=randomUUID(),token=randomBytes(32).toString('hex'),startedAt=new Date().toISOString();let closing=false;
  const clean=value=>typeof value==='string'?value.replaceAll(token,'[redacted]'):value;
  const metadata=()=>({protocolVersion:1,instanceId,pid:process.pid,startedAt,...info,url:`http://127.0.0.1:${server.address().port}`});
  const send=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
  const methodMap=new Map(Object.entries(methods));methodMap.set('instance.info',()=>metadata());
  const server=http.createServer(async(req,res)=>{
    let id=null;
    try{
      const port=server.address().port;
      if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)||req.headers.origin)throw bridgeError('FORBIDDEN','Only authenticated local agent clients are supported');
      const received=Buffer.from(String(req.headers.authorization||'')),expected=Buffer.from(`Bearer ${token}`);
      if(received.length!==expected.length||!timingSafeEqual(received,expected))throw bridgeError('UNAUTHORIZED','Authentication required');
      const url=new URL(req.url,'http://127.0.0.1');
      if(req.method==='GET'&&url.pathname.startsWith('/v1/artifacts/')){
        const artifactId=url.pathname.slice('/v1/artifacts/'.length),artifact=artifacts.get(artifactId);
        if(!artifact||!fs.existsSync(artifact.path))throw bridgeError('NOT_FOUND','Artifact is missing or expired; inspect again');
        const stat=fs.statSync(artifact.path);if(!stat.isFile())throw bridgeError('NOT_FOUND','Artifact unavailable');
        res.writeHead(200,{'Content-Type':artifact.mimeType||'image/png','Content-Length':stat.size,'Cache-Control':'no-store'});const stream=fs.createReadStream(artifact.path);stream.on('error',()=>res.destroy());stream.pipe(res);return;
      }
      if(req.method!=='POST'||url.pathname!=='/v1/rpc')throw bridgeError('METHOD_NOT_FOUND','Use POST /v1/rpc');
      if(!String(req.headers['content-type']||'').startsWith('application/json'))throw bridgeError('INVALID_REQUEST','Content-Type must be application/json');
      const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>16*1024*1024)throw bridgeError('INVALID_REQUEST','Request exceeds 16 MB');chunks.push(chunk);}
      let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw bridgeError('INVALID_REQUEST','Invalid JSON request');}
      if(!body||Array.isArray(body)||typeof body.method!=='string'||!body.params||typeof body.params!=='object'||Array.isArray(body.params))throw bridgeError('INVALID_REQUEST','Supply id, method and an object params');
      id=body.id??null;if(id!==null&&typeof id!=='string'&&typeof id!=='number')throw bridgeError('INVALID_REQUEST','Invalid correlation ID');
      const method=methodMap.get(body.method);if(!method)throw bridgeError('METHOD_NOT_FOUND','Unknown bridge method');
      const result=await method(body.params);send(res,200,{id,result});
    }catch(error){if(res.headersSent){res.destroy();return;}const code=Object.hasOwn(statuses,error.code)?error.code:'INTERNAL_ERROR';send(res,statuses[code],{id,error:{code,message:clean(String(error.message||error)),...(error.details?{details:JSON.parse(clean(JSON.stringify(error.details)))}:{})}});}
  });
  server.requestTimeout=300000;server.headersTimeout=10000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const descriptorPath=path.join(directory,`${instanceId}.json`),temporary=`${descriptorPath}.tmp`;
  try{fs.writeFileSync(temporary,JSON.stringify({...metadata(),token},null,2),{mode:0o600,flag:'wx'});fs.renameSync(temporary,descriptorPath);}catch(error){server.close();throw error;}
  const close=async()=>{if(closing)return;closing=true;try{fs.unlinkSync(descriptorPath);}catch(error){if(error.code!=='ENOENT')throw error;}server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));};
  methodMap.set('instance.close',()=>{if(info.mode!=='isolated')throw bridgeError('FORBIDDEN','Only isolated agent sessions can be closed through this bridge');setTimeout(()=>{void onClose?.();},100).unref();return {closing:true};});
  return {instanceId,descriptorPath,metadata,artifacts,close};
}
module.exports={startLocalAgentBridge,bridgeError,protectDirectory};
