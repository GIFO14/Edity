import {memo,useEffect,useMemo,useState} from 'react';
import {fadeGain} from '../composition/timelineLayout';
type Wave={peaks:number[];startUs:number;endUs:number;binUs:number};
const cache=new Map<string,Promise<Wave>>();
let active=0;const waiting:Array<()=>void>=[];
async function boundedFetch(url:string){
  if(active>=3)await new Promise<void>(resolve=>waiting.push(resolve));else active++;
  try{const response=await fetch(url);if(!response.ok)throw new Error('Waveform unavailable');return await response.json() as Wave;}
  finally{const next=waiting.shift();if(next)next();else active--;}
}
function getWave(backend:string,path:string,start:number,end:number,bins:number){
  const key=JSON.stringify([backend,path,start,end,bins]);
  if(!cache.has(key)){
    const promise=boundedFetch(`${backend}/audio/waveform?path=${encodeURIComponent(path)}&startUs=${start}&endUs=${end}&bins=${bins}`).catch(error=>{cache.delete(key);throw error;});
    cache.set(key,promise);if(cache.size>96)cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}
function TimelineWaveform({backend,path,startUs,endUs,phaseUs=0,sourceInUs=0,sourceDurationUs,loop=false,visibleStart,visibleEnd,gainDb=0,fadeInUs=0,fadeOutUs=0,totalUs=endUs-startUs,top=18,detail=false,pixelsPerUs=0}:{backend:string;path:string;startUs:number;endUs:number;phaseUs?:number;sourceInUs?:number;sourceDurationUs:number;loop?:boolean;visibleStart:number;visibleEnd:number;gainDb?:number;fadeInUs?:number;fadeOutUs?:number;totalUs?:number;top?:number;detail?:boolean;pixelsPerUs?:number}){
  const [wave,setWave]=useState<Wave|null>(null),a=Math.max(startUs,visibleStart),b=Math.min(endUs,visibleEnd),available=sourceDurationUs-sourceInUs;
  const sourceA=sourceInUs+phaseUs+a-startUs,sourceB=sourceInUs+phaseUs+b-startUs;
  const requestStart=loop||!detail?0:Math.max(0,Math.floor(sourceA/250000)*250000),requestEnd=loop||!detail?sourceDurationUs:Math.min(sourceDurationUs,Math.ceil(sourceB/250000)*250000);
  useEffect(()=>{setWave(null);if(!path||b<=a||available<=0||requestEnd<=requestStart)return;let live=true;const timer=setTimeout(()=>{void getWave(backend,path,requestStart,requestEnd,detail?1200:4096).then(data=>{if(live)setWave(data);}).catch(()=>{});},120);return()=>{live=false;clearTimeout(timer);};},[backend,path,requestStart,requestEnd,detail]);
  const points=Math.max(2,Math.min(600,pixelsPerUs>0?Math.ceil((b-a)*pixelsPerUs):600));
  const waveformPath=useMemo(()=>{
    if(!wave||b<=a||available<=0||!wave.peaks.length)return '';
    const parts:string[]=[],gain=10**(gainDb/20);
    for(let i=0;i<points;i++){
      const elapsed=phaseUs+a-startUs+(b-a)*i/(points-1),source=loop?sourceInUs+elapsed%available:sourceInUs+elapsed;
      const bin=Math.floor((source-wave.startUs)/wave.binUs),p=source>=sourceDurationUs?0:wave.peaks[bin]||0;
      const amplitude=Math.min(1,p*gain*fadeGain(elapsed,totalUs,fadeInUs,fadeOutUs));
      parts.push(`M${i},${50-amplitude*47}v${amplitude*94}`);
    }
    return parts.join(' ');
  },[wave,a,b,available,points,phaseUs,startUs,loop,sourceInUs,sourceDurationUs,gainDb,totalUs,fadeInUs,fadeOutUs]);
  if(!waveformPath)return null;
  return <svg data-timeline-waveform aria-hidden className="absolute pointer-events-none text-emerald-200/80" style={{left:`${(a-startUs)/(endUs-startUs)*100}%`,width:`${(b-a)/(endUs-startUs)*100}%`,top,bottom:3,height:`calc(100% - ${top+3}px)`}} viewBox={`0 0 ${points} 100`} preserveAspectRatio="none"><path d={waveformPath} stroke="currentColor" strokeWidth="1" fill="none"/></svg>;
}

export default memo(TimelineWaveform);
