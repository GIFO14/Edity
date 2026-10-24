import type { PresetInstance, FrameLayer } from './types';
export interface Control { label: string; default: number | string | boolean; min?: number; max?: number; step?: number }
export interface PresetDefinition { id: string; name: string; version: number; kind: 'animation' | 'effect' | 'transition' | 'title'; controls: Record<string, Control> }
const number = (label: string, value: number, min: number, max: number, step = .01): Control => ({ label, default: value, min, max, step });
const duration = number('Duration (seconds)', .35, .02, 10);
const strength = number('Strength', 1, 0, 3);
const definitions: PresetDefinition[] = [
  { id: 'Text', name: 'Text', version: 1, kind: 'title', controls: {} },
  { id: 'Dark Box Text Lower Third', name: 'Dark Box Text Lower Third', version: 1, kind: 'title', controls: { opacity: number('Box opacity', .8, 0, 1) } },
  { id: 'pop-in', name: 'Pop in', version: 1, kind: 'animation', controls: {
    duration, from: number('Entry scale', .75, 0, 3),
    overshoot: number('Overshoot', .125, 0, 1), peak: number('Peak position', .5, .01, .99),
  } },
  ...['fade-in', 'fade-out', 'grow', 'zoom', 'slide-in', 'slide-out'].map((id):PresetDefinition => ({ id, name: id.replace(/-/g, ' '), version: 1, kind: 'animation' as const,
    controls: id === 'grow' ? { duration, from: number('Entry scale', .2, 0, 3), overshoot: number('Overshoot', .15, 0, 1) }
      : id === 'zoom' ? { duration, from: number('Initial zoom', 1, .1, 5), to: number('Final zoom', 1.2, .1, 5) }
      : id.startsWith('slide') ? { duration, distance: number('Distance', .3, -2, 2) } : { duration } })),
  { id: 'Gaussian Blur', name: 'Gaussian Blur', version: 1, kind: 'effect', controls: { radius: number('Radius (pixels)', 12, 0, 100, 1) } },
  { id: 'Colored Border', name: 'Colored Border', version: 1, kind: 'effect', controls: {
    color: { label: 'Border color', default: '#ffffff' },
    width: number('Border width (pixels)', 36, 0, 1000, 1),
    cornerRadius: number('Corner radius (pixels)', 0, 0, 2000, 1),
    softEdge: number('Soft edge (pixels)', 0, 0, 200, 1),
    onCanvas: { label: 'Frame whole canvas', default: true },
  } },
  { id: 'Camera Shake', name: 'Camera Shake', version: 1, kind: 'effect', controls: { amplitude: number('Amplitude', .012, 0, .2), frequency: number('Frequency', 8, .1, 30), rotation: number('Rotation', 1, 0, 20) } },
  { id: '3D Keyer', name: '3D Keyer', version: 1, kind: 'effect', controls: { color: { label: 'Key color', default: '#00ff00' }, tolerance: number('Tolerance', .25, 0, 1), softness: number('Softness', .08, .001, .5), spill: number('Spill', .5, 0, 1) } },
  { id: 'dissolve', name: 'Dissolve', version: 1, kind: 'transition', controls: {} },
  ...['Xir_Dia_Ab_Dr_v4','Xir_Dia_Ab_Iz_v4','Xir_Dia_Ar_Dr_v4','Xir_Dia_Ar_Iz_v4','Xir_Hor_Drch_v4','Xir_Hor_Izq_v4','Xir_Rad_AHor_v4','Xir_Rad_Hor_v4','Xir_Ver_Arb_v4','Xir_Zoom_v4'].map(id => ({ id, name: id, version: 1, kind: 'transition' as const, controls: { strength, blur: number('Motion blur', 1, 0, 3) } })),
];
export const presetRegistry = Object.fromEntries(definitions.map(p => [p.id, p])) as Record<string, PresetDefinition>;
export function presetInstance(id: string): PresetInstance {
  const p = presetRegistry[id]; if (!p) throw new Error(`Unknown preset: ${id}`);
  return { presetId: id, presetVersion: p.version, params: Object.fromEntries(Object.entries(p.controls).map(([k,v]) => [k,v.default])), seed: 42 };
}
export function validatePreset(p: PresetInstance) {
  const definition = presetRegistry[p.presetId];
  if (!definition || p.presetVersion !== definition.version) throw new Error(`Unavailable preset version: ${p.presetId} v${p.presetVersion}`);
  for (const [key, value] of Object.entries(p.params)) {
    const control = definition.controls[key];
    if (!control || typeof value !== typeof control.default || typeof value === 'number' && (!Number.isFinite(value) || value < control.min! || value > control.max!)) throw new Error(`Invalid ${p.presetId} parameter: ${key}`);
  }
}
export const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));
export const expo = (p: number) => p <= 0 ? 0 : p >= 1 ? 1 : p < .5 ? Math.pow(2, 20*p-10)/2 : (2-Math.pow(2,-20*p+10))/2;
const noise = (t: number, seed: number) => Math.sin(t*1.37+seed)*.6 + Math.sin(t*2.91+seed*3)*.4;
export function animate(layer: FrameLayer, p: PresetInstance, elapsed: number, remaining: number) {
  const definition = presetRegistry[p.presetId];
  const params = { ...Object.fromEntries(Object.entries(definition.controls).map(([k,v]) => [k,v.default])), ...p.params };
  const n = (k: string) => Number(params[k]);
  const progress = clamp(elapsed / (n('duration') || 1));
  const transform = layer.transform;
  switch (p.presetId) {
    case 'fade-in': transform.opacity *= progress; break;
    case 'fade-out': transform.opacity *= clamp(remaining / n('duration')); break;
    case 'grow': { const ease = 1-Math.pow(1-progress,3); const overshoot = Math.sin(progress*Math.PI)*n('overshoot'); const scale = n('from')+(1-n('from'))*ease+overshoot; transform.scaleX *= scale; transform.scaleY *= scale; break; }
    case 'pop-in': {
      const peak=n('peak'), top=1+n('overshoot');
      const scale=progress<=peak
        ? n('from')+(top-n('from'))*progress/peak
        : top+(1-top)*(progress-peak)/(1-peak);
      transform.scaleX*=scale; transform.scaleY*=scale; break;
    }
    case 'zoom': { const scale=n('from')+(n('to')-n('from'))*expo(progress); transform.scaleX*=scale; transform.scaleY*=scale; break; }
    case 'slide-in': transform.y += (1-expo(progress))*n('distance'); break;
    case 'slide-out': transform.y += (1-expo(clamp(remaining/n('duration'))))*n('distance'); break;
    case 'Gaussian Blur': layer.blur += n('radius'); break;
    case 'Camera Shake': { const t=elapsed*n('frequency')*Math.PI*2; transform.x+=noise(t,p.seed || 42)*n('amplitude'); transform.y+=noise(t, (p.seed || 42)+10)*n('amplitude'); transform.rotation+=noise(t,(p.seed || 42)+30)*n('rotation'); break; }
    case '3D Keyer': layer.keyColor=String(params.color); layer.keyTolerance=n('tolerance'); layer.keySoftness=n('softness'); layer.keySpill=n('spill'); break;
  }
}
// Fusion's coordinate system points up. These vectors convert its original centers to canvas coordinates.
const vectors: Record<string, [number, number, number]> = {
  Xir_Dia_Ab_Dr_v4: [1,1,-33], Xir_Dia_Ab_Iz_v4: [-1,1,33],
  Xir_Dia_Ar_Dr_v4: [1,-1,33], Xir_Dia_Ar_Iz_v4: [-1,-1,-33],
  Xir_Hor_Drch_v4: [1,0,0], Xir_Hor_Izq_v4: [-1,0,0], Xir_Ver_Arb_v4: [0,-1,90],
};
export function transitionLayers(out: FrameLayer, incoming: FrameLayer, preset: PresetInstance, progress: number) {
  const id=preset.presetId; const motion=expo(progress); const strength=Number(preset.params.strength ?? 1);
  const blend=id==='dissolve' ? progress : clamp((progress-.4)*5);
  const group=out.id.split(':')[0];
  out.transition={group,mix:blend,offsetX:0,offsetY:0,rotation:0,scale:1,blur:0,angle:0,radial:0,zoomBlur:0};incoming.transition={...out.transition};
  const vector=vectors[id];
  if (vector) {
    out.transition.offsetX=vector[0]*motion*strength;out.transition.offsetY=vector[1]*motion*strength;
    incoming.transition.offsetX=vector[0]*(motion-1)*strength;incoming.transition.offsetY=vector[1]*(motion-1)*strength;
    out.transition.blur=incoming.transition.blur=50*Math.pow(Math.min(progress,1-progress),8)*Number(preset.params.blur ?? 1);
    out.transition.angle=incoming.transition.angle=vector[2];
  } else if (id.startsWith('Xir_Rad')) {
    const sign=id==='Xir_Rad_Hor_v4'?-1:1;
    out.transition.rotation=incoming.transition.rotation=sign*360*motion*strength;
    out.transition.blur=incoming.transition.blur=6*Math.pow(Math.min(progress,1-progress),5)*Number(preset.params.blur ?? 1);
    out.transition.angle=incoming.transition.angle=-sign*200*Math.pow(Math.min(progress,1-progress),3);
  } else if (id==='Xir_Zoom_v4') {
    out.transition.scale=1+motion*strength;incoming.transition.scale=Math.max(.001,1+(motion-1)*strength);
    out.transition.zoomBlur=incoming.transition.zoomBlur=8*Math.pow(Math.min(progress,1-progress),6)*Number(preset.params.blur ?? 1);
  }
  out.mirrorEdges=incoming.mirrorEdges=id!=='dissolve';
}
