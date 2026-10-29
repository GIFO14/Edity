const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {randomUUID}=require('node:crypto');

// Render on a local volume, never into a cloud/redirected destination stream.
function scratchParent(options){
 const candidates=[options.scratchDirectory,process.env.EDITY_EXPORT_SCRATCH,os.tmpdir(),
  ...Object.values(options.plan?.document?.assets||{}).map(a=>a.path&&path.dirname(a.path))]
  .filter(p=>p&&path.isAbsolute(p)&&!p.startsWith('\\\\')&&!/(?:^|[\\/])(?:Mi unidad|My Drive|Google Drive|OneDrive(?: -[^\\/]*)?|Dropbox)(?:[\\/]|$)/i.test(p));
 let selected=null;
 for(const directory of new Set(candidates))try{
  const stat=fs.statSync(directory);if(!stat.isDirectory())continue;
  const disk=fs.statfsSync(directory),free=disk.bavail*disk.bsize;
  if(!selected||free>selected.free)selected={directory:path.resolve(directory),free};
 }catch{}
 if(!selected)throw Error('No local export scratch directory is available');
 if(selected.free<512*1024**2)throw Error('Not enough local disk space to export; free at least 512 MiB');
 return selected.directory;
}
function outputStage(options){
 const parent=scratchParent(options),directory=fs.mkdtempSync(path.join(parent,'edity-render-'));
 const file=path.join(directory,`render.${options.capture?'png':options.format||'mp4'}`);let retain=false;
 const stamp=target=>{try{const s=fs.statSync(target);return `${s.size}:${s.mtimeMs}:${s.ino}`;}catch(error){if(error.code==='ENOENT')return null;throw error;}};
 const target=path.resolve(options.outputPath),original=stamp(target);
 return {file,directory,async publish(cancelled=()=>false){
  const temporary=path.join(path.dirname(target),`.edity-${randomUUID()}${path.extname(target)}`);
  try{
   if(cancelled())throw Error('Cancelled');await fs.promises.mkdir(path.dirname(target),{recursive:true});
   // Copy only a closed, probed file. A cloud destination never receives a live mux.
   await fs.promises.copyFile(file,temporary);if(cancelled())throw Error('Cancelled');
   if(fs.statSync(temporary).size!==fs.statSync(file).size)throw Error('Destination copy is incomplete');
   if(stamp(target)!==original)throw Error('The destination was changed by another export or application');
   await fs.promises.rename(temporary,target);
  }catch(error){
   if(!cancelled()){retain=true;throw Error(`The video is complete locally at ${file}, but could not be saved to ${target}: ${error.message}`);}
   throw error;
  }finally{await fs.promises.unlink(temporary).catch(()=>{});}
 },cleanup(){
  if(!retain&&path.dirname(directory)===parent&&path.basename(directory).startsWith('edity-render-'))fs.rmSync(directory,{recursive:true,force:true});
 }};
}
async function encoderFailure(error,done){
 if(!/EPIPE|EOF|stream.*(?:destroy|closed)|write after end/i.test(String(error)))return error;
 let timer;
 try{return await Promise.race([
  done.then(()=>error,cause=>Error(`Video encoder stopped: ${cause.message}`)),
  new Promise(resolve=>{timer=setTimeout(()=>resolve(error),2000);})
 ]);}finally{clearTimeout(timer);}
}
module.exports={scratchParent,outputStage,encoderFailure};
