import {evaluateFrame} from '../composition/compiler';
import type {FrameLayer,RenderPlan} from '../composition/types';

export const isBaseTransitionLayer=(layer:FrameLayer)=>layer.element.kind==='base'&&layer.id!==layer.element.id;

/** Both sides of a base-to-base transition need independent source decoders. */
export function upcomingTransitionFrames(plan:RenderPlan,timeUs:number,horizonUs=2000000):Array<{layer:FrameLayer;startUs:number}>{
  return plan.transitions.filter(t=>t.startUs>timeUs&&t.startUs-timeUs<=horizonUs&&t.endUs>t.startUs)
    .flatMap(t=>evaluateFrame(plan,t.startUs+1).filter(l=>l.id===`${t.id}:out`||l.id===`${t.id}:in`).map(layer=>({layer,startUs:t.startUs})));
}
