import type {CutManifest,TimedWord} from './types';

// Phrase-level ducking: breaths and edit seams must not raise the music bed.
export const speechDuckingTiming={attackUs:120000,holdUs:500000,releaseUs:900000,gain:.25};
export function speechDuckingEnvelope(manifest:CutManifest,words:TimedWord[],voiceMuted=false){
  if(voiceMuted)return [{timeUs:0,gain:1}];
  const {attackUs,holdUs,releaseUs,gain}=speechDuckingTiming;
  const regions:Array<{start:number;end:number}>=[];
  const speech=words.map(w=>({start:Math.round(w.start*1e6),end:Math.round(w.end*1e6)}));
  for(const segment of manifest.segments)for(const word of speech){
    const start=Math.max(segment.globalSourceStartUs,word.start),end=Math.min(segment.globalSourceStartUs+segment.editEndUs-segment.editStartUs,word.end);
    if(end>start)regions.push({start:segment.editStartUs+start-segment.globalSourceStartUs,end:segment.editStartUs+end-segment.globalSourceStartUs});
  }
  const phrases:typeof regions=[];
  for(const region of regions.sort((a,b)=>a.start-b.start)){
    const last=phrases.at(-1);
    // Merge overlapping attack/release windows, keeping envelope times ordered.
    if(last&&region.start-last.end<=holdUs+releaseUs+attackUs)last.end=Math.max(last.end,region.end);
    else phrases.push({...region});
  }
  const points:Array<{timeUs:number;gain:number}>=[];
  const add=(timeUs:number,value:number)=>{const time=Math.max(0,Math.min(manifest.durationUs,timeUs));const last=points.at(-1);if(last?.timeUs===time)last.gain=value;else points.push({timeUs:time,gain:value});};
  for(const phrase of phrases){add(phrase.start-attackUs,1);add(phrase.start,gain);add(phrase.end+holdUs,gain);add(phrase.end+holdUs+releaseUs,1);}
  // A truncated final release must remain at its actual intermediate gain.
  const last=phrases.at(-1);
  if(last&&last.end+holdUs+releaseUs>manifest.durationUs){
    const phase=Math.max(0,Math.min(1,(manifest.durationUs-last.end-holdUs)/releaseUs));
    points[points.length-1].gain=gain+(1-gain)*phase;
  }
  return points.length?points:[{timeUs:0,gain:1}];
}
