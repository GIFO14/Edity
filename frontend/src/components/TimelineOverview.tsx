import {useRef} from 'react';
import type {RefObject} from 'react';
export default function TimelineOverview({scroll,viewport,duration,cuts,onRange}:{scroll:RefObject<HTMLDivElement|null>;viewport:{start:number;end:number};duration:number;cuts:number[];onRange:(start:number,end:number)=>void}){
  const drag=useRef<{x:number;width:number;left:number;start:number;end:number;mode:'pan'|'start'|'end'}|null>(null);
  function begin(e:React.PointerEvent,mode:'pan'|'start'|'end'){
    const node=scroll.current;if(e.button!==0||!node)return;e.preventDefault();e.stopPropagation();
    const area=e.currentTarget.closest<HTMLElement>('[data-timeline-overview]')!,rect=area.getBoundingClientRect(),fraction=(e.clientX-rect.left)/rect.width;
    if(mode==='pan'&&!(e.target as HTMLElement).closest('[data-overview-window]')&&(fraction<viewport.start||fraction>viewport.end))node.scrollLeft=fraction*node.scrollWidth-node.clientWidth/2;
    drag.current={x:e.clientX,width:rect.width,left:node.scrollLeft,start:viewport.start,end:viewport.end,mode};area.setPointerCapture(e.pointerId);
  }
  function move(e:React.PointerEvent){const d=drag.current,n=scroll.current;if(!d||!n)return;const delta=(e.clientX-d.x)/d.width;if(d.mode==='pan')n.scrollLeft=d.left+delta*n.scrollWidth;else if(d.mode==='start')onRange(Math.max(0,Math.min(d.end-.001,d.start+delta)),d.end);else onRange(d.start,Math.min(1,Math.max(d.start+.001,d.end+delta)));}
  return <div className="shrink-0 flex h-9 mb-1 items-center gap-1"><span className="w-20 shrink-0 text-editor-text-muted px-1">Overview</span><div data-timeline-overview role="slider" aria-label="Timeline overview" aria-valuemin={0} aria-valuemax={duration/1e6} aria-valuenow={viewport.start*duration/1e6} tabIndex={0} title="Drag the window to navigate; drag its edges to zoom" className="relative flex-1 h-7 bg-editor-surface rounded overflow-hidden cursor-grab outline-none focus-visible:ring-1 ring-cyan-300" style={{touchAction:'none'}} onPointerDown={e=>begin(e,'pan')} onPointerMove={move} onPointerUp={e=>{move(e);drag.current=null;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);}} onPointerCancel={()=>{drag.current=null;}} onLostPointerCapture={()=>{drag.current=null;}} onKeyDown={e=>{const n=scroll.current;if(!n)return;if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();n.scrollLeft=e.key==='Home'?0:e.key==='End'?n.scrollWidth:n.scrollLeft+(e.key==='ArrowLeft'?-1:1)*n.clientWidth*.75;}}}>
    {cuts.map((time,i)=><span key={i} className="absolute top-2 bottom-2 w-px bg-amber-300/50 pointer-events-none" style={{left:`${time/duration*100}%`}}/>)}
    <div data-overview-window className="absolute inset-y-0 border border-cyan-200 bg-cyan-300/15" style={{left:`${viewport.start*100}%`,width:`${(viewport.end-viewport.start)*100}%`,minWidth:10}}>
      {(viewport.end-viewport.start)*(scroll.current?.clientWidth||0)>30&&<><button aria-label="Overview zoom start" className="absolute inset-y-0 left-0 w-2 bg-cyan-200/50 cursor-ew-resize" onPointerDown={e=>begin(e,'start')}/>
      <button aria-label="Overview zoom end" className="absolute inset-y-0 right-0 w-2 bg-cyan-200/50 cursor-ew-resize" onPointerDown={e=>begin(e,'end')}/></>}
    </div>
  </div></div>;
}
