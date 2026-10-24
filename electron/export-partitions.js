const {evaluateFrame,isColorGraded}=require('../shared/composition-runtime.cjs');
const {sourceFrameRate,sourceFrameIndex}=require('./source-frame-time');
const {selectionFor,selectedFrame}=require('./export-frame-selection');
// Split only where every active moving source would open a new decoder anyway.
// This preserves FFmpeg's seek/FPS phase across cuts and repeated takes.
function partitionExport(plan,count=4){
 const fps=plan.document.canvas.fps.num/plan.document.canvas.fps.den,N=Math.ceil(plan.manifest.durationUs/1e6*fps),states=new Map(),safe=[0],cost=[0];
 for(let index=0;index<N;index++){
  const timeUs=Math.round(index*1e6/fps),layers=evaluateFrame(plan,timeUs).filter(l=>l.element.kind!=='text'),shared=new Set(),active=new Set(layers.map(l=>l.id));let allReset=true,weight=1;
  for(const layer of layers){
   const asset=plan.document.assets[layer.element.assetId],managed=isColorGraded(layer.colorGrade),rate=managed?sourceFrameRate(asset,fps):fps,frame=asset.kind==='image'?0:managed?sourceFrameIndex(layer.sourceTimeUs,rate):Math.floor(layer.sourceTimeUs/1e6*rate),key=asset.id+':'+managed+':'+frame;
   if(shared.has(key))continue;shared.add(key);weight+=asset.width*asset.height/(1920*1080);
   let state=states.get(layer.id);if(state&&state.managed!==managed)state=null;
   const cached=state&&frame===state.frame;
   const reset=!state||frame<state.frame||frame>state.frame+Math.ceil(rate*2)||!cached&&state.selection&&frame!==selectedFrame(state.selection);
   if(asset.kind!=='image'&&!reset)allReset=false;
   if(reset){state={managed,frame,selection:managed&&asset.kind!=='image'&&rate>fps*1.1?selectionFor(frame,layer.sourceTimeUs,rate,fps):null};states.set(layer.id,state);}
   if(!cached||reset){state.frame=frame;if(state.selection)state.selection.count++;}
  }
  for(const id of states.keys())if(!active.has(id))states.delete(id);
  if(index&&allReset)safe.push(index);cost.push(cost[index]+weight);
 }
 const cuts=[0];for(let n=1;n<count;n++){const target=cost[N]*n/count;let best=null;for(const at of safe)if(at>cuts[cuts.length-1]&&N-at>=30&&(!best||Math.abs(cost[at]-target)<Math.abs(cost[best]-target)))best=at;if(best!==null)cuts.push(best);}
 cuts.push(N);return cuts.slice(0,-1).map((startFrame,i)=>({startFrame,frameCount:cuts[i+1]-startFrame}));
}
module.exports={partitionExport};
