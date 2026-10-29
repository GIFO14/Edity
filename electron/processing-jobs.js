const fs=require('node:fs');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {pythonJob}=require('./python-job');const {importAsset}=require('./asset-library');const {wordIds}=require('./composition-migration');
function registerProcessingJobs(coordinator,repository,services){
  coordinator.register('process-project',async(payload,ctx)=>{
    let project=ctx.getDocument();const config=project.processing||payload.config;
    if(!config)throw new Error('Missing processing settings');
    const directory=repository.directory(ctx.projectId),work=path.join(directory,'.cache',`processing-${ctx.jobId}`);fs.mkdirSync(work,{recursive:true});
    const groupId=`processing-${ctx.jobId}`;
    const commit=(changes,operations=[])=>{const d=ctx.getDocument();return ctx.commit({id:randomUUID(),baseRevision:d.revision,actor:'migration',label:'Prepare project',groupId,operations,documentChanges:changes,skipHistory:true}).document;};
    let lastProgress=0;
    const progress=(n,stage)=>{ctx.progress(n,stage);if(Date.now()-lastProgress>750){lastProgress=Date.now();const d=ctx.getDocument();commit({processing:{...d.processing,status:'running',stage,progress:n}});}};
    commit({processing:{...config,status:'running',stage:'Preparing video',error:''}});
    try{
      for(let index=config.nextIndex||0;index<config.sources.length;index++){
        ctx.assertActive();const source=config.sources[index];let prepared=source,sourceMap=null,originalHash=config.sourceMetadata?.[index]?.sha256;
        if(config.sourceMetadata?.[index]?.sha256){
          const digest=require('node:crypto').createHash('sha256');for await(const bytes of fs.createReadStream(source)){ctx.assertActive();digest.update(bytes);}
          originalHash=digest.digest('hex');if(originalHash!==config.sourceMetadata[index].sha256){const error=new Error(`Source hash mismatch: ${path.basename(source)}`);error.code='HASH_MISMATCH';throw error;}
        }
        let interpolation=null;
        if(config.interpolate60===true){
          interpolation=await pythonJob('interpolate',{path:source},ctx,event=>progress(Math.round((index+event.progress/200)/config.sources.length*50),`Video ${index+1} · ${event.stage}`));
          prepared=interpolation.output_path;
        }
        if(config.inputMode!=='reconciled'&&!/_(?:edity|cutscript)_silence(?:_\d+)?\.[^\\/.]+$/i.test(source)){
          const result=await pythonJob('silence',{path:prepared,preset:config.preset,customMargin:config.customMargin,outputPath:path.join(work,`clean-${index}.mp4`)},ctx,event=>progress(Math.round((index+(config.interpolate60 ? 0.5 : 0)+event.progress/100*(config.interpolate60 ? 0.5 : 1))/config.sources.length*50),`Video ${index+1} · ${event.stage}`));prepared=result.output_path;sourceMap=result.source_map;
          if(!sourceMap){const error=new Error('Silence processing did not provide its original-to-processed timing map');error.code='SOURCE_MAP_UNAVAILABLE';throw error;}
        }
        const asset=await importAsset(repository,ctx.projectId,prepared,'video',{source:'local'},ctx),probe=await services.service('/composition/prepare',{path:path.resolve(directory,asset.path),kind:'video'},ctx);delete probe.contactSheetPath;
        const supplied=config.sourceMetadata?.[index];
        if(config.inputMode==='reconciled'&&supplied?.sha256&&supplied.sha256!==originalHash){const error=new Error(`Source hash mismatch: ${path.basename(source)}`);error.code='HASH_MISMATCH';throw error;}
        if(!sourceMap)sourceMap={format:'edity.silence_source_map.v1',kind:config.inputMode==='reconciled'?'original-identity':'selected-source-identity',segments:[{originalStartUs:0,originalEndUs:probe.durationUs,processedStartUs:0,processedEndUs:probe.durationUs}],processedContentDurationUs:probe.durationUs};
        const d=ctx.getDocument(),clips=[...(d.clips||[])],clip={id:index===0&&clips.length?clips[0].id:randomUUID(),name:path.basename(source),path:path.resolve(directory,asset.path),sourcePath:source,start:0,duration:probe.durationUs/1e6,sourceIndex:index,sourceId:supplied?.sourceId||String(index),sourceSha256:originalHash||interpolation?.sourceSha256||(config.inputMode==='reconciled'?probe.hash:undefined),interpolation,sourceMap,preservesOriginalTiming:config.inputMode==='reconciled'};if(index===0)clips.splice(0,1,clip);else clips.push(clip);
        const operations=[{type:'asset',asset:{...asset,...probe}}];
        const previousRate=d.composition.canvas.fps,rate=probe.fps||previousRate;
        if(config.interpolate60!==undefined&&rate.num/rate.den>=(index?previousRate.num/previousRate.den:0))operations.push({type:'canvas',canvas:{...d.composition.canvas,fps:rate.num<=240000&&rate.den<=10000?rate:{num:Math.round(rate.num/rate.den*1000),den:1000}}});if(index===0){operations.push({type:'update',id:'base',changes:{assetId:asset.id}});}
        project=commit({clips,...(index===0?{videoPath:clip.path}:{}),processing:{...d.processing,nextIndex:index+1}},operations);
      }
      project=ctx.getDocument();let clips=project.clips||[];
      if(clips.length>1){progress(52,'Building continuous timeline');
        const outputPath=path.join(directory,`timeline-${randomUUID()}.mp4`),composed=await pythonJob('compose',{paths:clips.map(c=>c.path),outputPath,fps:project.composition.canvas.fps},ctx);
        const originalClips=clips;clips=clips.map((c,i)=>({...c,start:composed.clips[i].start,duration:composed.clips[i].duration}));
        const shifts=new Map(clips.map((c,i)=>[c.id,c.start-originalClips[i].start]));
        const words=project.words.map(w=>({...w,start:w.start+(shifts.get(w.clipId)||0),end:w.end+(shifts.get(w.clipId)||0)}));
        let cursor=0;const segments=project.segments.map(s=>{const startIndex=cursor;cursor+=s.words.length;const shift=shifts.get(s.clipId)||0;return{...s,start:s.start+shift,end:s.end+shift,words:words.slice(startIndex,cursor),globalStartIndex:startIndex};});
        const soundEvents=(project.soundEvents||[]).map(e=>({...e,start:e.start+(shifts.get(e.clipId)||0),end:e.end+(shifts.get(e.clipId)||0)}));
        const deletedRanges=project.deletedRanges.map(r=>({...r,start:words[r.wordIndices[0]]?.start??r.start,end:words[r.wordIndices.at(-1)]?.end??r.end}));
        const asset=await importAsset(repository,ctx.projectId,outputPath,'video',{source:'local'},ctx),metadata=await services.service('/composition/prepare',{path:path.resolve(directory,asset.path),kind:'video'},ctx);delete metadata.contactSheetPath;
        project=commit({clips,words,segments,soundEvents,deletedRanges,videoPath:path.resolve(directory,asset.path)},[{type:'asset',asset:{...asset,...metadata}},{type:'update',id:'base',changes:{assetId:asset.id}}]);fs.unlinkSync(outputPath);
      }else if(clips.length){clips=[{...clips[0],start:0}];project=commit({clips});}
      for(let index=0;index<clips.length;index++){
        const clip=clips[index];if(ctx.getDocument().words.some(w=>w.clipId===clip.id)||(ctx.getDocument().processing?.importedTranscripts||[]).includes(index))continue;
        let result;
        if(config.inputMode==='reconciled'){
          result=config.sourceMetadata?.[index]?.transcript||{words:[],segments:[],language:config.language};
          if(result.words.some(w=>w.end>clip.duration+.1))throw new Error(`Transcript exceeds original source duration: ${clip.name}`);
          progress(Math.round(55+(index+1)/clips.length*44),'Importing reconciled original transcript');
        }else{
          const release=await ctx.acquire('transcribe');try{result=await pythonJob('transcribe',{path:clip.path,engine:config.engine,model:config.model,language:config.language,skipTranscriptCleanup:config.skipTranscriptCleanup===true},ctx,event=>progress(Math.round(55+(index+event.progress/100)/clips.length*44),event.stage));}finally{release();}
        }
        const d=ctx.getDocument(),offset=clip.start,previousCount=d.words.length;
        const newWords=wordIds(result.words.map(w=>({...w,clipId:clip.id,start:w.start+offset,end:w.end+offset})),ctx.projectId),words=[...d.words,...newWords];
        let cursor=previousCount;const segments=(result.segments||[]).map((s,i)=>{const segmentWords=words.slice(cursor,cursor+s.words.length),startIndex=cursor;cursor+=s.words.length;return {...s,id:d.segments.length+i,clipId:clip.id,start:s.start+offset,end:s.end+offset,words:segmentWords,globalStartIndex:startIndex};});
        const sounds=(result.soundEvents||[]).map(s=>({...s,id:`${clip.id}-${s.id}`,clipId:clip.id,start:s.start+offset,end:s.end+offset}));
        project=commit({words,segments:[...d.segments,...segments],soundEvents:[...(d.soundEvents||[]),...sounds],language:result.language||config.language,processing:{...d.processing,...(result.wordBoundaryAlignment?{boundaryAlignment:{...d.processing?.boundaryAlignment,[clip.id]:result.wordBoundaryAlignment}}:{}),soundScans:{...d.processing?.soundScans,[clip.id]:result.soundScan||{status:'unavailable'}}},...(config.inputMode==='reconciled'?{processing:{...d.processing,importedTranscripts:[...(d.processing.importedTranscripts||[]),index]}}:{})});
      }
      const d=ctx.getDocument();commit({processing:{...d.processing,status:'done',stage:'Ready',progress:100,error:''}});return {revision:ctx.getDocument().revision};
    }catch(error){if(!ctx.signal.aborted){const d=ctx.getDocument();commit({processing:{...d.processing,status:'error',stage:'Processing failed',error:String(error.message||error)}});}throw error;}
  },{resource:'prepare',resumable:true});
  coordinator.register('remove-clip',async(payload,ctx)=>{
    const original=ctx.getDocument(),removed=original.clips.find(c=>c.id===payload.clipId);
    if(!removed||original.clips.length<2)throw new Error('Keep at least one clip in the project');
    const directory=repository.directory(ctx.projectId),remaining=original.clips.filter(c=>c.id!==payload.clipId);
    ctx.progress(10,'Building timeline');
    const outputPath=path.join(directory,`timeline-${randomUUID()}.mp4`);
    const composed=await pythonJob('compose',{paths:remaining.map(c=>c.path),outputPath,fps:original.composition.canvas.fps},ctx);
    const clips=remaining.map((c,i)=>({...c,start:composed.clips[i].start,duration:composed.clips[i].duration}));
    const asset=await importAsset(repository,ctx.projectId,outputPath,'video',{source:'local'},ctx);
    const metadata=await services.service('/composition/prepare',{path:path.resolve(directory,asset.path),kind:'video'},ctx);delete metadata.contactSheetPath;fs.unlinkSync(outputPath);
    const shifts=new Map(clips.map(c=>[c.id,c.start-original.clips.find(old=>old.id===c.id).start]));
    const remap=new Map(),words=original.words.flatMap((w,i)=>{if(w.clipId===removed.id)return[];remap.set(i,remap.size);const shift=shifts.get(w.clipId)||0;return[{...w,start:w.start+shift,end:w.end+shift}];});
    let cursor=0;const segments=original.segments.filter(s=>s.clipId!==removed.id).map(s=>{const shift=shifts.get(s.clipId)||0,startIndex=cursor;cursor+=s.words.length;return{...s,start:s.start+shift,end:s.end+shift,globalStartIndex:startIndex,words:words.slice(startIndex,cursor)};});
    const deletedRanges=original.deletedRanges.flatMap(r=>{const wordIndices=r.wordIndices.filter(i=>remap.has(i)).map(i=>remap.get(i));return wordIndices.length?[{...r,wordIndices,start:words[wordIndices[0]].start,end:words[wordIndices.at(-1)].end}]:[];});
    const soundEvents=(original.soundEvents||[]).filter(e=>e.clipId!==removed.id).map(e=>({...e,start:e.start+(shifts.get(e.clipId)||0),end:e.end+(shifts.get(e.clipId)||0)}));
    // Keep immutable originals for undo and snapshots already exporting.
    const current=ctx.getDocument();for(const field of ['clips','words','segments','deletedRanges','soundEvents'])if(JSON.stringify(current[field])!==JSON.stringify(original[field]))throw new Error('The transcript changed while removing this clip. Retry the removal.');
    ctx.commit({id:`remove-${ctx.jobId}`,baseRevision:current.revision,actor:'manual',label:'Remove clip',operations:[{type:'asset',asset:{...asset,...metadata}},{type:'update',id:'base',changes:{assetId:asset.id}}],documentChanges:{clips,words,segments,deletedRanges,soundEvents,videoPath:path.resolve(directory,asset.path),...(original.processing?{processing:{...original.processing,sources:clips.map(c=>c.sourcePath||c.path),nextIndex:clips.length}}:{})}});
    return{revision:ctx.getDocument().revision};
  },{resource:'prepare',resumable:true});
  function ensure(id){const d=repository.getDocument(id);if(!d.processing||d.processing.status==='done')return;const existing=coordinator.list(id).find(j=>j.kind==='process-project'&&['queued','waiting','running','interrupted'].includes(j.status));if(existing)return existing;return coordinator.start({kind:'process-project',projectId:id,requestId:`initial-${id}`,payload:{}});}
  return {ensure};
}
module.exports={registerProcessingJobs};
