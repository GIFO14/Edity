const {decoderInputArgs}=require('./decoder-input');
function selectionFor(frame,timeUs,sourceFps,outputFps){
 return{start:frame,phase:Number((timeUs/1e6*sourceFps-frame).toFixed(12)),step:Number((sourceFps/outputFps).toPrecision(15)),count:0};
}
function selectedFrame(selection){return selection.start+Math.floor(selection.count*selection.step+selection.phase+.5);}
function selectedDecoderArgs(asset,options,selection){
 const args=decoderInputArgs(asset,options);if(!selection)return args;
 const i=args.indexOf('-vf')+1,filter=args[i],rate=`fps=${options.fps}`;
 const transform=filter.endsWith(','+rate)?filter.slice(0,-rate.length-1):filter;
 // Preserve the same source FPS grid and rounding. Drop unused source samples
 // before the stateless color conversion, rather than converting them to RGBA.
 args[i]=`${rate},select='eq(n,floor(selected_n*${selection.step}+(${selection.phase})+0.5))',${transform}`;
 args.splice(args.indexOf('-pix_fmt'),0,'-fps_mode','passthrough');return args;
}
module.exports={selectionFor,selectedFrame,selectedDecoderArgs};
