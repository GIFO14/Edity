import type { Word, TranscriptionResult } from '../types/project';
export function identifyTranscript(result:TranscriptionResult,previous:Word[]=[]) {
  const used=new Set<string>();
  const words=result.words.map(word=>{
    const matches=previous.filter(prior=>prior.id&&!used.has(prior.id)&&Math.abs(prior.start-word.start)<.2&&prior.word.toLowerCase().replace(/\W/g,'')===word.word.toLowerCase().replace(/\W/g,''));
    const prior=matches.sort((a,b)=>Math.abs(a.start-word.start)-Math.abs(b.start-word.start))[0];
    const id=word.id||prior?.id||`w_${crypto.randomUUID()}`;used.add(id);return {...word,id};
  });
  let cursor=0;return {...result,words,segments:result.segments.map(segment=>{const slice=words.slice(cursor,cursor+segment.words.length);cursor+=segment.words.length;return {...segment,words:slice};})};
}
