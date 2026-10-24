const fs=require('node:fs'),path=require('node:path'),{randomUUID,createHash}=require('node:crypto');
const {AgentStateStore,hash,legacyHash}=require('./agent-state-store'),{bridgeError}=require('./local-agent-bridge');
const {normalizeSources}=require('./reconciled-transcript'),{createMediaActionSession}=require('./media-action-dispatcher');
const {assetPaths}=require('./asset-library'),{manifestRequest}=require('./manifest-request'),{mediaCapabilities}=require('./media-capabilities');
const {importAttachment}=require('./chat-attachments'),{prepareProjectAssets}=require('./project-asset-preparation');
const {compileComposition}=require('../shared/composition-runtime.cjs');
const {narrationCommands}=require('./narration-commands');
const {listColorPresets,saveColorPreset,colorPresetOperation}=require('./color-grade-presets');
const actionTypes=['observe','searchLocal','registerLocal','import','edit','reviewAudioGaps','saveGradePreset','applyGradePreset','inspect','inspectResource','readAttachment','done'];
function createExternalAgentTools({store,repository,coordinator,services,processingJobs,editingLibrary,projectDefaults,stateDirectory,artifacts=new Map(),showProject}){
  const states=new AgentStateStore(stateDirectory);
  const narration=narrationCommands(repository);
  const document=id=>{try{return repository.getDocument(id);}catch(error){if(/not found|ENOENT|Invalid project ID/i.test(error.message))throw bridgeError('NOT_FOUND','Project not found');throw error;}};
  const expected=(d,revision)=>{if(!Number.isSafeInteger(revision)||revision<0)throw bridgeError('INVALID_DATA','Supply a non-negative expectedRevision');if(d.revision!==revision)throw bridgeError('REVISION_CONFLICT','Reload context before editing',{actualRevision:d.revision,expectedRevision:revision});};
  const ready=d=>{if(d.processing&&d.processing.status!=='done'||!d.videoPath)throw bridgeError('PROJECT_NOT_READY','Wait for original source preparation to complete',{processing:d.processing});};
  const context=projectId=>({projectId,jobId:`bridge-${randomUUID()}`,signal:new AbortController().signal,assertActive:()=>{},registerCancel:()=>()=>{},getDocument:()=>document(projectId),progress:()=>{},log:()=>{}});
  const service=(route,params={},projectId)=>services.service(route,params,context(projectId));
  const exposeImages=images=>images.map((image,index)=>{const id=hash({path:path.resolve(image.path),mtime:fs.existsSync(image.path)?fs.statSync(image.path).mtimeMs:0}).slice(0,32),artifact={...image,artifactId:id,imageIndex:index,mimeType:'image/png',url:`/v1/artifacts/${id}`};artifacts.set(id,artifact);return artifact;});
  const session=id=>states.read('session',id);
  const sameProject=(s,id)=>{if(s.projectId!==id)throw bridgeError('INVALID_DATA','Session belongs to another project');};
  const ack=transaction=>repository.commit(transaction);
  const applied=(saved,action)=>saved.checkpoint.applied?.includes(action.id)||repository.load(saved.projectId).dedup.has(`${saved.requestId}:${action.id}`)||(action.type==='import'&&coordinator.list(saved.projectId).some(j=>j.requestId===`${saved.requestId}:${action.id}:prepare`&&j.status==='complete'));
  coordinator.register('agent-action',async(payload,ctx)=>{
    const saved=session(payload.sessionId);sameProject(saved,ctx.projectId);states.assertAvailable(saved.id);states.active.add(saved.id);
    try{
      const d=ctx.getDocument();if(payload.expectedRevision!==undefined&&!applied(saved,payload.action))expected(d,payload.expectedRevision);
      const originalCheckpoint=ctx.checkpoint;
      const toolContext={...ctx,initialCheckpoint:saved.checkpoint,
        commit:transaction=>{if(['edit','applyGradePreset'].includes(payload.action.type)&&payload.expectedRevision!==undefined&&!applied(saved,payload.action))expected(ctx.getDocument(),payload.expectedRevision);return ctx.commit(transaction);},
        checkpoint:value=>{saved.checkpoint=structuredClone(value);states.write('session',saved.id,saved);originalCheckpoint(value);}};
      const dispatcher=await createMediaActionSession({coordinator,repository,services,editingLibrary,ctx:toolContext,payload:{requestId:saved.requestId,groupId:payload.groupId},external:true});
      const observation=await dispatcher.observe();
      if(payload.expectedRevision!==undefined&&!applied(saved,payload.action))expected(ctx.getDocument(),payload.expectedRevision);
      const executed=await dispatcher.execute(payload.action,observation);
      saved.checkpoint=dispatcher.snapshot();saved.actionFingerprints={...saved.actionFingerprints,[payload.action.id]:hash(payload.action)};states.write('session',saved.id,saved);
      return {sessionId:saved.id,type:payload.action.type,result:executed.result,duplicate:!!executed.duplicate,done:!!executed.done,revision:ctx.getDocument().revision,visualInputs:exposeImages(dispatcher.images)};
    }finally{states.active.delete(saved.id);}
  },{resource:'ai',requiresReady:true,resumable:true});
  const methods={
    'colorPresets.list':()=>({presets:listColorPresets(editingLibrary)}),
    'colorPresets.save':params=>states.once('colorPresets.save',params,key=>{
      try{return {preset:saveColorPreset(editingLibrary,params,`agent-color-preset-${key}`)};}catch(error){if(error.code==='REVISION_CONFLICT')throw error;throw bridgeError('INVALID_DATA',error.message);}
    }),
    'colorPresets.apply':params=>states.once('colorPresets.apply',params,key=>{
      const d=document(params.projectId),id=`agent-color-apply-${key}`;
      if(repository.load(d.id).dedup.has(id))return repository.commit({id,projectId:d.id});
      ready(d);expected(d,params.expectedRevision);
      try{const {preset,operation}=colorPresetOperation(editingLibrary,d,params);return ack({id,projectId:d.id,baseRevision:d.revision,actor:'ai',label:`Apply color preset: ${preset.name}`,operations:[operation]});}catch(error){if(error.code==='REVISION_CONFLICT')throw error;throw bridgeError('INVALID_DATA',error.message);}
    }),
    'narration.get':params=>narration.get(params.projectId),
    'narration.copyText':params=>narration.copyText(params.projectId,params.wordIds),
    ...Object.fromEntries(['move','cut','paste'].map(kind=>[`narration.${kind}`,params=>states.once(`narration.${kind}`,params,key=>{try{return narration.mutate(kind,params,{transactionId:`agent-narration-${key}`});}catch(error){if(error.code==='REVISION_CONFLICT')throw error;throw bridgeError('INVALID_DATA',error.message);}})])),
    'defaults.get':async()=>{if(!projectDefaults)throw bridgeError('INVALID_DATA','This instance does not support desktop import defaults');const defaults=await projectDefaults.wait(),profiles=Object.values(editingLibrary?.read().profiles||{});return {...defaults,instructionRecovery:{needsReview:defaults.source==='migrated-desktop-preferences'&&!Object.values(defaults.aiSettings).some(Boolean)&&profiles.some(p=>p.text),candidates:profiles.filter(p=>p.text).map(p=>({profileId:p.id,name:p.name,revision:p.revision,editingInstructions:p.text,mediaInstructions:p.mediaText}))}};},
    'capabilities.get':async params=>{
      const d=params.projectId?document(params.projectId):{composition:{assets:{},presetVariants:{}}},fontFamilies=(await service('/composition/fonts')).families||[],instructions=await service('/composition/agent-instructions');
      return {...mediaCapabilities(d,{library:editingLibrary?.read(),fontFamilies}),protocolVersion:1,workflow:{normalImportUsesGlobalDefaults:!!projectDefaults,processCreatesFreshTranscript:true,externalAgentDoesCleanup:true,passageReordering:true,clipReordering:false,narrationMove:true,narrationCutPaste:true,copyAudio:false,explicitCutBoundaries:true,silenceCutProvenance:true,untranscribedAudioReview:true,visionSampling:'on-demand'},projectDefaults:projectDefaults?await projectDefaults.wait():null,anchorPolicy:{membershipField:'memberWordIds',endpointDeletion:'remaining-original-members',completeDeletion:'suppressed-preserve-object',interiorDeletion:'compress-kept-coverage',disjointMembers:'separate-active-spans',sourcePhase:'continuous-through-kept-coverage'},methods:[...Object.keys(methods),'instance.info','instance.close'],actionTypes,agentInstructions:instructions.instructions+' External bridge: the advertised actionTypes list is authoritative. Use your own web search followed by candidates.register instead of the internal searchWeb action. External tool execution and preparation do not invoke another LLM. Normal imports use the desktop defaults and produce a new processed transcript. Clean retakes and filler words with that transcript and its effective cleanupInstructions; do not inject old ASR or copy original timing into the processed base. Prefer speech member anchors for B-roll/text which must follow later cuts; Use narration.move/cut/paste to reorder existing passages once, preserving word identities. Copy text does not duplicate audio.',schemas:Object.fromEntries(['composition','media-action','transaction','operation','project-v2','cut-manifest'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(__dirname,`../shared/${name}-schema.json`),'utf8'))])),externalWebSearch:'Use the external agent web search and candidates.register; no additional LLM is invoked.'};
    },
    'projects.list':params=>{const offset=params.offset??0,limit=params.limit??50;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)throw bridgeError('INVALID_DATA','Invalid project pagination');const all=store.list();return {projects:all.slice(offset,offset+limit),nextOffset:offset+limit<all.length?offset+limit:null};},
    'projects.open':async params=>{const d=document(params.projectId);prepareProjectAssets(coordinator,repository,d);if(params.show)await showProject?.(d.id);return {document:d,jobs:coordinator.list(d.id)};},
    'projects.create':params=>states.once('projects.create',params,async key=>{
      const mode=params.mode||'process';if(!['reconciled','process'].includes(mode))throw bridgeError('INVALID_DATA','Choose reconciled or process mode');
      if(!projectDefaults)throw bridgeError('INVALID_DATA','Desktop import defaults are unavailable');await projectDefaults.wait();
      const sources=normalizeSources(params.sources,mode);let options;try{options=projectDefaults.options(params.options||{});}catch(error){throw bridgeError('INVALID_DATA',error.message);}
      const project=store.createPending(sources.map(s=>s.path),{...options,title:params.title,managedId:`agent-${key.slice(0,32)}`}),d=document(project.id);
      const id=`agent-create-${key}`;
      if(!repository.load(project.id).dedup.has(id))ack({id,projectId:project.id,baseRevision:d.revision,actor:'migration',label:'Import source recordings',skipHistory:true,operations:[],documentChanges:{processing:{...d.processing,inputMode:mode,sourceMetadata:sources,skipTranscriptCleanup:true}}});
      const job=processingJobs.ensure(project.id);if(params.show!==false)await showProject?.(project.id);return {projectId:project.id,jobId:job?.id||coordinator.list(project.id).find(j=>j.kind==='process-project')?.id,defaultsRevision:options.defaultsRevision,mode};
    }),
    'projects.configure':params=>states.once('projects.configure',params,key=>{
      const d=document(params.projectId),id=`agent-configure-${key}`;if(repository.load(d.id).dedup.has(id))return ack({id,projectId:d.id});expected(d,params.expectedRevision);
      if(!params.changes||Array.isArray(params.changes)||Object.keys(params.changes).some(k=>!['title','mediaFolders','aiSettings','instructionProfile'].includes(k)))throw bridgeError('INVALID_DATA','Unsupported project configuration field');
      const changes=params.changes;
      if(changes.title!==undefined&&(typeof changes.title!=='string'||!changes.title.trim()||changes.title.length>120||/[\r\n]/.test(changes.title)))throw bridgeError('INVALID_DATA','Title needs 1–120 characters');
      if(changes.mediaFolders!==undefined&&(!changes.mediaFolders||Array.isArray(changes.mediaFolders)||Object.entries(changes.mediaFolders).some(([k,v])=>!['image','broll','music'].includes(k)||typeof v!=='string'||v&&!path.isAbsolute(v))))throw bridgeError('INVALID_DATA','Media folders must be absolute paths or empty strings');
      if(changes.aiSettings!==undefined&&(!changes.aiSettings||Array.isArray(changes.aiSettings)||Object.entries(changes.aiSettings).some(([k,v])=>!['editingInstructions','mediaInstructions','customFillerWords'].includes(k)||typeof v!=='string')))throw bridgeError('INVALID_DATA','AI settings must be instruction strings');
      return ack({id,projectId:d.id,baseRevision:d.revision,actor:'ai',label:'Agent project configuration',operations:[],documentChanges:params.changes});
    }),
    'sessions.open':params=>states.once('sessions.open',params,key=>{const d=document(params.projectId),s=states.open(d.id,key);return {sessionId:s.id,projectId:d.id,revision:d.revision};}),
    'context.get':async params=>{
      const d=document(params.projectId),s=params.sessionId?session(params.sessionId):null;if(s)sameProject(s,d.id);
      const offset=params.wordOffset??0,limit=params.wordLimit??200;if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>500)throw bridgeError('INVALID_DATA','Invalid word pagination');
      const state=s?.checkpoint||{},profile=d.instructionProfile||{},clipMap=new Map(d.clips.map(c=>[c.id,c]));
      const words=d.words.slice(offset,offset+limit).map((w,i)=>{const clip=clipMap.get(w.clipId),a=w.sourceStartUs??Math.round((w.start-(clip?.start||0))*1e6),b=w.sourceEndUs??Math.round((w.end-(clip?.start||0))*1e6);
        const originalSourceIntervals=clip?.sourceMap?clip.sourceMap.segments.flatMap(s=>{const start=Math.max(a,s.processedStartUs),end=Math.min(b,s.processedEndUs);if(end<=start)return [];const ratio=(s.originalEndUs-s.originalStartUs)/(s.processedEndUs-s.processedStartUs);return [{startUs:Math.round(s.originalStartUs+(start-s.processedStartUs)*ratio),endUs:Math.round(s.originalStartUs+(end-s.processedStartUs)*ratio)}];}):clip?.preservesOriginalTiming?[{startUs:a,endUs:b}]:null;
        return {...w,index:offset+i,startUs:Math.round(w.start*1e6),endUs:Math.round(w.end*1e6),sourceStartUs:a,sourceEndUs:b,sourceIndex:w.sourceIndex??clip?.sourceIndex,originalSourceIntervals,timebase:clip?.preservesOriginalTiming?'original-clip':'processed-clip'};});
      const attachments=[...new Map((d.chatMessages||[]).flatMap(m=>(m.attachments||[]).map(a=>[a.id,a]))).values()].map(a=>({...a,...(a.kind==='image'?{candidateId:`attachment-candidate-${a.id}`}:{})}));
      const globalDefaults=projectDefaults?await projectDefaults.wait():null,cleanupInstructions={editingInstructions:d.aiSettings?.editingInstructions??profile.text??globalDefaults?.aiSettings.editingInstructions??'',customFillerWords:d.aiSettings?.customFillerWords??globalDefaults?.aiSettings.customFillerWords??'',source:'effective-project-instructions',defaultsRevisionAtCreation:d.processing?.defaultsRevision};
      const manifest=params.includeManifest===false||d.processing&&d.processing.status!=='done'?null:await service('/preview/manifest',manifestRequest(d),d.id);
      for(const word of words){word.acousticTiming=manifest?.wordTimings?.[word.id]||null;word.timingAccuracy=word.acousticTiming?'local-forced-alignment':'approximate-asr';}
      const resolvedAnchors=manifest?compileComposition(d.composition,manifest,d.words).elements.filter(e=>e.placement.kind==='speech').map(e=>({elementId:e.id,memberWordIds:e.placement.memberWordIds,suppressed:e.suppressed,startUs:e.startUs,endUs:e.endUs,activeSpans:e.activeSpans,activeDurationUs:e.activeDurationUs})):null;
      const editBoundaries=(await import('../shared/edit-boundaries.mjs')).editBoundaries(d,manifest);
      return {projectId:d.id,title:d.title,revision:d.revision,transcriptRevision:d.transcriptRevision,processing:d.processing,ready:!d.processing||d.processing.status==='done',transcriptAuthority:d.processing?.inputMode==='reconciled'?'provided-original-asr':'edity-processed-transcript',wordOffset:offset,wordCount:d.words.length,nextWordOffset:offset+limit<d.words.length?offset+limit:null,words,segments:d.segments.map(({words,...v})=>v),clips:d.clips.map(c=>({...c,startUs:Math.round(c.start*1e6),durationUs:Math.round(c.duration*1e6)})),sourceMaps:d.clips.map(c=>({clipId:c.id,sourceIndex:c.sourceIndex,sourceId:c.sourceId,originalPath:c.sourcePath,originalSha256:c.sourceSha256,baseStartUs:Math.round(c.start*1e6),processedDurationUs:Math.round(c.duration*1e6),mapping:c.sourceMap||null})),globalDefaults,cleanupInstructions,resolvedAnchors,editBoundaries,audioAnalysis:{soundScans:d.processing?.soundScans||null,unclassifiedEvents:(d.soundEvents||[]).filter(e=>e.source==='acoustic'),note:'Unknown sound classification is not proof of silence; acoustic events are preserved for review.'},narration:narration.get(d.id),originalWordIds:d.words.map(w=>w.id),deletedIndices:d.deletedRanges.flatMap(r=>r.wordIndices),deletedRanges:d.deletedRanges,soundEvents:d.soundEvents||[],instructions:d.aiSettings?.editingInstructions??profile.text??'',mediaInstructions:d.aiSettings?.mediaInstructions??profile.mediaText??'',mediaFolders:d.mediaFolders,attachments,references:state.references||[],candidates:(state.candidates||[]).map(([,c])=>c),results:(state.results||[]).slice(-30),inspectedAssetIds:state.inspected||[],visualInputs:exposeImages(state.images||[]),...(params.includeComposition===false?{}:{composition:d.composition}),...(params.includeManifest===false?{}:{manifest})};
    },
    'attachments.add':params=>states.once('attachments.add',params,async key=>{
      const d=document(params.projectId),id=`agent-attachment-${key}`;if(repository.load(d.id).dedup.has(id)){const a=d.chatMessages.find(m=>m.id===id)?.attachments[0];return {attachment:a,revision:d.revision};}expected(d,params.expectedRevision);
      const attachment=await importAttachment(repository,d.id,{path:params.path,name:params.name});
      expected(document(d.id),params.expectedRevision);
      const result=ack({id,projectId:d.id,baseRevision:d.revision,actor:'ai',label:'Attach agent editing reference',operations:[],documentChanges:{chatMessages:[...(d.chatMessages||[]),{id,role:'user',text:'Editing reference supplied by the external agent.',attachments:[attachment],createdAt:new Date().toISOString()}]}});return {attachment,revision:result.revision};
    }),
    'candidates.register':params=>states.once('candidates.register',params,async key=>{
      const saved=session(params.sessionId);document(saved.projectId);states.assertAvailable(saved.id);states.active.add(saved.id);
      try{let result;try{result=await service('/composition/validate-candidates',{candidates:params.candidates},saved.projectId);}catch(error){throw bridgeError('INVALID_DATA',error.message);}const candidates=result.candidates.map((c,i)=>({...c,id:`candidate-agent-${key.slice(0,24)}-${i}`}));saved.checkpoint.candidates=[...(saved.checkpoint.candidates||[]),...candidates.map(c=>[c.id,c])];states.write('session',saved.id,saved);return {candidates};}finally{states.active.delete(saved.id);}
    }),
    'actions.execute':params=>states.once('actions.execute',params,async key=>{
      const saved=session(params.sessionId),d=document(saved.projectId);
      if(!params.action||!actionTypes.includes(params.action.type))throw bridgeError('ACTION_INVALID','Choose an advertised direct action; external execution never invokes an LLM');
      let validated;try{validated=await service('/composition/validate-actions',{actions:[params.action]},d.id);}catch(error){throw bridgeError('ACTION_INVALID',error.message);}
      const action=validated.actions[0];
      states.assertAvailable(saved.id);const latest=session(saved.id);
      if(latest.actionFingerprints?.[action.id]&&latest.actionFingerprints[action.id]!==hash(action)&&latest.actionFingerprints[action.id]!==legacyHash(action))throw bridgeError('IDEMPOTENCY_CONFLICT','Action ID already describes another action');
      if(!applied(latest,action)&&(['import','edit','reviewAudioGaps','applyGradePreset'].includes(action.type)||params.expectedRevision!==undefined))expected(document(d.id),params.expectedRevision);
      if(params.groupId!==undefined&&(typeof params.groupId!=='string'||!params.groupId.length||params.groupId.length>200))throw bridgeError('INVALID_DATA','Invalid edit group ID');
      latest.actionFingerprints={...latest.actionFingerprints,[action.id]:hash(action)};states.write('session',latest.id,latest);
      const job=coordinator.start({kind:'agent-action',projectId:d.id,requestId:`agent-action-${key}`,payload:{sessionId:saved.id,action,expectedRevision:params.expectedRevision,groupId:params.groupId||`agent-action-${key}`}});return {jobId:job.id,status:job.status};
    }),
    'jobs.get':params=>{try{return coordinator.get(params.jobId);}catch{throw bridgeError('NOT_FOUND','Job not found');}},
    'jobs.list':params=>{document(params.projectId);return {jobs:coordinator.list(params.projectId)};},
    'jobs.cancel':params=>coordinator.cancel(params.jobId),
    'jobs.retry':params=>coordinator.retry(params.jobId),
    'history.undo':params=>states.once('history.undo',params,key=>{const d=document(params.projectId),id=`agent-undo-${key}`;if(!repository.load(d.id).dedup.has(id))expected(d,params.expectedRevision);return repository.history(d.id,'undo',{transactionId:id});}),
    'history.redo':params=>states.once('history.redo',params,key=>{const d=document(params.projectId),id=`agent-redo-${key}`;if(!repository.load(d.id).dedup.has(id))expected(d,params.expectedRevision);return repository.history(d.id,'redo',{transactionId:id});}),
    'exports.prepare':params=>states.once('exports.prepare',params,async key=>{
      const d=document(params.projectId);ready(d);expected(d,params.expectedRevision);const documentSnapshot=assetPaths(d,repository.directory(d.id)),manifest=await service('/preview/manifest',manifestRequest(d),d.id),snapshotId=key.slice(0,32);
      states.write('snapshot',snapshotId,{snapshotId,projectId:d.id,document:documentSnapshot,manifest,revision:d.revision});return {snapshotId,revision:d.revision,durationUs:manifest.durationUs,canvas:d.composition.canvas};
    }),
    'exports.start':params=>states.once('exports.start',params,key=>{
      const snapshot=states.read('snapshot',params.snapshotId);document(snapshot.projectId);if(typeof params.outputPath!=='string'||!path.isAbsolute(params.outputPath))throw bridgeError('INVALID_DATA','Export outputPath must be absolute');
      const kind=params.kind||'video';if(!['video','resolve'].includes(kind))throw bridgeError('INVALID_DATA','Choose video or resolve export');
      const width=params.width??snapshot.document.composition.canvas.width,height=params.height??snapshot.document.composition.canvas.height;if(!Number.isSafeInteger(width)||width<2||width>7680||!Number.isSafeInteger(height)||height<2||height>4320)throw bridgeError('INVALID_DATA','Invalid export dimensions');
      if(!['mp4','webm','mov'].includes(params.format||'mp4')||!['none','burn-in','sidecar'].includes(params.captions||'none'))throw bridgeError('INVALID_DATA','Unsupported export format/captions');
      const job=coordinator.start({kind:kind==='resolve'?'resolve-export':'export',projectId:snapshot.projectId,requestId:`agent-export-${key}`,payload:{document:snapshot.document,manifest:snapshot.manifest,outputPath:params.outputPath,width,height,format:params.format||'mp4',studioSound:params.studioSound===true,captions:params.captions||'none',copyMedia:true}});return {jobId:job.id,status:job.status};
    }),
  };
  return {methods,states,artifacts};
}
module.exports={createExternalAgentTools};
