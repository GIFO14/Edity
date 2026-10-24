const {createHash}=require('node:crypto');
const {validGrade}=require('./editing-library');
function listColorPresets(library){
  if(!library)throw new Error('Color preset library is unavailable');
  return Object.values(library.read().colorGrades||{}).flatMap(p=>{try{return [{id:p.id,name:p.name,revision:p.revision,version:1,grade:validGrade(p.grade)}];}catch{return [];}}).sort((a,b)=>a.name.localeCompare(b.name));
}
function saveColorPreset(library,params,requestId){
  if(!library)throw new Error('Color preset library is unavailable');
  const id=params.presetId||`grade-${createHash('sha256').update(requestId).digest('hex').slice(0,32)}`;
  return library.save('colorGrades',{id,name:params.name,grade:params.grade,expectedRevision:params.expectedPresetRevision,requestId});
}
function colorPresetOperation(library,document,params){
  const preset=listColorPresets(library).find(p=>p.id===params.presetId);if(!preset)throw new Error('Color preset not found. Refresh the preset list.');
  if(params.expectedPresetRevision!=null&&params.expectedPresetRevision!==preset.revision){const error=new Error('Color preset changed. Refresh before applying it.');error.code='REVISION_CONFLICT';error.details={actualPresetRevision:preset.revision};throw error;}
  if(!!params.sourceId===!!params.elementId)throw new Error('Choose exactly one sourceId or elementId');
  let operation;
  if(params.sourceId){
    const source=document.composition.assets[params.sourceId];
    if(!document.clips.some(c=>c.id===params.sourceId)&&!['video','image'].includes(source?.kind))throw new Error('Choose an existing recording clip or video/image asset');
    operation={type:'sourceGrade',sourceId:params.sourceId,grade:structuredClone(preset.grade)};
  }else{
    const element=document.composition.elements[params.elementId];if(!element||!['base','video','image'].includes(element.kind))throw new Error('Choose a video/image/base layer');
    operation={type:'update',id:params.elementId,changes:{colorGrade:structuredClone(preset.grade)}};
  }
  return {preset,operation};
}
module.exports={listColorPresets,saveColorPreset,colorPresetOperation};
