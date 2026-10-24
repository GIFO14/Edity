const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');const {EventEmitter}=require('node:events');
const terminal=new Set(['complete','partial','failed','cancelled','interrupted']);
const {JobStateWriter}=require('./job-state-writer');
class JobCoordinator extends EventEmitter {
  constructor(directory,repository,limits={ai:2,download:4,prepare:2,export:1,transcribe:1}){
    super();this.directory=directory;this.repository=repository;this.limits=limits;this.jobs=new Map();this.handlers=new Map();this.active=new Map();this.lastProject=new Map();this.sequence=0;fs.mkdirSync(directory,{recursive:true});
    this.writer=new JobStateWriter(directory,{onWarning:warning=>console.warn('Job state save will be retried',warning.jobId,warning.code)});
    const recovered=new Map();
    for(const file of fs.readdirSync(directory).filter(name=>/\.json(?:\.[a-zA-Z0-9-]+\.tmp)?$/.test(name))){try{const full=path.join(directory,file),job=JSON.parse(fs.readFileSync(full,'utf8'));if(!job||!/^[a-zA-Z0-9_-]+$/.test(job.id))throw Error('Invalid job snapshot');const old=recovered.get(job.id),mtime=fs.statSync(full).mtimeMs;if(!old||(job.stateRevision||0)>(old.job.stateRevision||0)||(job.stateRevision||0)===(old.job.stateRevision||0)&&mtime>old.mtime)recovered.set(job.id,{job,mtime});}catch(error){console.warn('Could not recover job',file,error.message);}}
    for(const {job}of recovered.values()){if(['running','cancelling'].includes(job.status)){job.status=job.status==='cancelling'?'cancelled':'interrupted';job.generationId++;}this.jobs.set(job.id,job);this.persist(job);}
  }
  persist(job){job.stateRevision=(job.stateRevision||0)+1;this.writer.write(job.id,JSON.stringify(job));this.emit('changed',structuredClone(job));}
  register(kind,handler,{resource='prepare',requiresReady=false,resumable=false}={}){this.handlers.set(kind,{handler,resource,requiresReady,resumable});for(const job of this.jobs.values())if(job.kind===kind&&job.status==='interrupted'&&resumable){job.status='queued';job.generationId++;this.persist(job);}this.pump();}
  start({kind,projectId,payload={},dependencies=[],parentId,revision,requestId}){
    if(!this.handlers.has(kind))throw new Error(`Unsupported job: ${kind}`);
    if(requestId){const existing=[...this.jobs.values()].find(job=>job.projectId===projectId&&job.requestId===requestId);if(existing)return structuredClone(existing);}
    this.repository.getDocument(projectId);
    const job={id:randomUUID(),kind,projectId,payload,dependencies,parentId,revision,requestId,status:'queued',progress:0,stage:'Queued',generationId:1,createdAt:new Date().toISOString()};this.jobs.set(job.id,job);this.persist(job);this.pump();return structuredClone(job);
  }
  get(id){const job=this.jobs.get(id);if(!job)throw new Error('Job not found');return structuredClone(job);}
  list(projectId){return [...this.jobs.values()].filter(job=>!projectId||job.projectId===projectId).map(job=>structuredClone(job));}
  pump(){
    if(this.closing)return;
    if(this.pumping)return;this.pumping=true;
    try{
      const candidates=[...this.jobs.values()].filter(job=>['queued','waiting'].includes(job.status)).sort((a,b)=>(this.lastProject.get(a.projectId)||0)-(this.lastProject.get(b.projectId)||0)||a.createdAt.localeCompare(b.createdAt));
      for(const job of candidates){const registration=this.handlers.get(job.kind);if(!registration)continue;
        const deps=job.dependencies.map(id=>this.jobs.get(id));
        if(deps.some(dep=>!dep||['failed','cancelled','interrupted'].includes(dep.status))){job.status='failed';job.error='A required dependency did not complete';this.persist(job);continue;}
        const ready=deps.every(dep=>['complete','partial'].includes(dep.status));
        let document;try{document=this.repository.getDocument(job.projectId);}catch{job.status='cancelled';this.persist(job);continue;}
        const preparing=registration.requiresReady&&(document.processing&&document.processing.status!=='done'||!document.videoPath);
        if(!ready||preparing){if(job.status!=='waiting'){job.status='waiting';job.stage=preparing?'Waiting for transcript and clean video':`Waiting for ${job.dependencies.join(', ')}`;this.persist(job);}continue;}
        const active=[...this.active.values()];if(active.filter(item=>item.resource===registration.resource).length>=(this.limits[registration.resource]||1))continue;
        if(registration.resource==='ai'&&active.some(item=>item.resource==='ai'&&item.projectId===job.projectId))continue;
        this.run(job,registration);
      }
    }finally{this.pumping=false;}
  }
  run(job,{handler,resource}){
    const generation=job.generationId,controller=new AbortController();const cleanup=new Set();
    const assertActive=()=>{if(controller.signal.aborted||job.generationId!==generation||job.status!=='running')throw new Error('Cancelled');};
    const context={signal:controller.signal,assertActive,jobId:job.id,serviceId:`${job.id}-${generation}`,projectId:job.projectId,initialCheckpoint:structuredClone(job.checkpoint||{}),
      acquire:async resource=>{while([...this.active.values()].filter(a=>a.leases?.has(resource)).length>=(this.limits[resource]||1)){assertActive();await new Promise(resolve=>setTimeout(resolve,80));}assertActive();active.leases.add(resource);return()=>active.leases.delete(resource);},
      checkpoint:data=>{assertActive();job.checkpoint=structuredClone(data);this.persist(job);},
      log:entry=>{assertActive();job.logs=[...(job.logs||[]),{at:new Date().toISOString(),...entry}].slice(-500);this.persist(job);},
      progress:(progress,stage)=>{assertActive();const next=Math.max(0,Math.min(99,progress));if(job.progress===next&&job.stage===stage)return;job.progress=next;job.stage=stage;this.persist(job);},
      registerCancel:callback=>{cleanup.add(callback);return ()=>cleanup.delete(callback);},
      commit:transaction=>{assertActive();return this.repository.commit({...transaction,projectId:job.projectId});},
      getDocument:()=>this.repository.getDocument(job.projectId)};
    job.status='running';job.stage='Starting';this.lastProject.set(job.projectId,++this.sequence);
    const active={projectId:job.projectId,resource,controller,cleanup,done:null,leases:new Set()};this.active.set(job.id,active);this.persist(job);
    active.done=Promise.resolve().then(()=>handler(structuredClone(job.payload),context)).then(result=>{assertActive();job.result=result;job.status=result?.partial?'partial':'complete';job.progress=100;job.stage=result?.partial?'Partially complete':'Complete';}).catch(error=>{job.status=controller.signal.aborted||job.generationId!==generation?'cancelled':'failed';job.error=String(error.message||error);job.errorCode=error.code||'ACTION_FAILED';job.errorDetails=error.details||error.paths;job.stage=job.status==='cancelled'?'Cancelled':'Failed';}).finally(()=>{this.active.delete(job.id);this.persist(job);this.pump();});
  }
  async cancel(id){const job=this.jobs.get(id);if(!job)throw new Error('Job not found');if(terminal.has(job.status))return this.get(id);
    job.generationId++;const active=this.active.get(id);job.status=active?'cancelling':'cancelled';job.stage='Cancelling';this.persist(job);
    for(const child of this.jobs.values())if(child.parentId===id&&!terminal.has(child.status))await this.cancel(child.id);
    if(active){active.controller.abort();await Promise.allSettled([...active.cleanup].map(callback=>callback()));await active.done;}else this.persist(job);
    if(job.kind==='process-project'){try{const d=this.repository.getDocument(job.projectId);if(d.processing&&d.processing.status!=='done')this.repository.commit({id:randomUUID(),projectId:job.projectId,baseRevision:d.revision,actor:'migration',label:'Cancel preparation',operations:[],documentChanges:{processing:{...d.processing,status:'error',stage:'Cancelled',error:'Preparation cancelled; resume when ready.'}},skipHistory:true});}catch{}}
    return this.get(id);
  }
  async cancelProject(projectId){await Promise.all([...this.jobs.values()].filter(job=>job.projectId===projectId&&!terminal.has(job.status)).map(job=>this.cancel(job.id)));}
  retry(id){const job=this.jobs.get(id);if(!job||!['failed','partial','interrupted','cancelled'].includes(job.status))throw new Error('This job cannot be resumed');job.generationId++;job.status='queued';job.error='';job.progress=0;this.persist(job);this.pump();return this.get(id);}
  async shutdown(){this.closing=true;const active=[...this.active].map(([id,entry])=>({job:this.jobs.get(id),entry,wasCancelling:this.jobs.get(id).status==='cancelling'}));for(const {job,entry} of active){job.generationId++;entry.controller.abort();}await Promise.allSettled(active.flatMap(({entry})=>[...[...entry.cleanup].map(cb=>cb()),entry.done]));for(const {job,wasCancelling} of active){job.status=wasCancelling?'cancelled':'interrupted';job.stage=wasCancelling?'Cancelled':'Interrupted when Edity closed';this.persist(job);}await this.writer.flush();this.writer.stop();}
}
module.exports={JobCoordinator};
