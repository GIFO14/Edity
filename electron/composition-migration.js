const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { emptyComposition, defaultTransform, validateComposition } = require('../shared/composition-runtime.cjs');
const {captureSpeechMembers}=require('./speech-membership');
function stableId(...parts){return createHash('sha256').update(parts.join('|')).digest('hex').slice(0,24);}
function wordIds(words, projectId) {
  const counters=new Map();
  return words.map(word=>{const clip=word.clipId||projectId||'base';const ordinal=counters.get(clip)||0;counters.set(clip,ordinal+1);return {...word,id:word.id||`w_${stableId(clip,ordinal,word.start,word.end)}`};});
}
function migrateProject(project,directory) {
  if(project.version!==1&&project.version!==2)throw new Error(`Unsupported project version: ${project.version}`);
  if(project.version===2){const next=structuredClone(project);captureSpeechMembers(next.composition,next.words);validateComposition(next.composition);return next;}
  const next=structuredClone(project);next.version=2;next.revision=0;next.transcriptRevision=0;
  next.words=wordIds(project.words.map(w=>({...w,clipId:w.clipId||project.clips?.find(c=>c.duration>0&&w.start>=c.start&&w.start<c.start+c.duration)?.id||(project.clips?.length===1?project.clips[0].id:undefined)})),project.id);
  let ordinal=0;next.segments=(next.segments||[]).map(segment=>{const start=ordinal;ordinal+=segment.words.length;const words=next.words.slice(start,ordinal);return {...segment,clipId:segment.clipId||words[0]?.clipId,globalStartIndex:start,words};});
  const composition=emptyComposition();
  const addAsset=(file,kind,id,duration=0)=>{
    const relative=path.relative(directory,path.resolve(file));
    const managed=relative&&!relative.startsWith('..')&&!path.isAbsolute(relative);
    composition.assets[id]={id,kind,path:managed?relative.replace(/\\/g,'/'):file,hash:'',name:path.basename(file),durationUs:Math.round(duration*1e6),width:0,height:0,hasAudio:kind!=='image',hasAlpha:false,status:fs.existsSync(file)?'ready':'missing'};
    return id;
  };
  addAsset(project.videoPath,'video','baseAsset');
  composition.elements.base={id:'base',kind:'base',assetId:'baseAsset',trackId:'base',order:0,label:'Base video',enabled:true,createdBy:'migration',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold'};
  for(const [order,item] of (project.mediaItems||[]).entries()){
    const assetId=`asset_${stableId(item.path)}`;addAsset(item.path,item.type==='broll'?'video':item.type==='music'?'audio':'image',assetId);
    const gain=Number(item.volume ?? .3);
    composition.elements[item.id]={id:item.id,kind:item.type==='broll'?'video':item.type==='music'?'audio':'image',assetId,trackId:item.type==='music'?'music':'visual',order,label:path.basename(item.path),enabled:true,createdBy:'migration',placement:{kind:'timeline',startUs:Math.round(item.start*1e6),endUs:Math.round(item.end*1e6)},transform:defaultTransform(),presets:[],sourceInUs:Math.round((item.sourceStart||0)*1e6),endPolicy:item.type==='image'?'hold':'loop',
      matteColor:item.type==='music'?undefined:'#000000',audio:item.type==='image'?undefined:{gainDb:gain>0?Math.max(-96,20*Math.log10(gain)):0,mute:item.type==='broll'||gain===0,fadeInUs:0,fadeOutUs:0,ducking:false,bus:item.type==='music'?'music':'supplemental'}};
  }
  next.composition=composition;
  next.instructionProfile=next.instructionProfile||{id:'legacy',revision:1,name:'Project instructions',text:project.aiSettings?.editingInstructions||project.editingInstructions||'',mediaText:project.aiSettings?.mediaInstructions||''};
  validateComposition(composition);return next;
}
function absoluteComposition(document,directory) {
  const result=structuredClone(document);
  for(const asset of Object.values(result.assets)){if(!path.isAbsolute(asset.path))asset.path=path.join(directory,asset.path);if(asset.previewPath&&!path.isAbsolute(asset.previewPath))asset.previewPath=path.join(directory,asset.previewPath);}
  return result;
}
module.exports={migrateProject,wordIds,stableId,absoluteComposition};
