const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{randomUUID}=require('node:crypto');
const {partitionExport}=require('./export-partitions');
function parallelGpuExport(options,onProgress,renderOne){
 const parent=path.resolve(options.scratchDirectory||require('node:os').tmpdir()),directory=path.join(parent,`edity-render-${randomUUID()}`);fs.mkdirSync(directory);
 const parts=partitionExport(options.plan,Math.max(1,Math.min(6,Number(options.gpuParallel)||4))),jobs=[],progress=parts.map(()=>0),outputs=[],started=performance.now();let cancelled=false,mux=null,lastProgress=-1;
 const result=(async()=>{
  const {gpuParallel,audioPromise,audioPath,...renderOptions}=options;
  try{
   const results=await Promise.all(parts.map(async(part,index)=>{
    const output=path.join(directory,`part-${index}.mp4`);outputs.push(output);
    const job=renderOne({...renderOptions,...part,gpuCodec:options.gpuCodec===true,outputPath:output,audioPath:undefined},p=>{progress[index]=p.progress||0;const value=Math.floor(progress.reduce((total,value,i)=>total+value*parts[i].frameCount,0)/parts.reduce((total,p)=>total+p.frameCount,0));if(value>lastProgress){lastProgress=value;onProgress({progress:value,stage:'Rendering on GPU'});}});jobs.push(job);if(cancelled)job.cancel();return job.result;
   }));
   const audio=audioPromise?await audioPromise:audioPath;if(cancelled)throw Error('Cancelled');onProgress({progress:96,stage:'Adding audio'});
   const list=path.join(directory,'parts.txt');fs.writeFileSync(list,parts.map((_,i)=>`file '${path.join(directory,`part-${i}.mp4`).replace(/\\/g,'/').replace(/'/g,"'\\''")}'`).join('\n'));
   const staged=path.join(directory,'complete.mp4'),args=['-v','error','-y','-f','concat','-safe','0','-i',list,...(audio?['-i',audio,'-map','0:v:0','-map','1:a:0','-c:a','aac','-b:a','192k']:['-an']),'-c:v','copy','-t',String(options.plan.manifest.durationUs/1e6),'-movflags','+faststart',staged];
   mux=spawn(options.ffmpeg,args,{windowsHide:true,stdio:['ignore','ignore','pipe']});let stderr='';mux.stderr.on('data',b=>stderr=(stderr+b).slice(-12000));await new Promise((resolve,reject)=>{mux.once('error',reject);mux.once('close',code=>code===0?resolve():reject(Error(cancelled?'Cancelled':stderr)));});if(cancelled)throw Error('Cancelled');
   await require('./export-output-validation').validateExport({file:staged,ffprobe:options.ffprobe,width:options.width,height:options.height,frames:parts.reduce((sum,p)=>sum+p.frameCount,0),fps:options.plan.document.canvas.fps.num/options.plan.document.canvas.fps.den,hasAudio:!!audio,duration:options.plan.manifest.durationUs/1e6},p=>{mux=p;});if(cancelled)throw Error('Cancelled');
   const destination=path.resolve(options.outputPath);if(path.parse(destination).root.toLowerCase()===path.parse(directory).root.toLowerCase())fs.renameSync(staged,destination);else{const temp=path.join(path.dirname(destination),`.edity-${randomUUID()}.mp4`);try{await fs.promises.copyFile(staged,temp);if(cancelled)throw Error('Cancelled');fs.renameSync(temp,destination);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
   return{type:'complete',outputPath:options.outputPath,metrics:{frames:parts.reduce((s,p)=>s+p.frameCount,0),wallMs:performance.now()-started,gpuParallel:parts.length,parts:results.map((r,i)=>({...parts[i],metrics:r.metrics}))}};
  }catch(error){for(const job of jobs)job.cancel();await Promise.allSettled(jobs.map(j=>j.result));throw error;}
  finally{if(path.dirname(directory)===parent&&path.basename(directory).startsWith('edity-render-'))fs.rmSync(directory,{recursive:true,force:true});}
 })();
 return{result,cancel(){cancelled=true;for(const job of jobs)job.cancel();mux?.kill();}};
}
module.exports={parallelGpuExport};
