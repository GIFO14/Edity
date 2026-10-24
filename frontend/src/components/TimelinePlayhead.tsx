import {memo} from 'react';
import type {PointerEvent} from 'react';
import type {CutManifest} from '../composition/types';
import {useEditorStore} from '../store/editorStore';
import {sourceToEdit} from '../composition/timeMap';

// Playback changes only this cursor, not every clip and waveform in the timeline.
function TimelinePlayhead({manifest,scrubTime,split,onPointerDown,onLostPointerCapture,onSeek}:{manifest:CutManifest;scrubTime:number|null;split:boolean;onPointerDown:(e:PointerEvent<HTMLDivElement>)=>void;onLostPointerCapture:()=>void;onSeek:(timeUs:number)=>void}){
  const currentTime=useEditorStore(s=>s.currentTime),duration=manifest.durationUs;
  const playhead=scrubTime??sourceToEdit(manifest,Math.round(currentTime*1e6))??0;
  return <div role="slider" tabIndex={0} aria-label="Playhead" aria-orientation="horizontal" aria-valuemin={0} aria-valuemax={duration/1e6} aria-valuenow={playhead/1e6} title="Drag to scrub" className="absolute top-0 bottom-0 z-20 cursor-ew-resize outline-none focus-visible:bg-yellow-300/20" style={{left:`${duration?playhead/duration*100:0}%`,width:12,transform:'translateX(-50%)',touchAction:'none',pointerEvents:split?'none':'auto'}} onPointerDown={onPointerDown} onLostPointerCapture={onLostPointerCapture} onKeyDown={e=>{const step=(e.shiftKey?10:1)*1e6;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();onSeek(e.key==='Home'?0:e.key==='End'?duration-1:playhead+(e.key==='ArrowLeft'?-step:step));}}}>
    <div className="absolute top-0 bottom-0 w-px bg-yellow-300 pointer-events-none" style={{left:6}}/>
    <div className="absolute top-0 h-1.5 bg-yellow-300 pointer-events-none" style={{left:3,width:7}}/>
  </div>;
}
export default memo(TimelinePlayhead);
