import {useEffect,useMemo} from 'react';import type {RefObject} from 'react';
import type {RenderPlan} from '../composition/types';import {sourceToEdit} from '../composition/timeMap';
import {sourceTimeAt} from '../lib/playbackTime';import {useEditorStore} from '../store/editorStore';
import {useCompositionStore} from '../store/compositionStore';
export function useCompositionAudio(videoRef:RefObject<HTMLVideoElement|null>,plan:RenderPlan|null){
  const backend=useEditorStore(s=>s.backendUrl);
  const audioKey=useMemo(()=>JSON.stringify(plan?[plan.audio,plan.manifest.id,Object.values(plan.document.assets).map(a=>[a.id,a.path,a.hash])]:null),[plan]);
  useEffect(()=>{
    // Muted B-roll still has plan entries. It needs no supplemental mixer;
    // otherwise each six-second block decodes and schedules pure silence.
    if(!plan?.audio.entries.some(entry=>!entry.mute)||!videoRef.current)return;
    const video=videoRef.current,context=new AudioContext({sampleRate:48000}),buffers=new Map<number,Promise<AudioBuffer>>();
    const controller=new AbortController(),nodes=new Map<number,AudioBufferSourceNode>();let live=true,loading=false,generation=0,anchor: {edit:number;context:number;rate:number}|null=null;
    const edit=()=>sourceToEdit(plan.manifest,Math.round(sourceTimeAt(video)*1e6))??0;
    const stop=()=>{generation++;for(const node of nodes.values()){try{node.stop();}catch{}node.disconnect();}nodes.clear();anchor=null;};
    async function fragment(index:number){
      if(!buffers.has(index))buffers.set(index,(async()=>{
        const response=await fetch(`${backend}/composition/audio`,{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({plan:plan!.audio,assets:plan!.document.assets,manifest:plan!.manifest,startUs:index*6e6,endUs:Math.min(plan!.manifest.durationUs,(index+1)*6e6),includeVoice:false})});
        const data=await response.json();if(!response.ok)throw new Error(data.detail||'Audio mix failed');const file=await fetch(`${backend}/file?path=${encodeURIComponent(data.path)}`,{signal:controller.signal});return context.decodeAudioData(await file.arrayBuffer());
      })());
      for(const key of buffers.keys())if(Math.abs(key-index)>1)buffers.delete(key);return buffers.get(index)!;
    }
    const tick=async()=>{
      if(!live||video.paused||loading)return;
      const time=edit()/1e6,rate=video.playbackRate,index=Math.floor(time/6);
      if(anchor&&Math.abs(anchor.edit+(context.currentTime-anchor.context)*anchor.rate-time)>.08)stop();
      loading=true;let token=generation;
      try{
        await context.resume();
        // Schedule the next decoded fragment before the current one ends. The
        // edited clock stays continuous through native-video seeks at word cuts.
        for(const next of [index,index+1]){
          if(next*6e6>=plan.manifest.durationUs||nodes.has(next))continue;
          const buffer=await fragment(next);if(!live||video.paused||token!==generation)return;
          const now=edit()/1e6;if(next<Math.floor(now/6))continue;
          const when=context.currentTime+Math.max(0,(next*6-now)/rate),offset=Math.max(0,now-next*6);
          const node=context.createBufferSource();node.buffer=buffer;node.playbackRate.value=rate;node.connect(context.destination);
          nodes.set(next,node);node.onended=()=>{if(nodes.get(next)===node)nodes.delete(next);node.disconnect();};node.start(when,Math.min(offset,buffer.duration));
          if(!anchor)anchor={edit:now,context:context.currentTime,rate};
        }
      }catch(e){if(live&&!controller.signal.aborted)useCompositionStore.setState({error:`Media audio: ${String(e)}`});}finally{loading=false;}
    };
    video.addEventListener('pause',stop);video.addEventListener('ratechange',stop);video.addEventListener('edity-seek',stop);
    void fragment(Math.floor(edit()/6e6)).catch(()=>{});const timer=setInterval(()=>void tick(),40);
    return()=>{live=false;stop();controller.abort();clearInterval(timer);video.removeEventListener('pause',stop);video.removeEventListener('ratechange',stop);video.removeEventListener('edity-seek',stop);buffers.clear();void context.close();};
  },[audioKey,videoRef,backend]);
}
