const path=require('node:path');const {randomUUID}=require('node:crypto');
const {importAsset,assetPaths}=require('./asset-library');
const {compileComposition,withCaptions,captionSrt}=require('../shared/composition-runtime.cjs');
const {exportComposition}=require('./render-worker-manager');
const {exportResolveTimeline}=require('./resolve-export');
function registerMediaJobs(coordinator,repository,backendUrl){
  async function service(endpoint,body,context){
    const serviceId=context.serviceId||context.jobId;
    const unregister=context.registerCancel(()=>fetch(`${backendUrl}/composition/cancel/${serviceId}`,{method:'POST'}).catch(()=>{}));
    try{const response=await fetch(`${backendUrl}${endpoint}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...body,jobId:serviceId}),signal:context.signal});const data=await response.json();if(!response.ok)throw new Error(typeof data.detail==='string'?data.detail:JSON.stringify(data.detail));context.assertActive();return data;}finally{unregister();}
  }
  async function prepare(payload,ctx){
    ctx.progress(5,'Importing resource');let asset;
    if(payload.assetId)asset=ctx.getDocument().composition.assets[payload.assetId];
    else asset=await importAsset(repository,ctx.projectId,payload.path,payload.kind,payload.provenance,ctx);
    if(!asset)throw new Error('Asset not found');
    try{
      ctx.progress(15,`Preparing ${asset.name}`);
      const result=await service('/composition/prepare',{path:path.resolve(repository.directory(ctx.projectId),asset.path),kind:asset.kind},ctx);
      delete result.contactSheetPath;
      const current=ctx.getDocument(),prepared={...current.composition.assets[asset.id],...result,...(payload.displayName?{name:String(payload.displayName).slice(0,500)}:{})};
      const file=path.resolve(repository.directory(ctx.projectId),prepared.path);
      const clips=(current.clips||[]).map(c=>path.resolve(c.path)===file&&c.duration<=0?{...c,duration:prepared.durationUs/1e6}:c);
      ctx.commit({id:randomUUID(),baseRevision:current.revision,actor:'migration',label:'Prepare resource',operations:[{type:'asset',asset:prepared}],documentChanges:{clips},skipHistory:true});return {asset:prepared};
    }catch(error){if(!ctx.signal.aborted){const current=ctx.getDocument();ctx.commit({id:randomUUID(),baseRevision:current.revision,actor:'migration',label:'Resource failed',operations:[{type:'asset',asset:{...current.composition.assets[asset.id],status:'failed'}}],skipHistory:true});}throw error;}
  }
  coordinator.register('asset',prepare,{resource:'prepare',resumable:true});
  coordinator.register('resolve-export',(payload,ctx)=>exportResolveTimeline(payload,ctx,repository.directory(ctx.projectId)),{resource:'export',requiresReady:true,resumable:true});
  coordinator.register('export',async(payload,ctx)=>{
    // The submitted snapshot is immutable even if the live editor continues changing.
    const snapshot=assetPaths(payload.document,repository.directory(ctx.projectId));
    if(Object.values(snapshot.composition.assets).some(asset=>path.resolve(asset.path).toLowerCase()===path.resolve(payload.outputPath).toLowerCase()))throw new Error('Choose an export filename different from a project resource');
    const deleted=snapshot.deletedRanges.flatMap(r=>r.wordIndices);
    const plan=compileComposition(payload.captions==='burn-in'?withCaptions(snapshot.composition,snapshot.words,payload.manifest,deleted):snapshot.composition,payload.manifest,snapshot.words);
    for(const asset of Object.values(plan.document.assets))if(asset.color?.profile&&!asset.normalizedPath||asset.normalizedPath&&!require('node:fs').existsSync(asset.normalizedPath)){const prepared=await service('/composition/prepare',{path:asset.path,kind:asset.kind},ctx);Object.assign(asset,prepared);}
    for(const element of plan.elements)if(element.enabled&&!element.suppressed&&element.assetId){const asset=plan.document.assets[element.assetId];if(asset.status!=='ready')throw new Error(`Resource is ${asset.status}: ${asset.name}`);}
    ctx.progress(1,'Preparing audio');
    const audio=await service('/composition/audio',{plan:plan.audio,assets:plan.document.assets,manifest:plan.manifest,voicePath:snapshot.videoPath,studioSound:payload.studioSound},ctx);
    ctx.progress(5,'Rendering video');
    const render=exportComposition({plan,outputPath:payload.outputPath,width:payload.width,height:payload.height,format:payload.format,audioPath:audio.path},p=>ctx.progress(5+(p.progress||0)*.94,p.stage||'Rendering'));
    const unregister=ctx.registerCancel(()=>render.cancel());
    let result;try{result=await render.result;}finally{unregister();}
    if(payload.captions==='sidecar'){const fs=require('node:fs');const target=payload.outputPath.replace(/\.[^.]+$/,'.srt'),temporary=`${target}.${randomUUID()}.tmp`;fs.writeFileSync(temporary,captionSrt(snapshot.words,plan.manifest,deleted),'utf8');ctx.assertActive();fs.renameSync(temporary,target);}
    return {...result,revision:snapshot.revision,manifestId:plan.manifest.id};
  },{resource:'export',resumable:true});
  return {service,prepare};
}
module.exports={registerMediaJobs};
