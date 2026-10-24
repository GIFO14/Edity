const fs=require('node:fs'),path=require('node:path'),{createHash}=require('node:crypto');
const {bridgeError}=require('./local-agent-bridge');
function us(value,label){if(!Number.isSafeInteger(value)||value<0)throw bridgeError('INVALID_DATA',`${label} must be non-negative integer microseconds`);return value;}
function normalizeSources(sources,mode){
  if(!Array.isArray(sources)||!sources.length||sources.length>100)throw bridgeError('INVALID_DATA','Supply 1–100 source files');
  const ids=new Set();
  return sources.map((source,index)=>{
    if(!source||typeof source.path!=='string'||!path.isAbsolute(source.path)||!fs.existsSync(source.path)||!fs.statSync(source.path).isFile())throw bridgeError('INVALID_DATA','Source path must be an existing absolute file');
    if(source.sha256&&!/^[a-f0-9]{64}$/i.test(source.sha256))throw bridgeError('INVALID_DATA','Invalid source SHA-256');
    if(mode!=='reconciled'&&source.transcript)throw bridgeError('INVALID_DATA','Provided original transcripts require reconciled mode');
    const supplied=source.transcript||{segments:[],language:''},segments=[],words=[];
    if(!Array.isArray(supplied.segments))throw bridgeError('INVALID_DATA','Transcript needs a segments array');
    let previous=-1;
    for(const [segmentIndex,segment] of supplied.segments.entries()){
      const startUs=us(segment.startUs,'segment.startUs'),endUs=us(segment.endUs,'segment.endUs');if(endUs<startUs||!Array.isArray(segment.words))throw bridgeError('INVALID_DATA','Invalid transcript segment');
      const items=[];
      for(const item of segment.words){
        const a=us(item.startUs,'word.startUs'),b=us(item.endUs,'word.endUs');if(b<a||a<previous||a<startUs||b>endUs||typeof item.text!=='string')throw bridgeError('INVALID_DATA','Word timing must be ordered and inside its segment');previous=a;
        const confidence=item.confidence??1;if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw bridgeError('INVALID_DATA','Word confidence must be between 0 and 1');
        const generated=`w_${createHash('sha256').update(`${source.sha256||path.resolve(source.path)}|${index}|${words.length}|${a}|${b}`).digest('hex').slice(0,24)}`,id=item.id||generated;
        if(typeof id!=='string'||!id.length||id.length>200||ids.has(id))throw bridgeError('INVALID_DATA','Word IDs must be unique strings');ids.add(id);
        const word={id,word:item.text.trim(),start:a/1e6,end:b/1e6,confidence,sourceStartUs:a,sourceEndUs:b,sourceIndex:index,...(item.id?{sourceWordId:item.id}:{})};items.push(word);words.push(word);
      }
      segments.push({id:segmentIndex,start:startUs/1e6,end:endUs/1e6,text:segment.text||items.map(w=>w.word).join(' '),words:items,sourceStartUs:startUs,sourceEndUs:endUs,sourceSegmentId:segment.id||String(segmentIndex)});
    }
    return {path:path.resolve(source.path),sha256:source.sha256?.toLowerCase(),sourceId:source.sourceId||String(index),transcript:{words,segments,language:supplied.language||''}};
  });
}
module.exports={normalizeSources};
