const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
// Never turn a temporarily locked Windows destination into a main-process crash.
// Retain a complete temporary snapshot until atomic replacement succeeds.
class JobStateWriter{
 constructor(directory,{io=fs,onWarning=()=>{}}={}){this.directory=directory;this.io=io;this.onWarning=onWarning;this.pending=new Map();this.timer=null;}
 write(id,text){
  if(!/^[a-zA-Z0-9_-]+$/.test(id))throw Error('Invalid job id');
  const old=this.pending.get(id),entry={text,written:old?.written,attempt:old?.attempt||0,temp:old?.temp,next:0,warned:old?.warned};this.pending.set(id,entry);
  this.attempt(id,entry);this.schedule();return !this.pending.has(id);
 }
 attempt(id,entry){
  if(this.pending.get(id)!==entry)return;
  const file=path.join(this.directory,`${id}.json`);let temp=entry.temp;
  try{
   // A retry may reuse its exact snapshot; a newer snapshot replaces it first.
   if(!temp||entry.written!==entry.text){
    const next=`${file}.${randomUUID()}.tmp`;try{this.io.writeFileSync(next,entry.text);}catch(error){try{this.io.unlinkSync(next);}catch{}throw error;}
    if(temp)try{this.io.unlinkSync(temp);}catch{}
    temp=entry.temp=next;entry.written=entry.text;
   }
   this.io.renameSync(temp,file);this.pending.delete(id);
  }catch(error){
   entry.attempt++;entry.next=Date.now()+Math.min(1000,25*2**Math.min(entry.attempt,6));
   if(!entry.warned){entry.warned=true;this.onWarning({jobId:id,code:error.code||'WRITE_FAILED',message:error.message});}
  }
 }
 schedule(){
  clearTimeout(this.timer);this.timer=null;if(!this.pending.size)return;
  const next=Math.max(1,Math.min(...[...this.pending.values()].map(e=>e.next))-Date.now());
  this.timer=setTimeout(()=>{this.timer=null;for(const [id,entry]of this.pending)if(entry.next<=Date.now())this.attempt(id,entry);this.schedule();},next);this.timer.unref?.();
 }
 async flush(timeout=2000){const end=Date.now()+timeout;while(this.pending.size&&Date.now()<end)await new Promise(r=>setTimeout(r,20));return !this.pending.size;}
 stop(){clearTimeout(this.timer);this.timer=null;}
}
module.exports={JobStateWriter};
