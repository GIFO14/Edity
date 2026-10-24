// Shared, data-only tool execution for the internal LLM and external agents.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const {assetPaths}=require('./asset-library'),{compileComposition}=require('../shared/composition-runtime.cjs');
const {exportComposition}=require('./render-worker-manager'),{manifestRequest}=require('./manifest-request');
const {mediaCapabilities}=require('./media-capabilities'),{attachmentPath}=require('./chat-attachments');
const wordRangeEdits=import('../shared/word-range-edits.mjs');
const boundaryTools=import('../shared/edit-boundaries.mjs');
const {saveColorPreset,colorPresetOperation}=require('./color-grade-presets');
const boundaryTypes=new Set(['edit','reviewAudioGaps','saveGradePreset','applyGradePreset','registerLocal','import','inspect','inspectResource','readAttachment']);
async function createMediaActionSession({coordinator,repository,services,editingLibrary,ctx,payload={},external=false}){
  const checkpoint=ctx.initialCheckpoint||{},results=checkpoint.results||[],candidates=new Map(checkpoint.candidates||[]),applied=new Set(checkpoint.applied||[]),inspected=new Set(checkpoint.inspected||[]);
  let blocks=checkpoint.blocks||0,images=checkpoint.images||[],failurePending=!!checkpoint.failurePending;
  const references=checkpoint.references||[],attachments=new Map(),requestId=payload.requestId||ctx.jobId;
  let fontFamilies=[];
  try{fontFamilies=(await services.service('/composition/fonts',{},ctx)).families||[];}
  catch(error){ctx.assertActive();ctx.log({type:'fonts',status:'unavailable',error:String(error.message||error)});}
  const snapshot=()=>({results,candidates:[...candidates],applied:[...applied],inspected:[...inspected],images,blocks,failurePending,references});
  const save=()=>ctx.checkpoint(snapshot());
  const addImages=visual=>{for(const image of visual){images=images.filter(previous=>previous.path!==image.path);images.push(image);}images=images.slice(-12);};
  for(const message of ctx.getDocument().chatMessages||[])for(const a of message.attachments||[]){attachments.set(a.id,a);if(a.kind==='image'){const id=`attachment-candidate-${a.id}`;if(!candidates.has(id))candidates.set(id,{id,name:a.name,kind:'image',path:attachmentPath(repository.directory(ctx.projectId),a)});}}
  const readAttachment=async(attachment,pageIndex,startChar)=>{
    const data=await services.service('/composition/read-reference',{path:attachmentPath(repository.directory(ctx.projectId),attachment),pageIndex,startChar},ctx);
    const visual=(data.images||[]).map(image=>({...image,attachmentId:attachment.id,name:attachment.name}));
    if(data.kind==='image'&&visual.length){const candidate=candidates.get(`attachment-candidate-${attachment.id}`);if(candidate)candidate.inspected=true;}
    addImages(visual);const {images:unused,...content}=data;
    return {attachmentId:attachment.id,name:attachment.name,...content,visuals:visual.map(({path,...metadata})=>metadata)};
  };
  ctx.progress(5,'Reading chat attachments…');
  const currentMessage=[...(ctx.getDocument().chatMessages||[])].reverse().find(message=>message.role==='user'&&(payload.messageId?message.id===payload.messageId:message.text===payload.message));
  for(const attachment of currentMessage?.attachments||[]){const data=await readAttachment(attachment);const index=references.findIndex(r=>r.attachmentId===attachment.id);if(index>=0)references[index]=data;else references.push(data);}
  async function wait(job){if(['failed','cancelled','interrupted'].includes(job.status))job=coordinator.retry(job.id);for(;;){ctx.assertActive();const state=coordinator.get(job.id);if(['complete','partial'].includes(state.status))return state.result;if(['failed','cancelled','interrupted'].includes(state.status))throw new Error(state.error||state.stage);await new Promise(resolve=>setTimeout(resolve,150));}}
  const candidateFile=async(candidate,actionId)=>{
    if(candidate.path)return candidate.path;
    const job=coordinator.start({kind:'download',projectId:ctx.projectId,parentId:ctx.jobId,requestId:`${requestId}:${actionId}:download`,payload:{url:candidate.url,kind:candidate.kind}});
    candidate.path=(await wait(job)).path;save();return candidate.path;
  };
  const summarize=text=>{const d=ctx.getDocument(),reply={id:`reply-${requestId}`,role:'assistant',text:text||'Edició aplicada.',createdAt:new Date().toISOString()},messages=[...(d.chatMessages||[])],index=messages.findIndex(m=>m.id===reply.id);if(index>=0)messages[index]={...messages[index],text:reply.text};else messages.push(reply);ctx.commit({id:`${requestId}:summary:${blocks}:${reply.text}`,baseRevision:d.revision,actor:'ai',label:'AI media edit',groupId:payload.groupId||requestId,skipHistory:external,operations:[],documentChanges:{chatMessages:messages}});};
  async function observe(){
    const observed=ctx.getDocument(),manifest=await services.service('/preview/manifest',manifestRequest(observed),ctx),profile=observed.instructionProfile||{};
    const context={message:payload.message,instructions:observed.aiSettings?.editingInstructions??profile.text??'',mediaInstructions:observed.aiSettings?.mediaInstructions??profile.mediaText??'',customFillerWords:observed.aiSettings?.customFillerWords||'',revision:observed.revision,words:observed.words.map((w,index)=>({...w,index})),deletedIndices:observed.deletedRanges.flatMap(r=>r.wordIndices),soundEvents:observed.soundEvents||[],composition:observed.composition,manifest,selection:payload.selection,mediaFolders:observed.mediaFolders,manualEdits:repository.load(ctx.projectId).entries.filter(e=>e.actor==='manual'&&!e.skipHistory).slice(-20).map(e=>({label:e.label,paths:e.patches.map(p=>p.path)})),history:(observed.chatMessages||[]).filter(m=>['user','assistant'].includes(m.role)).slice(-8).map(m=>({role:m.role,text:m.text})),capabilities:{...mediaCapabilities(observed,{library:editingLibrary?.read(),fontFamilies}),compositionSchema:JSON.parse(fs.readFileSync(path.join(__dirname,'../shared/composition-schema.json'),'utf8')),actionSchema:JSON.parse(fs.readFileSync(path.join(__dirname,'../shared/media-action-schema.json'),'utf8'))}};
    context.attachments=[...attachments.values()].map(({id,name,kind,size})=>({id,name,kind,size,...(kind==='image'?{candidateId:`attachment-candidate-${id}`}:{})}));
    context.editBoundaries=(await boundaryTools).editBoundaries(observed,manifest);
    context.audioAnalysis={soundScans:observed.processing?.soundScans||null,note:'Acoustic events are possible audible gaps, not proof of omitted speech or a recognized noise class; keep uncertain speech.'};
    context.references=references;context.visualInputs=images.map(({path,...metadata},index)=>({imageIndex:index,...metadata}));context.inspectedAssetIds=[...inspected];
    return {observed,manifest,context};
  }
  function failure(action,error){results.push({actionId:action?.id,type:action?.type||'invalidTurn',error:String(error.message||error),...(error.code?{code:error.code}:{})});failurePending=true;save();}
  async function execute(action,{observed,manifest}){
    ctx.assertActive();
    if(applied.has(action.id))return {duplicate:true,result:results.find(r=>r.actionId===action.id)?.result,done:action.type==='done'};
    // The journal may have committed just before a process stopped, before its
    // tool checkpoint was written. Recover that acknowledgement without applying
    // word indices to a transcript which may have since changed manually.
    const committed=['edit','reviewAudioGaps','applyGradePreset'].includes(action.type)?repository.load(ctx.projectId).dedup?.get(`${requestId}:${action.id}`):undefined;
    if(committed!==undefined){const result={revision:committed,applied:true,duplicate:true};applied.add(action.id);results.push({actionId:action.id,type:action.type,result});failurePending=false;save();return {duplicate:true,result,done:false};}
    try{
      let result;
      if(action.type==='done'){if(failurePending)throw new Error('An action failed; correct it before finishing');summarize(action.summary);applied.add(action.id);save();return {done:true,result:{summary:action.summary}};}
      if(action.type==='observe')result={revision:ctx.getDocument().revision,composition:ctx.getDocument().composition};
      else if(action.type==='reviewAudioGaps'){
        const events=[];
        for(const clip of observed.clips||[]){
          ctx.assertActive();ctx.progress(12,'Reviewing acoustic gaps against existing speech…');
          const localWords=observed.words.filter(w=>w.clipId===clip.id).map(w=>({...w,start:w.start-clip.start,end:w.end-clip.start}));
          const scan=await services.service('/composition/review-audio-gaps',{path:clip.path,words:localWords,language:observed.processing?.language||'en'},ctx);
          events.push(...scan.events.map(e=>({...e,id:`${clip.id}-${e.id}`,clipId:clip.id,start:e.start+clip.start,end:e.end+clip.start})));
        }
        ctx.assertActive();
        const retained=(observed.soundEvents||[]).filter(e=>e.source!=='acoustic'||e.markedForRemoval||e.reviewed||e.decision);
        // A prior human decision wins over a recomputed review annotation.
        const additions=events.filter(e=>!retained.some(r=>r.source==='acoustic'&&r.start<e.end&&e.start<r.end));
        const soundEvents=[...retained,...additions].sort((a,b)=>a.start-b.start);
        const ack=ctx.commit({id:`${requestId}:${action.id}`,baseRevision:observed.revision,actor:'ai',label:'Review acoustic gap annotations',groupId:payload.groupId||requestId,operations:[],documentChanges:{soundEvents}});
        blocks++;failurePending=false;result={revision:ack.revision,previousEvents:(observed.soundEvents||[]).length,events:soundEvents.length,applied:true};
      }else if(action.type==='saveGradePreset'){
        result={preset:saveColorPreset(editingLibrary,action,`${requestId}:${action.id}`)};failurePending=false;
      }else if(action.type==='applyGradePreset'){
        const current=ctx.getDocument(),{preset,operation}=colorPresetOperation(editingLibrary,current,action);
        const ack=ctx.commit({id:`${requestId}:${action.id}`,baseRevision:current.revision,actor:'ai',label:`Apply color preset: ${preset.name}`,groupId:payload.groupId||requestId,operations:[operation]});
        blocks++;result={revision:ack.revision,presetId:preset.id,presetRevision:preset.revision,applied:true};failurePending=false;
      }else if(action.type==='registerLocal'){
        if(typeof action.path!=='string'||!path.isAbsolute(action.path)||!['image','video','audio','font'].includes(action.kind))throw new Error('Provide an absolute local media path and kind');
        const data=await services.service('/composition/validate-candidates',{candidates:[{name:path.basename(action.path),kind:action.kind,path:action.path}]},ctx);
        result={candidates:(data.candidates||[]).map(c=>({...c,id:`candidate-local-${action.id}`}))};
        for(const candidate of result.candidates)candidates.set(candidate.id,candidate);
        failurePending=false;
      }else if(action.type==='searchLocal'||action.type==='searchWeb'){
        if(external&&action.type==='searchWeb'){const error=new Error('Use your own web search, then candidates.register; external tools never invoke another LLM');error.code='USE_CLIENT_WEB_SEARCH';throw error;}
        ctx.progress(12,action.type==='searchLocal'?'Finding local resources…':'Finding web resources…');
        result=await services.service(action.type==='searchLocal'?'/composition/search-local':'/composition/search-web',{query:action.query||'',kind:action.kind,folders:observed.mediaFolders||{}},ctx);
        for(const c of result.candidates||[]){const id=`candidate-${action.id}-${c.id||randomUUID()}`;c.id=id;candidates.set(id,c);}
      }else if(action.type==='readAttachment'){
        const attachment=attachments.get(action.attachmentId);if(!attachment)throw new Error('Choose an attachment ID from context.attachments');
        result=await readAttachment(attachment,action.pageIndex,action.startChar||0);failurePending=false;
      }else if(action.type==='inspectResource'){
        const candidate=action.candidateId?candidates.get(action.candidateId):null,asset=action.assetId?ctx.getDocument().composition.assets[action.assetId]:null;
        if(!candidate&&!asset)throw new Error('Choose a listed candidateId or an existing assetId');
        const file=candidate?await candidateFile(candidate,action.id):path.resolve(repository.directory(ctx.projectId),asset.path);
        ctx.progress(12,'Inspecting visual resource…');
        const data=await services.service('/composition/inspect-resource',{path:file,timeUs:action.timeUs},ctx);
        if(!(data.images||[]).length)throw new Error('Resource inspection returned no image');
        const visual=data.images.map(image=>({...image,name:(candidate||asset).name,...(candidate?{candidateId:candidate.id}:{assetId:asset.id})}));
        addImages(visual);const {images:unused,...metadata}=data;result={...metadata,...(candidate?{candidateId:candidate.id}:{assetId:asset.id}),visuals:visual.map(({path,...metadata})=>metadata)};
        if(candidate)candidate.inspected=true;else inspected.add(asset.id);failurePending=false;
      }else if(action.type==='import'){
        const candidate=candidates.get(action.candidateId);if(!candidate)throw new Error('Choose a candidate ID returned by a search');
        if(['image','video'].includes(candidate.kind)&&!candidate.inspected)throw new Error('Inspect this candidate with inspectResource before choosing/importing it');
        const file=await candidateFile(candidate,action.id),job=coordinator.start({kind:'asset',projectId:ctx.projectId,parentId:ctx.jobId,requestId:`${requestId}:${action.id}:prepare`,payload:{path:file,kind:candidate.kind,displayName:candidate.name,provenance:candidate.url?{source:'web',url:candidate.url,pageUrl:candidate.pageUrl,license:candidate.license}:{source:'local'}}});
        result=await wait(job);if(candidate.inspected)inspected.add(result.asset.id);failurePending=false;
      }else if(action.type==='edit'){
        const changes={},operations=(action.operations||[]).map(op=>op.type==='add'?{...op,element:{...op.element,createdBy:'ai'}}:op);
        for(const op of operations){const assetId=op.type==='add'&&['image','video'].includes(op.element.kind)?op.element.assetId:op.type==='update'?op.changes?.assetId:null,asset=observed.composition.assets[assetId];if(asset&&['image','video'].includes(asset.kind)&&!inspected.has(assetId)&&assetId!=='baseAsset')throw new Error(`Inspect asset ${assetId} with inspectResource before choosing it`);}
        const {isValidWordRange,restoreMarkedWordRanges}=await wordRangeEdits;
        for(const range of [...(action.deleteRanges||[]),...(action.cutBoundaries||[])]){
          if(range.cutStartUs===undefined&&range.cutEndUs===undefined)continue;
          const duration=observed.composition.assets?.[observed.composition.elements?.base?.assetId]?.durationUs||Math.round(Math.max(0,...(observed.clips||[]).map(c=>c.start+c.duration),observed.words.at(-1)?.end||0)*1e6);
          for(const key of ['cutStartUs','cutEndUs'])if(range[key]!==undefined&&range[key]!==null&&(!Number.isSafeInteger(range[key])||range[key]<0||range[key]>duration))throw new Error('Explicit cut boundary must be inside the current processed source base');
          if(range.cutStartUs!==undefined&&range.cutEndUs!==undefined&&range.cutEndUs<=range.cutStartUs)throw new Error('Explicit cut boundaries must be ordered');
        }
        if(action.deleteRanges?.length){const marked=new Set(observed.deletedRanges.flatMap(r=>r.wordIndices)),additions=[];for(const range of action.deleteRanges){if(!isValidWordRange(range,observed.words.length))throw new Error('Invalid word range');let indices=[];const flush=()=>{if(indices.length){additions.push({id:`dr-${randomUUID()}`,start:observed.words[indices[0]].start,end:observed.words[indices.at(-1)].end,wordIndices:indices,...(range.cutStartUs!==undefined&&indices[0]===range.startIndex?{cutStart:range.cutStartUs/1e6}:{}),...(range.cutEndUs!==undefined&&indices.at(-1)===range.endIndex?{cutEnd:range.cutEndUs/1e6}:{})});indices=[];}};for(let i=range.startIndex;i<=range.endIndex;i++){if(marked.has(i)){flush();continue;}indices.push(i);marked.add(i);}flush();}changes.deletedRanges=[...observed.deletedRanges,...additions];}
        if(action.restoreRanges?.length)changes.deletedRanges=restoreMarkedWordRanges(observed.words,changes.deletedRanges||observed.deletedRanges,action.restoreRanges,()=>`dr-${randomUUID()}`);
        if(action.cutBoundaries?.length){let ranges=structuredClone(changes.deletedRanges||observed.deletedRanges);for(const boundary of action.cutBoundaries){const range=ranges.find(r=>r.id===boundary.rangeId);if(!range)throw new Error('Choose a current deleted range ID');if(boundary.cutStartUs!==undefined)range.cutStart=boundary.cutStartUs/1e6;if(boundary.cutEndUs!==undefined)range.cutEnd=boundary.cutEndUs/1e6;const start=range.cutStart??range.start,end=range.cutEnd??range.end;if(end<=start)throw new Error('Cut boundaries must be ordered');}changes.deletedRanges=ranges;}
        if(action.soundActions?.length){const decisions=new Map(action.soundActions.map(d=>[d.id,d.action]));changes.soundEvents=(observed.soundEvents||[]).map(e=>decisions.has(e.id)?{...e,markedForRemoval:decisions.get(e.id)==='remove',reviewed:true}:e);}
        const ack=ctx.commit({id:`${requestId}:${action.id}`,baseRevision:observed.revision,actor:'ai',label:'AI media edit',groupId:payload.groupId||requestId,operations,documentChanges:changes});blocks++;failurePending=false;result={revision:ack.revision,applied:true};
      }else if(action.type==='inspect'){
        const current=assetPaths(ctx.getDocument(),repository.directory(ctx.projectId)),plan=compileComposition(current.composition,manifest,current.words),directory=path.join(repository.directory(ctx.projectId),'.cache');fs.mkdirSync(directory,{recursive:true});
        const outputPath=path.join(directory,`inspect-${requestId.replace(/[^a-z0-9-]/gi,'').slice(0,60)}-${action.id.replace(/[^a-z0-9-]/gi,'').slice(0,60)}.png`);
        const render=exportComposition({plan,outputPath,width:960,height:Math.round(960*plan.document.canvas.height/plan.document.canvas.width),capture:true,atUs:Math.min(plan.manifest.durationUs-1,action.timeUs||0)}),unregister=ctx.registerCancel(()=>render.cancel());try{await render.result;}finally{unregister();}
        addImages([{path:outputPath,kind:'composition',timeUs:action.timeUs||0}]);result={captured:true,timeUs:action.timeUs||0};failurePending=false;
      }else throw new Error('Unsupported action');
      applied.add(action.id);results.push({actionId:action.id,type:action.type,result,...(action.note?{note:action.note}:{})});ctx.log({actionId:action.id,type:action.type,status:'complete'});save();return {result,done:false};
    }catch(error){ctx.assertActive();failure(action,error);ctx.log({actionId:action.id,type:action.type,status:'failed',error:String(error)});throw error;}
  }
  return {observe,execute,summarize,snapshot,failure,boundaryTypes,get results(){return results;},get blocks(){return blocks;},get images(){return images;}};
}
module.exports={createMediaActionSession};
