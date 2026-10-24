"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// frontend/src/composition/runtime.ts
var runtime_exports = {};
__export(runtime_exports, {
  IntervalIndex: () => IntervalIndex,
  animate: () => animate,
  applyOperations: () => applyOperations,
  captionGroups: () => captionGroups,
  captionSrt: () => captionSrt,
  clamp: () => clamp,
  colorGradeFragment: () => colorGradeFragment,
  compileComposition: () => compileComposition,
  cutNarration: () => cutNarration,
  defaultColorGrade: () => defaultColorGrade,
  defaultTextStyle: () => defaultTextStyle,
  defaultTransform: () => defaultTransform,
  editToSource: () => editToSource,
  emptyComposition: () => emptyComposition,
  evaluateFrame: () => evaluateFrame,
  expo: () => expo,
  getEffectiveCutRanges: () => getEffectiveCutRanges,
  getLockedCutBoundaries: () => getLockedCutBoundaries,
  isColorGraded: () => isColorGraded,
  moveNarration: () => moveNarration,
  narrationManifestClips: () => narrationManifestClips,
  naturalNarration: () => naturalNarration,
  normalizeColorGrade: () => normalizeColorGrade,
  orderedKeepSegments: () => orderedKeepSegments,
  orderedWordIndices: () => orderedWordIndices,
  pasteNarration: () => pasteNarration,
  presetInstance: () => presetInstance,
  presetRegistry: () => presetRegistry,
  reconcileNarration: () => reconcileNarration,
  resolvePlacement: () => resolvePlacement,
  resolvePlacementSpans: () => resolvePlacementSpans,
  seconds: () => seconds,
  sourceToEdit: () => sourceToEdit,
  speechPlacementForTimeline: () => speechPlacementForTimeline,
  splitNarrationAtSource: () => splitNarrationAtSource,
  transitionLayers: () => transitionLayers,
  us: () => us,
  validateComposition: () => validateComposition,
  validateElement: () => validateElement,
  validateNarration: () => validateNarration,
  validatePreset: () => validatePreset,
  validateProject: () => validateProject,
  visualTimingRequest: () => visualTimingRequest,
  withCaptions: () => withCaptions
});
module.exports = __toCommonJS(runtime_exports);

// frontend/src/composition/types.ts
var us = (seconds2) => Math.round(seconds2 * 1e6);
var seconds = (timeUs) => timeUs / 1e6;
var defaultTransform = () => ({
  x: 0.5,
  y: 0.5,
  width: 1,
  height: 1,
  scaleX: 1,
  scaleY: 1,
  pivotX: 0.5,
  pivotY: 0.5,
  rotation: 0,
  pitch: 0,
  yaw: 0,
  opacity: 1,
  fit: "contain",
  crop: { left: 0, right: 0, top: 0, bottom: 0 }
});
var defaultTextStyle = () => ({
  fontFamily: "Arial",
  fontSize: 72,
  fontWeight: 700,
  color: "#ffffff",
  align: "center",
  strokeColor: "#000000",
  strokeWidth: 3,
  shadowColor: "#000000",
  shadowBlur: 8,
  shadowX: 3,
  shadowY: 4,
  backgroundColor: "#00000000",
  padding: 16,
  lineHeight: 1.2
});
var emptyComposition = () => ({
  version: 2,
  canvas: { width: 1920, height: 1080, fps: { num: 30, den: 1 }, background: "#000000" },
  assets: {},
  tracks: [
    { id: "base", name: "Base", kind: "visual", order: 0, muted: false },
    { id: "visual", name: "Visuals", kind: "visual", order: 1, muted: false },
    { id: "text", name: "Text", kind: "visual", order: 2, muted: false },
    { id: "music", name: "Music", kind: "audio", order: 3, muted: false },
    { id: "sound", name: "Sounds", kind: "audio", order: 4, muted: false }
  ],
  elements: {},
  transitions: {},
  presetVariants: {},
  masterGainDb: 0,
  buses: {
    voice: { gainDb: 0, mute: false },
    music: { gainDb: 0, mute: false },
    sound: { gainDb: 0, mute: false },
    supplemental: { gainDb: 0, mute: false }
  }
});

// frontend/src/composition/colorGrade.ts
var defaultColorGrade = () => ({ enabled: true, exposure: 0, temperature: 0, tint: 0, contrast: 1, saturation: 1, shadows: 0, midtones: 0, highlights: 0, rolloff: 0, mask: null });
function normalizeColorGrade(grade) {
  if (grade != null && (typeof grade !== "object" || Array.isArray(grade))) throw new Error("Invalid color grade");
  const defined = (v) => Object.fromEntries(Object.entries(v).filter(([, value]) => value !== void 0));
  const g = { ...defaultColorGrade(), ...defined(grade || {}) };
  if (g.mask != null) {
    if (typeof g.mask !== "object" || Array.isArray(g.mask)) throw new Error("Invalid grade mask");
    g.mask = { shape: "ellipse", x: 0.5, y: 0.5, width: 0.5, height: 0.5, feather: 0.1, invert: false, ...defined(g.mask) };
  }
  return g;
}
function isColorGraded(grade) {
  if (!grade || grade.enabled === false) return false;
  const g = normalizeColorGrade(grade);
  return g.exposure !== 0 || g.temperature !== 0 || g.tint !== 0 || g.contrast !== 1 || g.saturation !== 1 || g.shadows !== 0 || g.midtones !== 0 || g.highlights !== 0 || g.rolloff !== 0;
}
var colorGradeFragment = `#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;
uniform sampler2D u_texture;uniform bool u_flip;
uniform vec4 u_primary;uniform vec4 u_tone;uniform float u_rolloff;
uniform vec4 u_region;uniform vec3 u_mask;
vec3 linearize(vec3 x){return mix(x/12.92,pow((max(x,vec3(0))+.055)/1.055,vec3(2.4)),step(vec3(.04045),x));}
vec3 encode(vec3 x){x=max(x,vec3(0));return mix(x*12.92,1.055*pow(x,vec3(1.0/2.4))-.055,step(vec3(.0031308),x));}
void main(){vec2 uv=v_uv;if(u_flip)uv.y=1.0-uv.y;vec4 original=texture(u_texture,uv);
 vec3 gain=exp2(vec3(u_primary.y*.4+u_primary.z*.15,-u_primary.z*.3,-u_primary.y*.4+u_primary.z*.15));gain/=dot(gain,vec3(.2126,.7152,.0722));
 vec3 c=encode(linearize(original.rgb)*gain*exp2(u_primary.x));
 c=(c-.5)*u_primary.w+.5;float l=clamp(dot(c,vec3(.2126,.7152,.0722)),0.0,1.0);
 c+=.2*(u_tone.y*pow(1.0-l,3.0)+u_tone.z*4.0*l*(1.0-l)+u_tone.w*pow(l,3.0));
 c=mix(vec3(dot(c,vec3(.2126,.7152,.0722))),c,u_tone.x);
 vec3 high=max(c-.6,vec3(0));c-=u_rolloff*high*high/(high+.4);
 float amount=1.0;if(u_mask.x>0.0){vec2 d=abs((v_uv-u_region.xy)/max(u_region.zw*.5,vec2(.00001)));float distanceToEdge=u_mask.x>1.5?length(d):max(d.x,d.y);amount=1.0-smoothstep(1.0-max(.00001,u_mask.y),1.0,distanceToEdge);if(u_mask.z>.5)amount=1.0-amount;}
 outputColor=vec4(mix(original.rgb,clamp(c,vec3(0),vec3(1)),amount),original.a);
}`;

// frontend/src/composition/timeMap.ts
var maps = /* @__PURE__ */ new WeakMap();
function segments(manifest, clipId) {
  if (!maps.has(manifest)) {
    const map = /* @__PURE__ */ new Map();
    map.set("", [...manifest.segments].sort((a, b) => a.globalSourceStartUs - b.globalSourceStartUs));
    for (const segment of manifest.segments) {
      if (!map.has(segment.clipId)) map.set(segment.clipId, []);
      map.get(segment.clipId).push(segment);
    }
    for (const [key, list] of map) if (key) list.sort((a, b) => a.sourceStartUs - b.sourceStartUs);
    maps.set(manifest, map);
  }
  return maps.get(manifest).get(clipId || "") || [];
}
function search(items, value, start) {
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (start(items[mid]) <= value) lo = mid + 1;
    else hi = mid;
  }
  return items[lo - 1];
}
function sourceToEdit(manifest, sourceUs, clipId) {
  const segment = search(segments(manifest, clipId), sourceUs, (s) => clipId ? s.sourceStartUs : s.globalSourceStartUs);
  if (!segment) return null;
  const start = clipId ? segment.sourceStartUs : segment.globalSourceStartUs, length = segment.sourceEndUs - segment.sourceStartUs;
  return sourceUs < start + length ? segment.editStartUs + sourceUs - start : null;
}
function editToSource(manifest, editUs) {
  const s = search(manifest.segments, Math.max(0, editUs), (s2) => s2.editStartUs) || manifest.segments[0];
  return s ? { clipId: s.clipId, sourceUs: s.sourceStartUs + Math.min(s.editEndUs - s.editStartUs - 1, Math.max(0, editUs - s.editStartUs)), globalSourceUs: s.globalSourceStartUs + Math.min(s.editEndUs - s.editStartUs - 1, Math.max(0, editUs - s.editStartUs)) } : null;
}
function resolvePlacementSpans(p, manifest, words) {
  const limit = (a, b) => ({ startUs: Math.max(0, Math.min(manifest.durationUs, a)), endUs: Math.max(0, Math.min(manifest.durationUs, b)) });
  if (p.kind === "timeline") return (p.ranges || [{ startUs: p.startUs, endUs: p.endUs }]).map((s) => limit(s.startUs, s.endUs)).filter((s) => s.endUs > s.startUs);
  if (p.kind === "project") return [limit(p.startOffsetUs, manifest.durationUs + p.endOffsetUs)].filter((s) => s.endUs > s.startUs);
  const intervals = [];
  let startOffset = p.startOffsetUs || 0, endOffset = p.endOffsetUs || 0;
  if (p.kind === "speech") {
    let members = p.memberWordIds;
    if (!members) {
      const a = words.findIndex((w) => w.id === p.startWordId), b = words.findIndex((w) => w.id === p.endWordId);
      if (a < 0 || b < a) return [];
      members = words.slice(a, b + 1).flatMap((w) => w.id ? [w.id] : []);
    }
    const membership = new Set(members), removed = new Set(manifest.removedWordIds || []);
    const bound = (w, side) => {
      const explicit = side === "start" ? startOffset : endOffset;
      const acoustic = p.timingBasis !== "transcript" && (p.timingBasis === "acoustic" || !explicit);
      const actual = w.id ? manifest.wordTimings?.[w.id] : void 0;
      return acoustic && actual ? actual[side === "start" ? "startUs" : "endUs"] : us(w[side]);
    };
    if (removed.has(p.startWordId) || !words.some((w) => w.id === p.startWordId)) startOffset = 0;
    if (removed.has(p.endWordId) || !words.some((w) => w.id === p.endWordId)) endOffset = 0;
    const ownClips = new Set(words.filter((w) => w.id && membership.has(w.id)).flatMap((w) => w.clipId ? [w.clipId] : []));
    const mapRange = (a, b, restrictOwnClips) => manifest.segments.filter((s) => (!restrictOwnClips || !ownClips.size || ownClips.has(s.clipId)) && s.globalSourceStartUs < b && s.globalSourceStartUs + s.sourceEndUs - s.sourceStartUs > a).map((s) => ({ startUs: s.editStartUs + Math.max(a - s.globalSourceStartUs, 0), endUs: s.editStartUs + Math.min(b - s.globalSourceStartUs, s.sourceEndUs - s.sourceStartUs) }));
    let run = [];
    const flush = () => {
      if (run.length) {
        intervals.push(...mapRange(Math.min(...run.map((w) => bound(w, "start"))), Math.max(...run.map((w) => bound(w, "end"))), true));
        run = [];
      }
    };
    for (const word of words) {
      if (word.id && removed.has(word.id)) continue;
      const visible = mapRange(bound(word, "start"), bound(word, "end"), false).some((s) => s.endUs > s.startUs);
      if (!visible) continue;
      if (word.id && membership.has(word.id)) run.push(word);
      else flush();
    }
    flush();
  } else {
    for (const s of manifest.segments) if (s.clipId === p.clipId && s.sourceStartUs < p.endUs && s.sourceEndUs > p.startUs) intervals.push({ startUs: s.editStartUs + Math.max(0, p.startUs - s.sourceStartUs), endUs: s.editStartUs + Math.min(s.sourceEndUs - s.sourceStartUs, p.endUs - s.sourceStartUs) });
  }
  const merged = [];
  for (const interval of intervals.sort((a, b) => a.startUs - b.startUs)) {
    const last = merged.at(-1);
    if (last && interval.startUs <= last.endUs) last.endUs = Math.max(last.endUs, interval.endUs);
    else if (interval.endUs > interval.startUs) merged.push({ ...interval });
  }
  if (merged.length) {
    merged[0].startUs += startOffset;
    merged[merged.length - 1].endUs += endOffset;
  }
  if (p.kind === "speech" && p.endAtCutUs && merged.length && !(manifest.removedWordIds || []).includes(p.endWordId) && words.some((w) => w.id === p.endWordId)) {
    const last = merged.at(-1), members = new Set(p.memberWordIds || words.slice(words.findIndex((w) => w.id === p.startWordId), words.findIndex((w) => w.id === p.endWordId) + 1).map((w) => w.id));
    const cuts = [...manifest.segments.slice(1).filter((s, i) => {
      const previous = manifest.segments[i];
      return s.clipId !== previous.clipId || s.globalSourceStartUs !== previous.globalSourceStartUs + previous.sourceEndUs - previous.sourceStartUs;
    }).map((s) => s.editStartUs), ...manifest.visualCutPointsUs || []].filter((t) => t >= last.endUs && t <= last.endUs + p.endAtCutUs).sort((a, b) => a - b);
    let cut = cuts[0];
    for (const candidate of cuts.slice(1)) {
      if (candidate - cut > 41667) break;
      cut = candidate;
    }
    const removed = new Set(manifest.removedWordIds || []);
    const crossesForeignSpeech = cut !== void 0 && words.some((w) => {
      if (w.id && (members.has(w.id) || removed.has(w.id))) return false;
      const a = w.id && manifest.wordTimings?.[w.id]?.startUs || us(w.start), b = w.id && manifest.wordTimings?.[w.id]?.endUs || us(w.end);
      return manifest.segments.some((s) => {
        const start = Math.max(a, s.globalSourceStartUs), end = Math.min(b, s.globalSourceStartUs + s.sourceEndUs - s.sourceStartUs);
        return end > start && s.editStartUs + end - s.globalSourceStartUs > last.endUs && s.editStartUs + start - s.globalSourceStartUs < cut;
      });
    });
    if (cut !== void 0 && !crossesForeignSpeech) last.endUs = cut;
  }
  return merged.map((s) => limit(s.startUs, s.endUs)).filter((s) => s.endUs > s.startUs);
}
function visualTimingRequest(document) {
  const deleted = new Set((document.deletedRanges || []).flatMap((r) => r.wordIndices)), ids = /* @__PURE__ */ new Set();
  for (const element of Object.values(document.composition?.elements || {})) {
    const p = element.placement;
    if (!element.enabled || p.kind !== "speech" || p.timingBasis === "transcript") continue;
    const a = document.words.findIndex((w) => w.id === p.startWordId), b = document.words.findIndex((w) => w.id === p.endWordId), membership = new Set(p.memberWordIds || document.words.slice(a, b + 1).flatMap((w) => w.id ? [w.id] : []));
    let run = [];
    const flush = () => {
      if (run.length) {
        if (run[0].id) ids.add(run[0].id);
        if (run.at(-1).id) ids.add(run.at(-1).id);
        run = [];
      }
    };
    document.words.forEach((w, i) => {
      if (deleted.has(i)) return;
      if (w.id && membership.has(w.id)) run.push(w);
      else flush();
    });
    flush();
  }
  const points = /* @__PURE__ */ new Set();
  for (const c of document.clips || []) {
    const map = c.sourceMap;
    if (map?.kind !== "silence-processed") continue;
    const sorted = [...map.segments].sort((a, b) => a.processedStartUs - b.processedStartUs);
    sorted.slice(1).forEach((s, i) => {
      if (s.originalStartUs > sorted[i].originalEndUs) points.add(us(c.start) + s.processedStartUs);
    });
  }
  return { visual_word_ids: [...ids].sort().slice(0, 1e3), visual_cut_points: [...points].sort((a, b) => a - b) };
}
function resolvePlacement(p, manifest, words) {
  const spans = resolvePlacementSpans(p, manifest, words);
  return { startUs: spans[0]?.startUs || 0, endUs: spans.at(-1)?.endUs || 0 };
}
function speechPlacementForTimeline(startUs, endUs, manifest, words) {
  const removed = new Set(manifest.removedWordIds || []), chosen = words.filter((w) => w.id && !removed.has(w.id) && manifest.segments.some((s) => {
    const a = Math.max(us(w.start), s.globalSourceStartUs), b = Math.min(us(w.end), s.globalSourceStartUs + s.sourceEndUs - s.sourceStartUs);
    return b > a && s.editStartUs + b - s.globalSourceStartUs > startUs && s.editStartUs + a - s.globalSourceStartUs < endUs;
  }));
  if (!chosen.length) return { kind: "timeline", startUs, endUs };
  const firstClip = chosen[0].clipId || "base", clipWords = chosen.filter((w) => (w.clipId || "base") === firstClip), segment = manifest.segments.find((s) => s.clipId === firstClip), clipOffset = segment ? segment.globalSourceStartUs - segment.sourceStartUs : 0;
  const placement = { kind: "speech", startWordId: chosen[0].id, endWordId: chosen.at(-1).id, memberWordIds: chosen.map((w) => w.id), startOffsetUs: 0, endOffsetUs: 0, fallbackClock: "clip-local", fallback: { clipId: firstClip, startUs: Math.min(...clipWords.map((w) => us(w.start))) - clipOffset, endUs: Math.max(...clipWords.map((w) => us(w.end))) - clipOffset } };
  const resolved = resolvePlacement(placement, manifest, words);
  placement.startOffsetUs = startUs - resolved.startUs;
  placement.endOffsetUs = endUs - resolved.endUs;
  return placement;
}

// frontend/src/composition/presetRegistry.ts
var number = (label, value, min, max, step = 0.01) => ({ label, default: value, min, max, step });
var duration = number("Duration (seconds)", 0.35, 0.02, 10);
var strength = number("Strength", 1, 0, 3);
var definitions = [
  { id: "Text", name: "Text", version: 1, kind: "title", controls: {} },
  { id: "Dark Box Text Lower Third", name: "Dark Box Text Lower Third", version: 1, kind: "title", controls: { opacity: number("Box opacity", 0.8, 0, 1) } },
  { id: "pop-in", name: "Pop in", version: 1, kind: "animation", controls: {
    duration,
    from: number("Entry scale", 0.75, 0, 3),
    overshoot: number("Overshoot", 0.125, 0, 1),
    peak: number("Peak position", 0.5, 0.01, 0.99)
  } },
  ...["fade-in", "fade-out", "grow", "zoom", "slide-in", "slide-out"].map((id) => ({
    id,
    name: id.replace(/-/g, " "),
    version: 1,
    kind: "animation",
    controls: id === "grow" ? { duration, from: number("Entry scale", 0.2, 0, 3), overshoot: number("Overshoot", 0.15, 0, 1) } : id === "zoom" ? { duration, from: number("Initial zoom", 1, 0.1, 5), to: number("Final zoom", 1.2, 0.1, 5) } : id.startsWith("slide") ? { duration, distance: number("Distance", 0.3, -2, 2) } : { duration }
  })),
  { id: "Gaussian Blur", name: "Gaussian Blur", version: 1, kind: "effect", controls: { radius: number("Radius (pixels)", 12, 0, 100, 1) } },
  { id: "Colored Border", name: "Colored Border", version: 1, kind: "effect", controls: {
    color: { label: "Border color", default: "#ffffff" },
    width: number("Border width (pixels)", 36, 0, 1e3, 1),
    cornerRadius: number("Corner radius (pixels)", 0, 0, 2e3, 1),
    softEdge: number("Soft edge (pixels)", 0, 0, 200, 1),
    onCanvas: { label: "Frame whole canvas", default: true }
  } },
  { id: "Camera Shake", name: "Camera Shake", version: 1, kind: "effect", controls: { amplitude: number("Amplitude", 0.012, 0, 0.2), frequency: number("Frequency", 8, 0.1, 30), rotation: number("Rotation", 1, 0, 20) } },
  { id: "3D Keyer", name: "3D Keyer", version: 1, kind: "effect", controls: { color: { label: "Key color", default: "#00ff00" }, tolerance: number("Tolerance", 0.25, 0, 1), softness: number("Softness", 0.08, 1e-3, 0.5), spill: number("Spill", 0.5, 0, 1) } },
  { id: "dissolve", name: "Dissolve", version: 1, kind: "transition", controls: {} },
  ...["Xir_Dia_Ab_Dr_v4", "Xir_Dia_Ab_Iz_v4", "Xir_Dia_Ar_Dr_v4", "Xir_Dia_Ar_Iz_v4", "Xir_Hor_Drch_v4", "Xir_Hor_Izq_v4", "Xir_Rad_AHor_v4", "Xir_Rad_Hor_v4", "Xir_Ver_Arb_v4", "Xir_Zoom_v4"].map((id) => ({ id, name: id, version: 1, kind: "transition", controls: { strength, blur: number("Motion blur", 1, 0, 3) } }))
];
var presetRegistry = Object.fromEntries(definitions.map((p) => [p.id, p]));
function presetInstance(id) {
  const p = presetRegistry[id];
  if (!p) throw new Error(`Unknown preset: ${id}`);
  return { presetId: id, presetVersion: p.version, params: Object.fromEntries(Object.entries(p.controls).map(([k, v]) => [k, v.default])), seed: 42 };
}
function validatePreset(p) {
  const definition = presetRegistry[p.presetId];
  if (!definition || p.presetVersion !== definition.version) throw new Error(`Unavailable preset version: ${p.presetId} v${p.presetVersion}`);
  for (const [key, value] of Object.entries(p.params)) {
    const control = definition.controls[key];
    if (!control || typeof value !== typeof control.default || typeof value === "number" && (!Number.isFinite(value) || value < control.min || value > control.max)) throw new Error(`Invalid ${p.presetId} parameter: ${key}`);
  }
}
var clamp = (value, min = 0, max = 1) => Math.max(min, Math.min(max, value));
var expo = (p) => p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? Math.pow(2, 20 * p - 10) / 2 : (2 - Math.pow(2, -20 * p + 10)) / 2;
var noise = (t, seed) => Math.sin(t * 1.37 + seed) * 0.6 + Math.sin(t * 2.91 + seed * 3) * 0.4;
function animate(layer, p, elapsed, remaining) {
  const definition = presetRegistry[p.presetId];
  const params = { ...Object.fromEntries(Object.entries(definition.controls).map(([k, v]) => [k, v.default])), ...p.params };
  const n = (k) => Number(params[k]);
  const progress = clamp(elapsed / (n("duration") || 1));
  const transform = layer.transform;
  switch (p.presetId) {
    case "fade-in":
      transform.opacity *= progress;
      break;
    case "fade-out":
      transform.opacity *= clamp(remaining / n("duration"));
      break;
    case "grow": {
      const ease = 1 - Math.pow(1 - progress, 3);
      const overshoot = Math.sin(progress * Math.PI) * n("overshoot");
      const scale = n("from") + (1 - n("from")) * ease + overshoot;
      transform.scaleX *= scale;
      transform.scaleY *= scale;
      break;
    }
    case "pop-in": {
      const peak = n("peak"), top = 1 + n("overshoot");
      const scale = progress <= peak ? n("from") + (top - n("from")) * progress / peak : top + (1 - top) * (progress - peak) / (1 - peak);
      transform.scaleX *= scale;
      transform.scaleY *= scale;
      break;
    }
    case "zoom": {
      const scale = n("from") + (n("to") - n("from")) * expo(progress);
      transform.scaleX *= scale;
      transform.scaleY *= scale;
      break;
    }
    case "slide-in":
      transform.y += (1 - expo(progress)) * n("distance");
      break;
    case "slide-out":
      transform.y += (1 - expo(clamp(remaining / n("duration")))) * n("distance");
      break;
    case "Gaussian Blur":
      layer.blur += n("radius");
      break;
    case "Camera Shake": {
      const t = elapsed * n("frequency") * Math.PI * 2;
      transform.x += noise(t, p.seed || 42) * n("amplitude");
      transform.y += noise(t, (p.seed || 42) + 10) * n("amplitude");
      transform.rotation += noise(t, (p.seed || 42) + 30) * n("rotation");
      break;
    }
    case "3D Keyer":
      layer.keyColor = String(params.color);
      layer.keyTolerance = n("tolerance");
      layer.keySoftness = n("softness");
      layer.keySpill = n("spill");
      break;
  }
}
var vectors = {
  Xir_Dia_Ab_Dr_v4: [1, 1, -33],
  Xir_Dia_Ab_Iz_v4: [-1, 1, 33],
  Xir_Dia_Ar_Dr_v4: [1, -1, 33],
  Xir_Dia_Ar_Iz_v4: [-1, -1, -33],
  Xir_Hor_Drch_v4: [1, 0, 0],
  Xir_Hor_Izq_v4: [-1, 0, 0],
  Xir_Ver_Arb_v4: [0, -1, 90]
};
function transitionLayers(out, incoming, preset, progress) {
  const id = preset.presetId;
  const motion = expo(progress);
  const strength2 = Number(preset.params.strength ?? 1);
  const blend = id === "dissolve" ? progress : clamp((progress - 0.4) * 5);
  const group = out.id.split(":")[0];
  out.transition = { group, mix: blend, offsetX: 0, offsetY: 0, rotation: 0, scale: 1, blur: 0, angle: 0, radial: 0, zoomBlur: 0 };
  incoming.transition = { ...out.transition };
  const vector = vectors[id];
  if (vector) {
    out.transition.offsetX = vector[0] * motion * strength2;
    out.transition.offsetY = vector[1] * motion * strength2;
    incoming.transition.offsetX = vector[0] * (motion - 1) * strength2;
    incoming.transition.offsetY = vector[1] * (motion - 1) * strength2;
    out.transition.blur = incoming.transition.blur = 50 * Math.pow(Math.min(progress, 1 - progress), 8) * Number(preset.params.blur ?? 1);
    out.transition.angle = incoming.transition.angle = vector[2];
  } else if (id.startsWith("Xir_Rad")) {
    const sign = id === "Xir_Rad_Hor_v4" ? -1 : 1;
    out.transition.rotation = incoming.transition.rotation = sign * 360 * motion * strength2;
    out.transition.blur = incoming.transition.blur = 6 * Math.pow(Math.min(progress, 1 - progress), 5) * Number(preset.params.blur ?? 1);
    out.transition.angle = incoming.transition.angle = -sign * 200 * Math.pow(Math.min(progress, 1 - progress), 3);
  } else if (id === "Xir_Zoom_v4") {
    out.transition.scale = 1 + motion * strength2;
    incoming.transition.scale = Math.max(1e-3, 1 + (motion - 1) * strength2);
    out.transition.zoomBlur = incoming.transition.zoomBlur = 8 * Math.pow(Math.min(progress, 1 - progress), 6) * Number(preset.params.blur ?? 1);
  }
  out.mirrorEdges = incoming.mirrorEdges = id !== "dissolve";
}

// shared/composition-schema.json
var composition_schema_default = {
  $defs: {
    Asset: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        kind: {
          enum: [
            "image",
            "video",
            "audio",
            "font"
          ],
          title: "Kind",
          type: "string"
        },
        path: {
          title: "Path",
          type: "string"
        },
        hash: {
          title: "Hash",
          type: "string"
        },
        name: {
          title: "Name",
          type: "string"
        },
        durationUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Durationus",
          type: "integer"
        },
        width: {
          maximum: 16384,
          minimum: 0,
          title: "Width",
          type: "integer"
        },
        height: {
          maximum: 16384,
          minimum: 0,
          title: "Height",
          type: "integer"
        },
        fps: {
          anyOf: [
            {
              $ref: "#/$defs/MediaFrameRate"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        hasAudio: {
          title: "Hasaudio",
          type: "boolean"
        },
        hasAlpha: {
          title: "Hasalpha",
          type: "boolean"
        },
        status: {
          enum: [
            "ready",
            "missing",
            "failed",
            "preparing"
          ],
          title: "Status",
          type: "string"
        },
        previewPath: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Previewpath"
        },
        thumbnailPath: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Thumbnailpath"
        },
        fontFamily: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Fontfamily"
        },
        normalizedPath: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Normalizedpath"
        },
        rotation: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Rotation"
        },
        color: {
          anyOf: [
            {
              additionalProperties: {
                type: "string"
              },
              type: "object"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Color"
        },
        provenance: {
          anyOf: [
            {
              $ref: "#/$defs/Provenance"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "id",
        "kind",
        "path",
        "hash",
        "name",
        "durationUs",
        "width",
        "height",
        "hasAudio",
        "hasAlpha",
        "status"
      ],
      title: "Asset",
      type: "object"
    },
    AudioSettings: {
      additionalProperties: false,
      properties: {
        gainDb: {
          maximum: 24,
          minimum: -96,
          title: "Gaindb",
          type: "number"
        },
        mute: {
          title: "Mute",
          type: "boolean"
        },
        fadeInUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Fadeinus",
          type: "integer"
        },
        fadeOutUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Fadeoutus",
          type: "integer"
        },
        ducking: {
          title: "Ducking",
          type: "boolean"
        },
        bus: {
          enum: [
            "voice",
            "music",
            "sound",
            "supplemental"
          ],
          title: "Bus",
          type: "string"
        },
        envelopeWindow: {
          anyOf: [
            {
              $ref: "#/$defs/ContentWindow"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "gainDb",
        "mute",
        "fadeInUs",
        "fadeOutUs",
        "ducking",
        "bus"
      ],
      title: "AudioSettings",
      type: "object"
    },
    Bus: {
      additionalProperties: false,
      properties: {
        gainDb: {
          maximum: 24,
          minimum: -96,
          title: "Gaindb",
          type: "number"
        },
        mute: {
          title: "Mute",
          type: "boolean"
        }
      },
      required: [
        "gainDb",
        "mute"
      ],
      title: "Bus",
      type: "object"
    },
    Canvas: {
      additionalProperties: false,
      properties: {
        width: {
          maximum: 7680,
          minimum: 16,
          title: "Width",
          type: "integer"
        },
        height: {
          maximum: 4320,
          minimum: 16,
          title: "Height",
          type: "integer"
        },
        fps: {
          $ref: "#/$defs/Rational"
        },
        background: {
          title: "Background",
          type: "string"
        }
      },
      required: [
        "width",
        "height",
        "fps",
        "background"
      ],
      title: "Canvas",
      type: "object"
    },
    ColorGrade: {
      additionalProperties: false,
      properties: {
        enabled: {
          default: true,
          title: "Enabled",
          type: "boolean"
        },
        exposure: {
          default: 0,
          maximum: 5,
          minimum: -5,
          title: "Exposure",
          type: "number"
        },
        temperature: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Temperature",
          type: "number"
        },
        tint: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Tint",
          type: "number"
        },
        contrast: {
          default: 1,
          maximum: 3,
          minimum: 0,
          title: "Contrast",
          type: "number"
        },
        saturation: {
          default: 1,
          maximum: 3,
          minimum: 0,
          title: "Saturation",
          type: "number"
        },
        shadows: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Shadows",
          type: "number"
        },
        midtones: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Midtones",
          type: "number"
        },
        highlights: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Highlights",
          type: "number"
        },
        rolloff: {
          default: 0,
          maximum: 1,
          minimum: 0,
          title: "Rolloff",
          type: "number"
        },
        mask: {
          anyOf: [
            {
              $ref: "#/$defs/GradeMask"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      title: "ColorGrade",
      type: "object"
    },
    ContentWindow: {
      additionalProperties: false,
      properties: {
        offsetUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Offsetus",
          type: "integer"
        },
        durationUs: {
          exclusiveMinimum: 0,
          title: "Durationus",
          type: "integer"
        }
      },
      required: [
        "offsetUs",
        "durationUs"
      ],
      title: "ContentWindow",
      type: "object"
    },
    Crop: {
      additionalProperties: false,
      properties: {
        left: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Left",
          type: "number"
        },
        right: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Right",
          type: "number"
        },
        top: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Top",
          type: "number"
        },
        bottom: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Bottom",
          type: "number"
        }
      },
      required: [
        "left",
        "right",
        "top",
        "bottom"
      ],
      title: "Crop",
      type: "object"
    },
    Element: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        kind: {
          enum: [
            "base",
            "image",
            "video",
            "text",
            "audio"
          ],
          title: "Kind",
          type: "string"
        },
        trackId: {
          title: "Trackid",
          type: "string"
        },
        order: {
          title: "Order",
          type: "integer"
        },
        label: {
          title: "Label",
          type: "string"
        },
        enabled: {
          title: "Enabled",
          type: "boolean"
        },
        createdBy: {
          enum: [
            "manual",
            "ai",
            "migration"
          ],
          title: "Createdby",
          type: "string"
        },
        placement: {
          $ref: "#/$defs/Placement"
        },
        transform: {
          $ref: "#/$defs/Transform"
        },
        presets: {
          items: {
            $ref: "#/$defs/Preset"
          },
          title: "Presets",
          type: "array"
        },
        assetId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Assetid"
        },
        text: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Text"
        },
        textStyle: {
          anyOf: [
            {
              $ref: "#/$defs/TextStyle"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        audio: {
          anyOf: [
            {
              $ref: "#/$defs/AudioSettings"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        sourceInUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Sourceinus",
          type: "integer"
        },
        endPolicy: {
          enum: [
            "hold",
            "loop",
            "trim"
          ],
          title: "Endpolicy",
          type: "string"
        },
        contentWindow: {
          anyOf: [
            {
              $ref: "#/$defs/ContentWindow"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        matteColor: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Mattecolor"
        },
        colorGrade: {
          anyOf: [
            {
              $ref: "#/$defs/ColorGrade"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "id",
        "kind",
        "trackId",
        "order",
        "label",
        "enabled",
        "createdBy",
        "placement",
        "transform",
        "presets",
        "sourceInUs",
        "endPolicy"
      ],
      title: "Element",
      type: "object"
    },
    GradeMask: {
      additionalProperties: false,
      properties: {
        shape: {
          default: "ellipse",
          enum: [
            "rectangle",
            "ellipse"
          ],
          title: "Shape",
          type: "string"
        },
        x: {
          default: 0.5,
          maximum: 1,
          minimum: 0,
          title: "X",
          type: "number"
        },
        y: {
          default: 0.5,
          maximum: 1,
          minimum: 0,
          title: "Y",
          type: "number"
        },
        width: {
          default: 0.5,
          exclusiveMinimum: 0,
          maximum: 2,
          title: "Width",
          type: "number"
        },
        height: {
          default: 0.5,
          exclusiveMinimum: 0,
          maximum: 2,
          title: "Height",
          type: "number"
        },
        feather: {
          default: 0.1,
          maximum: 1,
          minimum: 0,
          title: "Feather",
          type: "number"
        },
        invert: {
          default: false,
          title: "Invert",
          type: "boolean"
        }
      },
      title: "GradeMask",
      type: "object"
    },
    MediaFrameRate: {
      additionalProperties: false,
      properties: {
        num: {
          maximum: 9007199254740991,
          minimum: 1,
          title: "Num",
          type: "integer"
        },
        den: {
          maximum: 9007199254740991,
          minimum: 1,
          title: "Den",
          type: "integer"
        }
      },
      required: [
        "num",
        "den"
      ],
      title: "MediaFrameRate",
      type: "object"
    },
    Placement: {
      additionalProperties: false,
      properties: {
        kind: {
          enum: [
            "timeline",
            "project",
            "source",
            "speech"
          ],
          title: "Kind",
          type: "string"
        },
        ranges: {
          anyOf: [
            {
              items: {
                $ref: "#/$defs/TimelineRange"
              },
              type: "array"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Ranges"
        },
        startUs: {
          anyOf: [
            {
              maximum: 9007199254740991,
              minimum: 0,
              type: "integer"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Startus"
        },
        endUs: {
          anyOf: [
            {
              maximum: 9007199254740991,
              minimum: 0,
              type: "integer"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Endus"
        },
        startOffsetUs: {
          default: 0,
          maximum: 9007199254740991,
          minimum: -9007199254740991,
          title: "Startoffsetus",
          type: "integer"
        },
        endOffsetUs: {
          default: 0,
          maximum: 9007199254740991,
          minimum: -9007199254740991,
          title: "Endoffsetus",
          type: "integer"
        },
        clipId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Clipid"
        },
        startWordId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Startwordid"
        },
        endWordId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Endwordid"
        },
        fallback: {
          anyOf: [
            {
              $ref: "#/$defs/SourceInterval"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        memberWordIds: {
          anyOf: [
            {
              items: {
                type: "string"
              },
              maxItems: 1e5,
              minItems: 1,
              type: "array"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Memberwordids"
        },
        fallbackClock: {
          anyOf: [
            {
              enum: [
                "clip-local",
                "legacy-global"
              ],
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Fallbackclock"
        },
        timingBasis: {
          default: "auto",
          enum: [
            "auto",
            "acoustic",
            "transcript"
          ],
          title: "Timingbasis",
          type: "string"
        },
        endAtCutUs: {
          default: 0,
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endatcutus",
          type: "integer"
        }
      },
      required: [
        "kind"
      ],
      title: "Placement",
      type: "object"
    },
    Preset: {
      additionalProperties: false,
      properties: {
        presetId: {
          title: "Presetid",
          type: "string"
        },
        presetVersion: {
          title: "Presetversion",
          type: "integer"
        },
        params: {
          additionalProperties: {
            anyOf: [
              {
                type: "number"
              },
              {
                type: "string"
              },
              {
                type: "boolean"
              }
            ]
          },
          title: "Params",
          type: "object"
        },
        seed: {
          anyOf: [
            {
              type: "integer"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Seed"
        }
      },
      required: [
        "presetId",
        "presetVersion",
        "params"
      ],
      title: "Preset",
      type: "object"
    },
    Provenance: {
      additionalProperties: false,
      properties: {
        source: {
          enum: [
            "local",
            "web"
          ],
          title: "Source",
          type: "string"
        },
        url: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Url"
        },
        pageUrl: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Pageurl"
        },
        license: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "License"
        }
      },
      required: [
        "source"
      ],
      title: "Provenance",
      type: "object"
    },
    Rational: {
      additionalProperties: false,
      properties: {
        num: {
          maximum: 24e4,
          minimum: 1,
          title: "Num",
          type: "integer"
        },
        den: {
          maximum: 1e4,
          minimum: 1,
          title: "Den",
          type: "integer"
        }
      },
      required: [
        "num",
        "den"
      ],
      title: "Rational",
      type: "object"
    },
    SourceAnchor: {
      additionalProperties: false,
      properties: {
        clipId: {
          title: "Clipid",
          type: "string"
        },
        sourceUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Sourceus",
          type: "integer"
        }
      },
      required: [
        "clipId",
        "sourceUs"
      ],
      title: "SourceAnchor",
      type: "object"
    },
    SourceInterval: {
      additionalProperties: false,
      properties: {
        clipId: {
          title: "Clipid",
          type: "string"
        },
        startUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Startus",
          type: "integer"
        },
        endUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endus",
          type: "integer"
        }
      },
      required: [
        "clipId",
        "startUs",
        "endUs"
      ],
      title: "SourceInterval",
      type: "object"
    },
    TextStyle: {
      additionalProperties: false,
      properties: {
        fontFamily: {
          title: "Fontfamily",
          type: "string"
        },
        fontAssetId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Fontassetid"
        },
        fontSize: {
          maximum: 1e3,
          minimum: 1,
          title: "Fontsize",
          type: "number"
        },
        fontWeight: {
          maximum: 1e3,
          minimum: 100,
          title: "Fontweight",
          type: "integer"
        },
        color: {
          title: "Color",
          type: "string"
        },
        align: {
          enum: [
            "left",
            "center",
            "right"
          ],
          title: "Align",
          type: "string"
        },
        strokeColor: {
          title: "Strokecolor",
          type: "string"
        },
        strokeWidth: {
          maximum: 100,
          minimum: 0,
          title: "Strokewidth",
          type: "number"
        },
        shadowColor: {
          title: "Shadowcolor",
          type: "string"
        },
        shadowBlur: {
          maximum: 200,
          minimum: 0,
          title: "Shadowblur",
          type: "number"
        },
        shadowX: {
          title: "Shadowx",
          type: "number"
        },
        shadowY: {
          title: "Shadowy",
          type: "number"
        },
        backgroundColor: {
          title: "Backgroundcolor",
          type: "string"
        },
        padding: {
          maximum: 500,
          minimum: 0,
          title: "Padding",
          type: "number"
        },
        lineHeight: {
          maximum: 4,
          minimum: 0.5,
          title: "Lineheight",
          type: "number"
        }
      },
      required: [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "color",
        "align",
        "strokeColor",
        "strokeWidth",
        "shadowColor",
        "shadowBlur",
        "shadowX",
        "shadowY",
        "backgroundColor",
        "padding",
        "lineHeight"
      ],
      title: "TextStyle",
      type: "object"
    },
    TimelineRange: {
      additionalProperties: false,
      properties: {
        startUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Startus",
          type: "integer"
        },
        endUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endus",
          type: "integer"
        }
      },
      required: [
        "startUs",
        "endUs"
      ],
      title: "TimelineRange",
      type: "object"
    },
    Track: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        name: {
          title: "Name",
          type: "string"
        },
        kind: {
          enum: [
            "visual",
            "audio"
          ],
          title: "Kind",
          type: "string"
        },
        order: {
          title: "Order",
          type: "integer"
        },
        muted: {
          title: "Muted",
          type: "boolean"
        }
      },
      required: [
        "id",
        "name",
        "kind",
        "order",
        "muted"
      ],
      title: "Track",
      type: "object"
    },
    Transform: {
      additionalProperties: false,
      properties: {
        x: {
          maximum: 1e9,
          minimum: -1e9,
          title: "X",
          type: "number"
        },
        y: {
          maximum: 1e9,
          minimum: -1e9,
          title: "Y",
          type: "number"
        },
        width: {
          exclusiveMinimum: 0,
          maximum: 100,
          title: "Width",
          type: "number"
        },
        height: {
          exclusiveMinimum: 0,
          maximum: 100,
          title: "Height",
          type: "number"
        },
        scaleX: {
          maximum: 100,
          minimum: 1e-3,
          title: "Scalex",
          type: "number"
        },
        scaleY: {
          maximum: 100,
          minimum: 1e-3,
          title: "Scaley",
          type: "number"
        },
        pivotX: {
          title: "Pivotx",
          type: "number"
        },
        pivotY: {
          title: "Pivoty",
          type: "number"
        },
        rotation: {
          title: "Rotation",
          type: "number"
        },
        pitch: {
          maximum: 89,
          minimum: -89,
          title: "Pitch",
          type: "number"
        },
        yaw: {
          maximum: 89,
          minimum: -89,
          title: "Yaw",
          type: "number"
        },
        opacity: {
          maximum: 1,
          minimum: 0,
          title: "Opacity",
          type: "number"
        },
        fit: {
          enum: [
            "contain",
            "cover",
            "stretch"
          ],
          title: "Fit",
          type: "string"
        },
        crop: {
          $ref: "#/$defs/Crop"
        }
      },
      required: [
        "x",
        "y",
        "width",
        "height",
        "scaleX",
        "scaleY",
        "pivotX",
        "pivotY",
        "rotation",
        "pitch",
        "yaw",
        "opacity",
        "fit",
        "crop"
      ],
      title: "Transform",
      type: "object"
    },
    Transition: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        fromId: {
          title: "Fromid",
          type: "string"
        },
        toId: {
          title: "Toid",
          type: "string"
        },
        atUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Atus",
          type: "integer"
        },
        durationUs: {
          exclusiveMinimum: 0,
          title: "Durationus",
          type: "integer"
        },
        alignment: {
          enum: [
            "center",
            "before",
            "after"
          ],
          title: "Alignment",
          type: "string"
        },
        preset: {
          $ref: "#/$defs/Preset"
        },
        sourceAnchor: {
          anyOf: [
            {
              $ref: "#/$defs/SourceAnchor"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "id",
        "fromId",
        "toId",
        "atUs",
        "durationUs",
        "alignment",
        "preset"
      ],
      title: "Transition",
      type: "object"
    },
    Variant: {
      additionalProperties: false,
      properties: {
        name: {
          title: "Name",
          type: "string"
        },
        preset: {
          $ref: "#/$defs/Preset"
        }
      },
      required: [
        "name",
        "preset"
      ],
      title: "Variant",
      type: "object"
    }
  },
  additionalProperties: false,
  properties: {
    version: {
      const: 2,
      title: "Version",
      type: "integer"
    },
    canvas: {
      $ref: "#/$defs/Canvas"
    },
    assets: {
      additionalProperties: {
        $ref: "#/$defs/Asset"
      },
      title: "Assets",
      type: "object"
    },
    tracks: {
      items: {
        $ref: "#/$defs/Track"
      },
      title: "Tracks",
      type: "array"
    },
    elements: {
      additionalProperties: {
        $ref: "#/$defs/Element"
      },
      title: "Elements",
      type: "object"
    },
    transitions: {
      additionalProperties: {
        $ref: "#/$defs/Transition"
      },
      title: "Transitions",
      type: "object"
    },
    presetVariants: {
      additionalProperties: {
        $ref: "#/$defs/Variant"
      },
      title: "Presetvariants",
      type: "object"
    },
    buses: {
      additionalProperties: {
        $ref: "#/$defs/Bus"
      },
      propertyNames: {
        enum: [
          "voice",
          "music",
          "sound",
          "supplemental"
        ]
      },
      title: "Buses",
      type: "object"
    },
    masterGainDb: {
      maximum: 6,
      minimum: -96,
      title: "Mastergaindb",
      type: "number"
    },
    sourceGrades: {
      additionalProperties: {
        $ref: "#/$defs/ColorGrade"
      },
      maxProperties: 1e4,
      title: "Sourcegrades",
      type: "object"
    }
  },
  required: [
    "version",
    "canvas",
    "assets",
    "tracks",
    "elements",
    "transitions",
    "presetVariants",
    "buses",
    "masterGainDb"
  ],
  title: "Composition",
  type: "object"
};

// frontend/src/composition/schemaValidation.ts
function validateSchema(value, schema, root = schema, path = "document") {
  if (schema.$ref) {
    const target = schema.$ref.slice(2).split("/").reduce((s, key) => s[key], root);
    return validateSchema(value, target, root, path);
  }
  if (schema.anyOf) {
    for (const option of schema.anyOf) {
      try {
        validateSchema(value, option, root, path);
        return;
      } catch {
      }
    }
    throw new Error(`Invalid ${path}`);
  }
  if (schema.const !== void 0 && value !== schema.const) throw new Error(`Unsupported ${path}: ${String(value)}`);
  if (schema.enum && !schema.enum.includes(value)) throw new Error(`Invalid ${path}`);
  const fail = () => {
    throw new Error(`Invalid ${path}`);
  };
  switch (schema.type) {
    case "null":
      if (value !== null) fail();
      break;
    case "boolean":
      if (typeof value !== "boolean") fail();
      break;
    case "string":
      if (typeof value !== "string") fail();
      else if (schema.minLength !== void 0 && value.length < schema.minLength || schema.maxLength !== void 0 && value.length > schema.maxLength || schema.pattern && !new RegExp(schema.pattern).test(value)) fail();
      break;
    case "integer":
    case "number":
      if (schema.type === "integer" && !Number.isSafeInteger(value)) fail();
      if (typeof value !== "number" || !Number.isFinite(value)) fail();
      else if (schema.minimum !== void 0 && value < schema.minimum || schema.maximum !== void 0 && value > schema.maximum || schema.exclusiveMinimum !== void 0 && value <= schema.exclusiveMinimum || schema.exclusiveMaximum !== void 0 && value >= schema.exclusiveMaximum) fail();
      break;
    case "array":
      if (!Array.isArray(value)) fail();
      else {
        if (schema.minItems !== void 0 && value.length < schema.minItems || schema.maxItems !== void 0 && value.length > schema.maxItems) fail();
        value.forEach((v, i) => validateSchema(v, schema.items, root, `${path}[${i}]`));
      }
      break;
    case "object":
      if (!value || typeof value !== "object" || Array.isArray(value)) fail();
      else {
        const object = value;
        for (const key of schema.required || []) if (object[key] === void 0) throw new Error(`Missing ${path}.${key}`);
        for (const [key, v] of Object.entries(object)) {
          if (v === void 0) continue;
          if (["__proto__", "constructor", "prototype"].includes(key)) fail();
          const child = schema.properties?.[key];
          if (child) validateSchema(v, child, root, `${path}.${key}`);
          else if (schema.additionalProperties === false) throw new Error(`Unknown ${path}.${key}`);
          else if (typeof schema.additionalProperties === "object") validateSchema(v, schema.additionalProperties, root, `${path}.${key}`);
        }
      }
      break;
  }
}

// frontend/src/composition/validation.ts
var finite = (value, name, min = -1e9, max = 1e9) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${name}`);
};
var time = (value, name, min = 0) => {
  finite(value, name, min, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be integer microseconds`);
};
function validateComposition(doc) {
  validateSchema(doc, composition_schema_default);
  if (!doc || doc.version !== 2) throw new Error("Unsupported composition version");
  finite(doc.canvas.width, "canvas width", 16, 7680);
  finite(doc.canvas.height, "canvas height", 16, 4320);
  finite(doc.canvas.fps.num, "fps numerator", 1, 24e4);
  finite(doc.canvas.fps.den, "fps denominator", 1, 1e4);
  const tracks = new Set(doc.tracks.map((t) => t.id));
  if (tracks.size !== doc.tracks.length) throw new Error("Duplicate track ID");
  for (const [id, a] of Object.entries(doc.assets)) {
    if (a.id !== id || !a.path || !["image", "video", "audio", "font"].includes(a.kind)) throw new Error(`Invalid asset: ${id}`);
    time(a.durationUs, "asset duration");
  }
  for (const [id, e] of Object.entries(doc.elements)) {
    if (id !== e.id || !tracks.has(e.trackId) || !["base", "image", "video", "text", "audio"].includes(e.kind)) throw new Error(`Invalid element or track: ${id}`);
    if (e.kind !== "text" && (!e.assetId || !doc.assets[e.assetId])) throw new Error(`Missing asset for ${id}`);
    if (e.kind === "text" && (!e.textStyle || typeof e.text !== "string")) throw new Error(`Invalid text: ${id}`);
    if (e.colorGrade && ["text", "audio"].includes(e.kind)) throw new Error("Grade only video/image layers");
    const track = doc.tracks.find((t) => t.id === e.trackId);
    if (e.kind === "audio" !== (track.kind === "audio")) throw new Error(`Incompatible track: ${id}`);
    if (e.assetId) {
      const kind = doc.assets[e.assetId].kind;
      if (e.kind === "image" && kind !== "image" || ["video", "base"].includes(e.kind) && kind !== "video" || e.kind === "audio" && !["audio", "video"].includes(kind)) throw new Error(`Incompatible asset: ${id}`);
    }
    const p = e.placement;
    if (p.kind !== "speech" && ("timingBasis" in p && p.timingBasis !== "auto" || "endAtCutUs" in p && p.endAtCutUs)) throw new Error("Acoustic timing and cut extension require speech placement");
    if (p.kind === "timeline" || p.kind === "source") {
      time(p.startUs, "start");
      time(p.endUs, "end");
      if (p.endUs <= p.startUs) throw new Error("Empty element interval");
    } else if (p.kind === "project") {
      time(p.startOffsetUs, "start offset", -Number.MAX_SAFE_INTEGER);
      time(p.endOffsetUs, "end offset", -Number.MAX_SAFE_INTEGER);
    } else if (p.kind === "speech") {
      if (!p.startWordId || !p.endWordId || !p.fallback.clipId || p.fallback.endUs <= p.fallback.startUs) throw new Error("Speech anchor needs word IDs and a fallback interval");
      time(p.fallback.startUs, "fallback start");
      time(p.fallback.endUs, "fallback end");
      time(p.startOffsetUs, "offset", -Number.MAX_SAFE_INTEGER);
      time(p.endOffsetUs, "offset", -Number.MAX_SAFE_INTEGER);
    } else throw new Error("Unknown placement kind");
    if (p.kind === "source" && !p.clipId) throw new Error("Source anchor needs a clip ID");
    if (p.kind === "timeline" && p.ranges) {
      let end = p.startUs;
      if (!p.ranges.length || p.ranges[0].startUs !== p.startUs || p.ranges.at(-1).endUs !== p.endUs) throw new Error("Clip ranges must match its bounds");
      for (const range of p.ranges) {
        time(range.startUs, "range start");
        time(range.endUs, "range end");
        if (range.startUs < end || range.endUs <= range.startUs) throw new Error("Invalid clip ranges");
        end = range.endUs;
      }
    }
    time(e.sourceInUs, "source in");
    if (!["hold", "loop", "trim"].includes(e.endPolicy)) throw new Error("Invalid end policy");
    for (const window of [e.contentWindow, e.audio?.envelopeWindow]) if (window) {
      time(window.offsetUs, "content offset");
      time(window.durationUs, "content duration", 1);
    }
    for (const [key, value] of Object.entries(e.transform)) if (typeof value === "number") finite(value, `transform ${key}`);
    finite(e.transform.opacity, "opacity", 0, 1);
    finite(e.transform.scaleX, "scale X", 1e-3, 100);
    finite(e.transform.scaleY, "scale Y", 1e-3, 100);
    finite(e.transform.pitch, "pitch", -89, 89);
    finite(e.transform.yaw, "yaw", -89, 89);
    for (const [key, value] of Object.entries(e.transform.crop)) finite(value, `crop ${key}`, 0, 0.999);
    if (e.transform.crop.left + e.transform.crop.right >= 1 || e.transform.crop.top + e.transform.crop.bottom >= 1) throw new Error("Crop removes entire image");
    for (const p2 of e.presets) validatePreset(p2);
    if (e.audio) {
      finite(e.audio.gainDb, "gain", -96, 24);
      time(e.audio.fadeInUs, "fade in");
      time(e.audio.fadeOutUs, "fade out");
    }
    if (e.textStyle) {
      finite(e.textStyle.fontSize, "font size", 1, 1e3);
      finite(e.textStyle.strokeWidth, "stroke", 0, 100);
      finite(e.textStyle.lineHeight, "line height", 0.5, 4);
    }
    if (e.textStyle?.fontAssetId && doc.assets[e.textStyle.fontAssetId]?.kind !== "font") throw new Error(`Missing font for ${id}`);
  }
  for (const [id, t] of Object.entries(doc.transitions)) {
    if (t.id !== id || !doc.elements[t.fromId] || !doc.elements[t.toId]) throw new Error("Broken transition reference");
    time(t.atUs, "transition time");
    time(t.durationUs, "transition duration");
    if (!t.durationUs) throw new Error("Empty transition");
    validatePreset(t.preset);
  }
  finite(doc.masterGainDb, "master gain", -96, 6);
  for (const id of Object.keys(doc.sourceGrades || {})) if (!id || ["__proto__", "constructor", "prototype"].includes(id)) throw new Error("Invalid grading source");
  if (Object.keys(doc.buses).sort().join(",") !== "music,sound,supplemental,voice") throw new Error("Missing audio bus");
  for (const variant of Object.values(doc.presetVariants)) validatePreset(variant.preset);
  for (const bus of Object.values(doc.buses)) finite(bus.gainDb, "bus gain", -96, 24);
}
function validateElement(element, document) {
  validateComposition({ ...document, elements: { ...document.elements, [element.id]: element } });
}

// frontend/src/composition/intervalIndex.ts
var IntervalIndex = class {
  root;
  order;
  constructor(items) {
    this.order = new Map(items.map((item, index) => [item, index]));
    this.root = this.build(items.filter((i) => i.endUs > i.startUs));
  }
  build(items) {
    if (!items.length) return null;
    const centers = items.map((i) => i.startUs + Math.floor((i.endUs - i.startUs) / 2)).sort((a, b) => a - b), center = centers[Math.floor(centers.length / 2)], left = [], right = [], cross = [];
    for (const item of items) {
      if (item.endUs <= center) left.push(item);
      else if (item.startUs > center) right.push(item);
      else cross.push(item);
    }
    return { center, starts: [...cross].sort((a, b) => a.startUs - b.startUs), ends: [...cross].sort((a, b) => b.endUs - a.endUs), left: this.build(left), right: this.build(right) };
  }
  at(timeUs) {
    const found = [];
    const visit = (node) => {
      if (!node) return;
      if (timeUs < node.center) {
        for (const i of node.starts) {
          if (i.startUs > timeUs) break;
          if (i.endUs > timeUs) found.push(i);
        }
        visit(node.left);
      } else {
        for (const i of node.ends) {
          if (i.endUs <= timeUs) break;
          if (i.startUs <= timeUs) found.push(i);
        }
        visit(node.right);
      }
    };
    visit(this.root);
    return found.sort((a, b) => this.order.get(a) - this.order.get(b));
  }
};

// frontend/src/composition/compiler.ts
var indexes = /* @__PURE__ */ new WeakMap();
function compileComposition(document, manifest, words = []) {
  validateComposition(document);
  const elements = Object.values(document.elements).map((element) => {
    let elapsedUs = 0;
    const activeSpans = resolvePlacementSpans(element.placement, manifest, words).map((span) => {
      const result = { ...span, elapsedUs };
      elapsedUs += span.endUs - span.startUs;
      return result;
    });
    const times = { startUs: activeSpans[0]?.startUs || 0, endUs: activeSpans.at(-1)?.endUs || 0 };
    return { ...element, ...times, activeSpans, activeDurationUs: elapsedUs, suppressed: !activeSpans.length };
  }).sort((a, b) => (document.tracks.find((t) => t.id === a.trackId)?.order || 0) - (document.tracks.find((t) => t.id === b.trackId)?.order || 0) || a.order - b.order || a.id.localeCompare(b.id));
  const transitions = Object.values(document.transitions).map((t) => {
    let at = t.atUs;
    if (t.sourceAnchor) {
      const s = manifest.segments.find((s2) => s2.clipId === t.sourceAnchor.clipId && s2.sourceStartUs <= t.sourceAnchor.sourceUs && s2.sourceEndUs >= t.sourceAnchor.sourceUs);
      if (!s) return { ...t, startUs: 0, endUs: 0 };
      at = s.editStartUs + t.sourceAnchor.sourceUs - s.sourceStartUs;
    }
    const half = t.alignment === "before" ? t.durationUs : t.alignment === "after" ? 0 : Math.floor(t.durationUs / 2);
    return { ...t, atUs: at, startUs: Math.max(0, at - half), endUs: Math.min(manifest.durationUs, at + t.durationUs - half) };
  }).sort((a, b) => a.atUs - b.atUs);
  for (let i = 0; i < transitions.length; i++) {
    const t = transitions[i];
    if (i) t.startUs = Math.max(t.startUs, Math.ceil((transitions[i - 1].atUs + t.atUs) / 2));
    if (i + 1 < transitions.length) t.endUs = Math.min(t.endUs, Math.floor((t.atUs + transitions[i + 1].atUs) / 2));
  }
  const envelope = [];
  const regions = [];
  const speech = words.map((w) => ({ startUs: Math.round(w.start * 1e6), endUs: Math.round(w.end * 1e6) }));
  for (const segment of manifest.segments) for (const word of speech) {
    const start = Math.max(segment.globalSourceStartUs, word.startUs), end = Math.min(segment.globalSourceStartUs + segment.editEndUs - segment.editStartUs, word.endUs);
    if (end > start) regions.push({ start: segment.editStartUs + start - segment.globalSourceStartUs, end: segment.editStartUs + end - segment.globalSourceStartUs });
  }
  const merged = [];
  for (const region of regions.sort((a, b) => a.start - b.start)) {
    const last = merged.at(-1);
    if (last && region.start - last.end <= 24e4) last.end = Math.max(last.end, region.end);
    else merged.push({ ...region });
  }
  for (const r of merged) envelope.push({ timeUs: Math.max(0, r.start - 6e4), gain: 1 }, { timeUs: r.start, gain: 0.25 }, { timeUs: r.end, gain: 0.25 }, { timeUs: Math.min(manifest.durationUs, r.end + 18e4), gain: 1 });
  if (!envelope.length) envelope.push({ timeUs: 0, gain: 1 });
  return { version: 2, document, manifest, elements, transitions, audio: {
    sampleRate: 48e3,
    durationUs: manifest.durationUs,
    masterGainDb: document.masterGainDb,
    voiceGainDb: document.buses.voice.gainDb,
    voiceMute: document.buses.voice.mute,
    duckEnvelope: envelope,
    entries: elements.filter((e) => !e.suppressed && e.enabled && e.assetId && e.audio && !document.tracks.find((t) => t.id === e.trackId)?.muted).flatMap((e) => e.activeSpans.map((span, index) => ({
      ...e.audio,
      id: e.activeSpans.length > 1 ? `${e.id}:${index}` : e.id,
      assetId: e.assetId,
      startUs: span.startUs,
      endUs: span.endUs,
      sourceInUs: e.sourceInUs,
      sourcePhaseUs: span.elapsedUs + (e.contentWindow?.offsetUs || 0),
      envelopePhaseUs: span.elapsedUs + (e.audio.envelopeWindow?.offsetUs || 0),
      activeDurationUs: e.audio.envelopeWindow?.durationUs || e.activeDurationUs,
      endPolicy: e.endPolicy,
      gainDb: e.audio.gainDb + document.buses[e.audio.bus].gainDb,
      mute: e.audio.mute || document.buses[e.audio.bus].mute
    })))
  } };
}
function layerFor(plan, e, timeUs) {
  const span = e.activeSpans?.find((s) => s.startUs <= timeUs && timeUs < s.endUs), elapsedUs = (span ? span.elapsedUs + timeUs - span.startUs : Math.max(0, timeUs - e.startUs)) + (e.contentWindow?.offsetUs || 0);
  let sourceTimeUs = e.sourceInUs + elapsedUs;
  if (e.kind === "base") sourceTimeUs = editToSource(plan.manifest, timeUs)?.globalSourceUs || 0;
  const sourceId = e.kind === "base" ? editToSource(plan.manifest, timeUs)?.clipId : e.assetId;
  const grade = e.colorGrade ?? (sourceId ? plan.document.sourceGrades?.[sourceId] : void 0) ?? (e.assetId ? plan.document.sourceGrades?.[e.assetId] : void 0);
  const asset = e.assetId ? plan.document.assets[e.assetId] : null;
  if (asset?.durationUs) {
    if (e.endPolicy === "loop") sourceTimeUs = e.sourceInUs + elapsedUs % Math.max(1, asset.durationUs - e.sourceInUs);
    else sourceTimeUs = Math.min(sourceTimeUs, asset.durationUs - 1);
  }
  const layer = { id: e.id, element: e, sourceTimeUs, colorGrade: grade, transform: { ...e.transform, crop: { ...e.transform.crop } }, blur: 0, blurAngle: 0, radialBlur: 0, keyColor: "#00ff00", keyTolerance: -1, keySoftness: 0.01, keySpill: 0, mirrorEdges: false };
  for (const p of e.presets) animate(layer, p, elapsedUs / 1e6, ((e.contentWindow?.durationUs ?? e.activeDurationUs ?? e.endUs - e.startUs) - elapsedUs) / 1e6);
  return layer;
}
function transitionLayer(plan, e, timeUs, atUs, incoming) {
  const anchorUs = incoming ? Math.max(e.startUs, atUs) : Math.min(e.endUs - 1, atUs - 1);
  const anchor = layerFor(plan, e, anchorUs);
  const layer = layerFor(plan, e, timeUs);
  let sourceTimeUs = anchor.sourceTimeUs + timeUs - anchorUs;
  if (e.kind === "base") {
    const frameUs = 1e6 * plan.document.canvas.fps.den / plan.document.canvas.fps.num;
    const cuts = plan.manifest.segments.slice(1);
    const cut = cuts.reduce((best, s) => Math.abs(s.editStartUs - atUs) <= frameUs / 2 + 1 && (!best || Math.abs(s.editStartUs - atUs) < Math.abs(best.editStartUs - atUs)) ? s : best, void 0);
    if (cut) {
      const index = plan.manifest.segments.indexOf(cut), previous = plan.manifest.segments[index - 1];
      const sourceAnchor = incoming ? cut.globalSourceStartUs : previous.globalSourceStartUs + previous.sourceEndUs - previous.sourceStartUs;
      sourceTimeUs = sourceAnchor + timeUs - atUs;
    }
  }
  const asset = e.assetId ? plan.document.assets[e.assetId] : void 0;
  layer.colorGrade = anchor.colorGrade;
  layer.sourceTimeUs = Math.max(0, Math.min(sourceTimeUs, (asset?.durationUs || Number.MAX_SAFE_INTEGER) - 1));
  return layer;
}
function evaluateFrame(plan, timeUs) {
  if (!indexes.has(plan)) indexes.set(plan, new IntervalIndex(plan.elements));
  const layers = indexes.get(plan).at(timeUs).filter((e) => e.enabled && !e.suppressed && e.kind !== "audio" && !plan.document.tracks.find((t) => t.id === e.trackId)?.muted && (!e.activeSpans || e.activeSpans.some((s) => s.startUs <= timeUs && timeUs < s.endUs))).filter((e) => e.endPolicy !== "trim" || e.kind === "base" || !e.assetId || !plan.document.assets[e.assetId].durationUs || (e.contentWindow?.offsetUs || 0) + (e.activeSpans?.find((s) => s.startUs <= timeUs && timeUs < s.endUs)?.elapsedUs || 0) + timeUs - (e.activeSpans?.find((s) => s.startUs <= timeUs && timeUs < s.endUs)?.startUs ?? e.startUs) + e.sourceInUs < plan.document.assets[e.assetId].durationUs).map((e) => layerFor(plan, e, timeUs));
  for (const t of plan.transitions) {
    if (timeUs < t.startUs || timeUs >= t.endUs || t.endUs <= t.startUs) continue;
    const from = plan.elements.find((e) => e.id === t.fromId), to = plan.elements.find((e) => e.id === t.toId);
    if (!from || !to) continue;
    if (!from.enabled || !to.enabled || from.suppressed || to.suppressed) continue;
    const inForeignGap = (e) => !!e.activeSpans && e.activeSpans.length > 1 && timeUs >= e.startUs && timeUs < e.endUs && !e.activeSpans.some((s) => s.startUs <= timeUs && timeUs < s.endUs);
    if (inForeignGap(from) || inForeignGap(to)) continue;
    const a = transitionLayer(plan, from, timeUs, t.atUs, false), b = transitionLayer(plan, to, timeUs, t.atUs, true);
    a.id = `${t.id}:out`;
    b.id = `${t.id}:in`;
    const frameUs = 1e6 * plan.document.canvas.fps.den / plan.document.canvas.fps.num;
    const duration2 = t.endUs - t.startUs - (t.preset.presetId.startsWith("Xir_") ? frameUs : 0);
    transitionLayers(a, b, t.preset, Math.max(0, Math.min(1, (timeUs - t.startUs) / Math.max(1, duration2))));
    const index = layers.findIndex((l) => l.element.id === from.id || l.element.id === to.id);
    for (let i = layers.length - 1; i >= 0; i--) if (layers[i].element.id === from.id || layers[i].element.id === to.id) layers.splice(i, 1);
    layers.splice(Math.max(0, index), 0, a, b);
  }
  return layers;
}

// frontend/src/composition/operations.ts
function mergeFields(before, changes) {
  const next = { ...before };
  for (const [key, value] of Object.entries(changes)) {
    if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("Invalid field");
    next[key] = value && typeof value === "object" && !Array.isArray(value) && before?.[key] && typeof before[key] === "object" && (!("kind" in value) || value.kind === before[key].kind) ? mergeFields(before[key], value) : structuredClone(value);
  }
  return next;
}
function applyOperations(document, operations) {
  const next = structuredClone(document);
  for (const op of operations) {
    switch (op.type) {
      case "sourceGrade":
        if (!op.sourceId || ["__proto__", "constructor", "prototype"].includes(op.sourceId)) throw new Error("Invalid grading source");
        next.sourceGrades ??= {};
        if (op.grade == null) delete next.sourceGrades[op.sourceId];
        else next.sourceGrades[op.sourceId] = normalizeColorGrade(op.grade);
        break;
      case "add":
        if (next.elements[op.element.id]) throw new Error(`Element already exists: ${op.element.id}`);
        next.elements[op.element.id] = structuredClone(op.element);
        break;
      case "update":
        if (!next.elements[op.id]) throw new Error(`Element not found: ${op.id}`);
        next.elements[op.id] = { ...mergeFields(next.elements[op.id], op.changes), id: op.id };
        break;
      case "remove":
        delete next.elements[op.id];
        for (const [id, t] of Object.entries(next.transitions)) if (t.fromId === op.id || t.toId === op.id) delete next.transitions[id];
        break;
      case "asset": {
        const existing = next.assets[op.asset.id];
        if (existing && existing.hash && existing.hash !== op.asset.hash) throw new Error("Asset identity cannot change");
        next.assets[op.asset.id] = structuredClone(op.asset);
        break;
      }
      case "transition":
        next.transitions[op.transition.id] = structuredClone(op.transition);
        break;
      case "removeTransition":
        delete next.transitions[op.id];
        break;
      case "variant":
        next.presetVariants[op.id] = { name: op.name, preset: structuredClone(op.preset) };
        break;
      case "buses":
        next.buses = structuredClone(op.buses);
        next.masterGainDb = op.masterGainDb;
        break;
      default:
        throw new Error("Unsupported composition operation");
    }
  }
  for (const op of operations) {
    const id = op.type === "add" ? op.element.id : op.type === "update" ? op.id : null;
    if (id && next.elements[id]?.colorGrade != null) next.elements[id].colorGrade = normalizeColorGrade(next.elements[id].colorGrade);
  }
  validateComposition(next);
  return next;
}

// frontend/src/composition/captions.ts
function captionGroups(words, manifest, deleted = []) {
  const removed = new Set(deleted), kept = words.flatMap((w, i) => {
    if (removed.has(i)) return [];
    const start = sourceToEdit(manifest, us(w.start)), end = sourceToEdit(manifest, us(w.end) - 1);
    return start !== null && end !== null ? [{ text: w.word, startUs: start, endUs: end + 1 }] : [];
  });
  const groups = [];
  for (let i = 0; i < kept.length; ) {
    const chunk = [kept[i++]];
    while (i < kept.length && chunk.length < 6 && kept[i].startUs - chunk.at(-1).endUs < 6e5 && !/[.!?]$/.test(chunk.at(-1).text)) chunk.push(kept[i++]);
    groups.push({ text: chunk.map((w) => w.text).join(" "), startUs: chunk[0].startUs, endUs: Math.max(chunk[0].startUs + 1, chunk.at(-1).endUs) });
  }
  return groups;
}
function withCaptions(document, words, manifest, deleted = []) {
  const doc = structuredClone(document);
  doc.tracks.push({ id: "captions", name: "Captions", kind: "visual", order: 1e3, muted: false });
  for (const [i, c] of captionGroups(words, manifest, deleted).entries()) {
    const id = `caption-${i}`;
    doc.elements[id] = { id, kind: "text", trackId: "captions", order: i, label: "Caption", enabled: true, createdBy: "migration", placement: { kind: "timeline", startUs: c.startUs, endUs: c.endUs }, text: c.text, textStyle: { ...defaultTextStyle(), fontSize: 52 }, transform: { ...defaultTransform(), y: 0.88, width: 0.85, height: 0.13 }, presets: [], sourceInUs: 0, endPolicy: "hold" };
  }
  return doc;
}
function captionSrt(words, manifest, deleted = []) {
  const stamp = (u) => {
    const ms = Math.round(u / 1e3);
    return `${String(Math.floor(ms / 36e5)).padStart(2, "0")}:${String(Math.floor(ms / 6e4) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1e3) % 60).padStart(2, "0")},${String(ms % 1e3).padStart(3, "0")}`;
  };
  return captionGroups(words, manifest, deleted).map((c, i) => `${i + 1}
${stamp(c.startUs)} --> ${stamp(c.endUs)}
${c.text}
`).join("\n");
}

// shared/project-v2-schema.json
var project_v2_schema_default = {
  $defs: {
    Asset: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        kind: {
          enum: [
            "image",
            "video",
            "audio",
            "font"
          ],
          title: "Kind",
          type: "string"
        },
        path: {
          title: "Path",
          type: "string"
        },
        hash: {
          title: "Hash",
          type: "string"
        },
        name: {
          title: "Name",
          type: "string"
        },
        durationUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Durationus",
          type: "integer"
        },
        width: {
          maximum: 16384,
          minimum: 0,
          title: "Width",
          type: "integer"
        },
        height: {
          maximum: 16384,
          minimum: 0,
          title: "Height",
          type: "integer"
        },
        fps: {
          anyOf: [
            {
              $ref: "#/$defs/MediaFrameRate"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        hasAudio: {
          title: "Hasaudio",
          type: "boolean"
        },
        hasAlpha: {
          title: "Hasalpha",
          type: "boolean"
        },
        status: {
          enum: [
            "ready",
            "missing",
            "failed",
            "preparing"
          ],
          title: "Status",
          type: "string"
        },
        previewPath: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Previewpath"
        },
        thumbnailPath: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Thumbnailpath"
        },
        fontFamily: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Fontfamily"
        },
        normalizedPath: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Normalizedpath"
        },
        rotation: {
          anyOf: [
            {
              type: "number"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Rotation"
        },
        color: {
          anyOf: [
            {
              additionalProperties: {
                type: "string"
              },
              type: "object"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Color"
        },
        provenance: {
          anyOf: [
            {
              $ref: "#/$defs/Provenance"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "id",
        "kind",
        "path",
        "hash",
        "name",
        "durationUs",
        "width",
        "height",
        "hasAudio",
        "hasAlpha",
        "status"
      ],
      title: "Asset",
      type: "object"
    },
    AudioSettings: {
      additionalProperties: false,
      properties: {
        gainDb: {
          maximum: 24,
          minimum: -96,
          title: "Gaindb",
          type: "number"
        },
        mute: {
          title: "Mute",
          type: "boolean"
        },
        fadeInUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Fadeinus",
          type: "integer"
        },
        fadeOutUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Fadeoutus",
          type: "integer"
        },
        ducking: {
          title: "Ducking",
          type: "boolean"
        },
        bus: {
          enum: [
            "voice",
            "music",
            "sound",
            "supplemental"
          ],
          title: "Bus",
          type: "string"
        },
        envelopeWindow: {
          anyOf: [
            {
              $ref: "#/$defs/ContentWindow"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "gainDb",
        "mute",
        "fadeInUs",
        "fadeOutUs",
        "ducking",
        "bus"
      ],
      title: "AudioSettings",
      type: "object"
    },
    Bus: {
      additionalProperties: false,
      properties: {
        gainDb: {
          maximum: 24,
          minimum: -96,
          title: "Gaindb",
          type: "number"
        },
        mute: {
          title: "Mute",
          type: "boolean"
        }
      },
      required: [
        "gainDb",
        "mute"
      ],
      title: "Bus",
      type: "object"
    },
    Canvas: {
      additionalProperties: false,
      properties: {
        width: {
          maximum: 7680,
          minimum: 16,
          title: "Width",
          type: "integer"
        },
        height: {
          maximum: 4320,
          minimum: 16,
          title: "Height",
          type: "integer"
        },
        fps: {
          $ref: "#/$defs/Rational"
        },
        background: {
          title: "Background",
          type: "string"
        }
      },
      required: [
        "width",
        "height",
        "fps",
        "background"
      ],
      title: "Canvas",
      type: "object"
    },
    Clip: {
      additionalProperties: true,
      properties: {
        id: {
          maxLength: 200,
          minLength: 1,
          title: "Id",
          type: "string"
        },
        path: {
          title: "Path",
          type: "string"
        },
        name: {
          title: "Name",
          type: "string"
        },
        start: {
          minimum: 0,
          title: "Start",
          type: "number"
        },
        duration: {
          minimum: 0,
          title: "Duration",
          type: "number"
        }
      },
      required: [
        "id",
        "path",
        "name",
        "start",
        "duration"
      ],
      title: "Clip",
      type: "object"
    },
    ColorGrade: {
      additionalProperties: false,
      properties: {
        enabled: {
          default: true,
          title: "Enabled",
          type: "boolean"
        },
        exposure: {
          default: 0,
          maximum: 5,
          minimum: -5,
          title: "Exposure",
          type: "number"
        },
        temperature: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Temperature",
          type: "number"
        },
        tint: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Tint",
          type: "number"
        },
        contrast: {
          default: 1,
          maximum: 3,
          minimum: 0,
          title: "Contrast",
          type: "number"
        },
        saturation: {
          default: 1,
          maximum: 3,
          minimum: 0,
          title: "Saturation",
          type: "number"
        },
        shadows: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Shadows",
          type: "number"
        },
        midtones: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Midtones",
          type: "number"
        },
        highlights: {
          default: 0,
          maximum: 1,
          minimum: -1,
          title: "Highlights",
          type: "number"
        },
        rolloff: {
          default: 0,
          maximum: 1,
          minimum: 0,
          title: "Rolloff",
          type: "number"
        },
        mask: {
          anyOf: [
            {
              $ref: "#/$defs/GradeMask"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      title: "ColorGrade",
      type: "object"
    },
    Composition: {
      additionalProperties: false,
      properties: {
        version: {
          const: 2,
          title: "Version",
          type: "integer"
        },
        canvas: {
          $ref: "#/$defs/Canvas"
        },
        assets: {
          additionalProperties: {
            $ref: "#/$defs/Asset"
          },
          title: "Assets",
          type: "object"
        },
        tracks: {
          items: {
            $ref: "#/$defs/Track"
          },
          title: "Tracks",
          type: "array"
        },
        elements: {
          additionalProperties: {
            $ref: "#/$defs/Element"
          },
          title: "Elements",
          type: "object"
        },
        transitions: {
          additionalProperties: {
            $ref: "#/$defs/Transition"
          },
          title: "Transitions",
          type: "object"
        },
        presetVariants: {
          additionalProperties: {
            $ref: "#/$defs/Variant"
          },
          title: "Presetvariants",
          type: "object"
        },
        buses: {
          additionalProperties: {
            $ref: "#/$defs/Bus"
          },
          propertyNames: {
            enum: [
              "voice",
              "music",
              "sound",
              "supplemental"
            ]
          },
          title: "Buses",
          type: "object"
        },
        masterGainDb: {
          maximum: 6,
          minimum: -96,
          title: "Mastergaindb",
          type: "number"
        },
        sourceGrades: {
          additionalProperties: {
            $ref: "#/$defs/ColorGrade"
          },
          maxProperties: 1e4,
          title: "Sourcegrades",
          type: "object"
        }
      },
      required: [
        "version",
        "canvas",
        "assets",
        "tracks",
        "elements",
        "transitions",
        "presetVariants",
        "buses",
        "masterGainDb"
      ],
      title: "Composition",
      type: "object"
    },
    ContentWindow: {
      additionalProperties: false,
      properties: {
        offsetUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Offsetus",
          type: "integer"
        },
        durationUs: {
          exclusiveMinimum: 0,
          title: "Durationus",
          type: "integer"
        }
      },
      required: [
        "offsetUs",
        "durationUs"
      ],
      title: "ContentWindow",
      type: "object"
    },
    Crop: {
      additionalProperties: false,
      properties: {
        left: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Left",
          type: "number"
        },
        right: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Right",
          type: "number"
        },
        top: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Top",
          type: "number"
        },
        bottom: {
          exclusiveMaximum: 1,
          minimum: 0,
          title: "Bottom",
          type: "number"
        }
      },
      required: [
        "left",
        "right",
        "top",
        "bottom"
      ],
      title: "Crop",
      type: "object"
    },
    DeletedRange: {
      additionalProperties: true,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        start: {
          minimum: 0,
          title: "Start",
          type: "number"
        },
        end: {
          minimum: 0,
          title: "End",
          type: "number"
        },
        wordIndices: {
          items: {
            type: "integer"
          },
          title: "Wordindices",
          type: "array"
        }
      },
      required: [
        "id",
        "start",
        "end",
        "wordIndices"
      ],
      title: "DeletedRange",
      type: "object"
    },
    Element: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        kind: {
          enum: [
            "base",
            "image",
            "video",
            "text",
            "audio"
          ],
          title: "Kind",
          type: "string"
        },
        trackId: {
          title: "Trackid",
          type: "string"
        },
        order: {
          title: "Order",
          type: "integer"
        },
        label: {
          title: "Label",
          type: "string"
        },
        enabled: {
          title: "Enabled",
          type: "boolean"
        },
        createdBy: {
          enum: [
            "manual",
            "ai",
            "migration"
          ],
          title: "Createdby",
          type: "string"
        },
        placement: {
          $ref: "#/$defs/Placement"
        },
        transform: {
          $ref: "#/$defs/Transform"
        },
        presets: {
          items: {
            $ref: "#/$defs/Preset"
          },
          title: "Presets",
          type: "array"
        },
        assetId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Assetid"
        },
        text: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Text"
        },
        textStyle: {
          anyOf: [
            {
              $ref: "#/$defs/TextStyle"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        audio: {
          anyOf: [
            {
              $ref: "#/$defs/AudioSettings"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        sourceInUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Sourceinus",
          type: "integer"
        },
        endPolicy: {
          enum: [
            "hold",
            "loop",
            "trim"
          ],
          title: "Endpolicy",
          type: "string"
        },
        contentWindow: {
          anyOf: [
            {
              $ref: "#/$defs/ContentWindow"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        matteColor: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Mattecolor"
        },
        colorGrade: {
          anyOf: [
            {
              $ref: "#/$defs/ColorGrade"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "id",
        "kind",
        "trackId",
        "order",
        "label",
        "enabled",
        "createdBy",
        "placement",
        "transform",
        "presets",
        "sourceInUs",
        "endPolicy"
      ],
      title: "Element",
      type: "object"
    },
    GradeMask: {
      additionalProperties: false,
      properties: {
        shape: {
          default: "ellipse",
          enum: [
            "rectangle",
            "ellipse"
          ],
          title: "Shape",
          type: "string"
        },
        x: {
          default: 0.5,
          maximum: 1,
          minimum: 0,
          title: "X",
          type: "number"
        },
        y: {
          default: 0.5,
          maximum: 1,
          minimum: 0,
          title: "Y",
          type: "number"
        },
        width: {
          default: 0.5,
          exclusiveMinimum: 0,
          maximum: 2,
          title: "Width",
          type: "number"
        },
        height: {
          default: 0.5,
          exclusiveMinimum: 0,
          maximum: 2,
          title: "Height",
          type: "number"
        },
        feather: {
          default: 0.1,
          maximum: 1,
          minimum: 0,
          title: "Feather",
          type: "number"
        },
        invert: {
          default: false,
          title: "Invert",
          type: "boolean"
        }
      },
      title: "GradeMask",
      type: "object"
    },
    MediaFrameRate: {
      additionalProperties: false,
      properties: {
        num: {
          maximum: 9007199254740991,
          minimum: 1,
          title: "Num",
          type: "integer"
        },
        den: {
          maximum: 9007199254740991,
          minimum: 1,
          title: "Den",
          type: "integer"
        }
      },
      required: [
        "num",
        "den"
      ],
      title: "MediaFrameRate",
      type: "object"
    },
    NarrationArrangement: {
      additionalProperties: false,
      properties: {
        version: {
          const: 1,
          title: "Version",
          type: "integer"
        },
        order: {
          items: {
            $ref: "#/$defs/NarrationFragment"
          },
          maxItems: 1e5,
          title: "Order",
          type: "array"
        },
        parked: {
          items: {
            $ref: "#/$defs/NarrationFragment"
          },
          maxItems: 1e5,
          title: "Parked",
          type: "array"
        },
        cutClipboard: {
          items: {
            type: "string"
          },
          title: "Cutclipboard",
          type: "array"
        }
      },
      required: [
        "version",
        "order"
      ],
      title: "NarrationArrangement",
      type: "object"
    },
    NarrationFragment: {
      additionalProperties: false,
      properties: {
        id: {
          maxLength: 200,
          minLength: 1,
          title: "Id",
          type: "string"
        },
        clipId: {
          title: "Clipid",
          type: "string"
        },
        startUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Startus",
          type: "integer"
        },
        endUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endus",
          type: "integer"
        },
        memberWordIds: {
          items: {
            type: "string"
          },
          title: "Memberwordids",
          type: "array"
        }
      },
      required: [
        "id",
        "clipId",
        "startUs",
        "endUs",
        "memberWordIds"
      ],
      title: "NarrationFragment",
      type: "object"
    },
    Placement: {
      additionalProperties: false,
      properties: {
        kind: {
          enum: [
            "timeline",
            "project",
            "source",
            "speech"
          ],
          title: "Kind",
          type: "string"
        },
        ranges: {
          anyOf: [
            {
              items: {
                $ref: "#/$defs/TimelineRange"
              },
              type: "array"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Ranges"
        },
        startUs: {
          anyOf: [
            {
              maximum: 9007199254740991,
              minimum: 0,
              type: "integer"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Startus"
        },
        endUs: {
          anyOf: [
            {
              maximum: 9007199254740991,
              minimum: 0,
              type: "integer"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Endus"
        },
        startOffsetUs: {
          default: 0,
          maximum: 9007199254740991,
          minimum: -9007199254740991,
          title: "Startoffsetus",
          type: "integer"
        },
        endOffsetUs: {
          default: 0,
          maximum: 9007199254740991,
          minimum: -9007199254740991,
          title: "Endoffsetus",
          type: "integer"
        },
        clipId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Clipid"
        },
        startWordId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Startwordid"
        },
        endWordId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Endwordid"
        },
        fallback: {
          anyOf: [
            {
              $ref: "#/$defs/SourceInterval"
            },
            {
              type: "null"
            }
          ],
          default: null
        },
        memberWordIds: {
          anyOf: [
            {
              items: {
                type: "string"
              },
              maxItems: 1e5,
              minItems: 1,
              type: "array"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Memberwordids"
        },
        fallbackClock: {
          anyOf: [
            {
              enum: [
                "clip-local",
                "legacy-global"
              ],
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Fallbackclock"
        },
        timingBasis: {
          default: "auto",
          enum: [
            "auto",
            "acoustic",
            "transcript"
          ],
          title: "Timingbasis",
          type: "string"
        },
        endAtCutUs: {
          default: 0,
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endatcutus",
          type: "integer"
        }
      },
      required: [
        "kind"
      ],
      title: "Placement",
      type: "object"
    },
    Preset: {
      additionalProperties: false,
      properties: {
        presetId: {
          title: "Presetid",
          type: "string"
        },
        presetVersion: {
          title: "Presetversion",
          type: "integer"
        },
        params: {
          additionalProperties: {
            anyOf: [
              {
                type: "number"
              },
              {
                type: "string"
              },
              {
                type: "boolean"
              }
            ]
          },
          title: "Params",
          type: "object"
        },
        seed: {
          anyOf: [
            {
              type: "integer"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Seed"
        }
      },
      required: [
        "presetId",
        "presetVersion",
        "params"
      ],
      title: "Preset",
      type: "object"
    },
    Provenance: {
      additionalProperties: false,
      properties: {
        source: {
          enum: [
            "local",
            "web"
          ],
          title: "Source",
          type: "string"
        },
        url: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Url"
        },
        pageUrl: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Pageurl"
        },
        license: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "License"
        }
      },
      required: [
        "source"
      ],
      title: "Provenance",
      type: "object"
    },
    Rational: {
      additionalProperties: false,
      properties: {
        num: {
          maximum: 24e4,
          minimum: 1,
          title: "Num",
          type: "integer"
        },
        den: {
          maximum: 1e4,
          minimum: 1,
          title: "Den",
          type: "integer"
        }
      },
      required: [
        "num",
        "den"
      ],
      title: "Rational",
      type: "object"
    },
    SourceAnchor: {
      additionalProperties: false,
      properties: {
        clipId: {
          title: "Clipid",
          type: "string"
        },
        sourceUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Sourceus",
          type: "integer"
        }
      },
      required: [
        "clipId",
        "sourceUs"
      ],
      title: "SourceAnchor",
      type: "object"
    },
    SourceInterval: {
      additionalProperties: false,
      properties: {
        clipId: {
          title: "Clipid",
          type: "string"
        },
        startUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Startus",
          type: "integer"
        },
        endUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endus",
          type: "integer"
        }
      },
      required: [
        "clipId",
        "startUs",
        "endUs"
      ],
      title: "SourceInterval",
      type: "object"
    },
    TextStyle: {
      additionalProperties: false,
      properties: {
        fontFamily: {
          title: "Fontfamily",
          type: "string"
        },
        fontAssetId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Fontassetid"
        },
        fontSize: {
          maximum: 1e3,
          minimum: 1,
          title: "Fontsize",
          type: "number"
        },
        fontWeight: {
          maximum: 1e3,
          minimum: 100,
          title: "Fontweight",
          type: "integer"
        },
        color: {
          title: "Color",
          type: "string"
        },
        align: {
          enum: [
            "left",
            "center",
            "right"
          ],
          title: "Align",
          type: "string"
        },
        strokeColor: {
          title: "Strokecolor",
          type: "string"
        },
        strokeWidth: {
          maximum: 100,
          minimum: 0,
          title: "Strokewidth",
          type: "number"
        },
        shadowColor: {
          title: "Shadowcolor",
          type: "string"
        },
        shadowBlur: {
          maximum: 200,
          minimum: 0,
          title: "Shadowblur",
          type: "number"
        },
        shadowX: {
          title: "Shadowx",
          type: "number"
        },
        shadowY: {
          title: "Shadowy",
          type: "number"
        },
        backgroundColor: {
          title: "Backgroundcolor",
          type: "string"
        },
        padding: {
          maximum: 500,
          minimum: 0,
          title: "Padding",
          type: "number"
        },
        lineHeight: {
          maximum: 4,
          minimum: 0.5,
          title: "Lineheight",
          type: "number"
        }
      },
      required: [
        "fontFamily",
        "fontSize",
        "fontWeight",
        "color",
        "align",
        "strokeColor",
        "strokeWidth",
        "shadowColor",
        "shadowBlur",
        "shadowX",
        "shadowY",
        "backgroundColor",
        "padding",
        "lineHeight"
      ],
      title: "TextStyle",
      type: "object"
    },
    TimelineRange: {
      additionalProperties: false,
      properties: {
        startUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Startus",
          type: "integer"
        },
        endUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Endus",
          type: "integer"
        }
      },
      required: [
        "startUs",
        "endUs"
      ],
      title: "TimelineRange",
      type: "object"
    },
    Track: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        name: {
          title: "Name",
          type: "string"
        },
        kind: {
          enum: [
            "visual",
            "audio"
          ],
          title: "Kind",
          type: "string"
        },
        order: {
          title: "Order",
          type: "integer"
        },
        muted: {
          title: "Muted",
          type: "boolean"
        }
      },
      required: [
        "id",
        "name",
        "kind",
        "order",
        "muted"
      ],
      title: "Track",
      type: "object"
    },
    Transform: {
      additionalProperties: false,
      properties: {
        x: {
          maximum: 1e9,
          minimum: -1e9,
          title: "X",
          type: "number"
        },
        y: {
          maximum: 1e9,
          minimum: -1e9,
          title: "Y",
          type: "number"
        },
        width: {
          exclusiveMinimum: 0,
          maximum: 100,
          title: "Width",
          type: "number"
        },
        height: {
          exclusiveMinimum: 0,
          maximum: 100,
          title: "Height",
          type: "number"
        },
        scaleX: {
          maximum: 100,
          minimum: 1e-3,
          title: "Scalex",
          type: "number"
        },
        scaleY: {
          maximum: 100,
          minimum: 1e-3,
          title: "Scaley",
          type: "number"
        },
        pivotX: {
          title: "Pivotx",
          type: "number"
        },
        pivotY: {
          title: "Pivoty",
          type: "number"
        },
        rotation: {
          title: "Rotation",
          type: "number"
        },
        pitch: {
          maximum: 89,
          minimum: -89,
          title: "Pitch",
          type: "number"
        },
        yaw: {
          maximum: 89,
          minimum: -89,
          title: "Yaw",
          type: "number"
        },
        opacity: {
          maximum: 1,
          minimum: 0,
          title: "Opacity",
          type: "number"
        },
        fit: {
          enum: [
            "contain",
            "cover",
            "stretch"
          ],
          title: "Fit",
          type: "string"
        },
        crop: {
          $ref: "#/$defs/Crop"
        }
      },
      required: [
        "x",
        "y",
        "width",
        "height",
        "scaleX",
        "scaleY",
        "pivotX",
        "pivotY",
        "rotation",
        "pitch",
        "yaw",
        "opacity",
        "fit",
        "crop"
      ],
      title: "Transform",
      type: "object"
    },
    Transition: {
      additionalProperties: false,
      properties: {
        id: {
          title: "Id",
          type: "string"
        },
        fromId: {
          title: "Fromid",
          type: "string"
        },
        toId: {
          title: "Toid",
          type: "string"
        },
        atUs: {
          maximum: 9007199254740991,
          minimum: 0,
          title: "Atus",
          type: "integer"
        },
        durationUs: {
          exclusiveMinimum: 0,
          title: "Durationus",
          type: "integer"
        },
        alignment: {
          enum: [
            "center",
            "before",
            "after"
          ],
          title: "Alignment",
          type: "string"
        },
        preset: {
          $ref: "#/$defs/Preset"
        },
        sourceAnchor: {
          anyOf: [
            {
              $ref: "#/$defs/SourceAnchor"
            },
            {
              type: "null"
            }
          ],
          default: null
        }
      },
      required: [
        "id",
        "fromId",
        "toId",
        "atUs",
        "durationUs",
        "alignment",
        "preset"
      ],
      title: "Transition",
      type: "object"
    },
    Variant: {
      additionalProperties: false,
      properties: {
        name: {
          title: "Name",
          type: "string"
        },
        preset: {
          $ref: "#/$defs/Preset"
        }
      },
      required: [
        "name",
        "preset"
      ],
      title: "Variant",
      type: "object"
    },
    Word: {
      additionalProperties: true,
      properties: {
        id: {
          maxLength: 200,
          minLength: 1,
          title: "Id",
          type: "string"
        },
        word: {
          title: "Word",
          type: "string"
        },
        start: {
          minimum: 0,
          title: "Start",
          type: "number"
        },
        end: {
          minimum: 0,
          title: "End",
          type: "number"
        },
        confidence: {
          default: 0,
          title: "Confidence",
          type: "number"
        },
        clipId: {
          anyOf: [
            {
              type: "string"
            },
            {
              type: "null"
            }
          ],
          default: null,
          title: "Clipid"
        }
      },
      required: [
        "id",
        "word",
        "start",
        "end"
      ],
      title: "Word",
      type: "object"
    }
  },
  additionalProperties: true,
  properties: {
    version: {
      const: 2,
      title: "Version",
      type: "integer"
    },
    id: {
      maxLength: 100,
      minLength: 1,
      pattern: "^[a-zA-Z0-9_-]+$",
      title: "Id",
      type: "string"
    },
    revision: {
      minimum: 0,
      title: "Revision",
      type: "integer"
    },
    videoPath: {
      title: "Videopath",
      type: "string"
    },
    words: {
      items: {
        $ref: "#/$defs/Word"
      },
      title: "Words",
      type: "array"
    },
    segments: {
      items: {
        additionalProperties: true,
        type: "object"
      },
      title: "Segments",
      type: "array"
    },
    clips: {
      items: {
        $ref: "#/$defs/Clip"
      },
      title: "Clips",
      type: "array"
    },
    deletedRanges: {
      items: {
        $ref: "#/$defs/DeletedRange"
      },
      title: "Deletedranges",
      type: "array"
    },
    composition: {
      $ref: "#/$defs/Composition"
    },
    narration: {
      anyOf: [
        {
          $ref: "#/$defs/NarrationArrangement"
        },
        {
          type: "null"
        }
      ],
      default: null
    },
    createdAt: {
      title: "Createdat",
      type: "string"
    },
    modifiedAt: {
      title: "Modifiedat",
      type: "string"
    }
  },
  required: [
    "version",
    "id",
    "revision",
    "videoPath",
    "words",
    "segments",
    "clips",
    "deletedRanges",
    "composition",
    "createdAt",
    "modifiedAt"
  ],
  title: "ProjectV2",
  type: "object"
};

// frontend/src/composition/projectValidation.ts
function validateProject(document) {
  validateSchema(document, project_v2_schema_default);
  validateComposition(document.composition);
  const wordIds = /* @__PURE__ */ new Set(), clipIds = new Set((document.clips || []).map((c) => c.id));
  if (clipIds.size !== document.clips?.length) throw new Error("Duplicate clip ID");
  for (const id of Object.keys(document.composition?.sourceGrades || {})) if (!clipIds.has(id) && !["video", "image"].includes(document.composition?.assets[id]?.kind || "")) throw new Error("Unknown grading source");
  for (const word of document.words) {
    if (wordIds.has(word.id)) throw new Error("Duplicate word ID");
    wordIds.add(word.id);
    if (word.end < word.start) throw new Error("Reversed word interval");
    if (word.clipId && !clipIds.has(word.clipId)) throw new Error("Unknown word clip");
  }
  for (const range of document.deletedRanges) if (range.wordIndices.some((i) => !Number.isSafeInteger(i) || i < 0 || i >= document.words.length)) throw new Error("Unknown deleted word index");
}

// frontend/src/composition/narration.ts
var us2 = (n) => Math.round(n * 1e6);
function clipsFor(d) {
  const total = d.composition?.assets[d.composition?.elements.base?.assetId]?.durationUs || Math.max(0, ...d.clips.map((c) => us2(c.start + c.duration)));
  return d.clips.map((c) => ({ ...c, durationUs: Math.max(0, Math.min(us2(c.duration) || total, total - us2(c.start))) }));
}
function fragment(d, clipId, a, b) {
  const clip = d.clips.find((c) => c.id === clipId);
  const members = d.words.filter((w) => w.clipId === clipId && us2((w.start + w.end) / 2 - clip.start) >= a && us2((w.start + w.end) / 2 - clip.start) < b).flatMap((w) => w.id ? [w.id] : []);
  return { id: `n-${clipId}-${a}-${b}`, clipId, startUs: a, endUs: b, memberWordIds: members };
}
function naturalNarration(d) {
  return { version: 1, order: clipsFor(d).filter((c) => c.durationUs > 0).map((c) => fragment(d, c.id, 0, c.durationUs)), parked: [], cutClipboard: [] };
}
function validateNarration(d, n) {
  if (n.version !== 1 || !Array.isArray(n.order) || !Array.isArray(n.parked) || !Array.isArray(n.cutClipboard)) throw new Error("Invalid narration arrangement");
  const ids = /* @__PURE__ */ new Set(), clips = clipsFor(d), known = new Map(clips.map((c) => [c.id, c]));
  for (const f of [...n.order, ...n.parked]) {
    if (!f.id || ids.has(f.id) || !known.has(f.clipId) || !Number.isSafeInteger(f.startUs) || !Number.isSafeInteger(f.endUs) || f.startUs < 0 || f.endUs <= f.startUs || !Array.isArray(f.memberWordIds)) throw new Error("Invalid or repeated narration fragment");
    ids.add(f.id);
    if (f.endUs > known.get(f.clipId).durationUs) throw new Error("Narration fragment exceeds its prepared source");
    const expected = fragment(d, f.clipId, f.startUs, f.endUs).memberWordIds;
    if (JSON.stringify(f.memberWordIds) !== JSON.stringify(expected)) throw new Error("Narration membership does not match its immutable source partition");
  }
  for (const clip of clips) {
    let cursor = 0;
    for (const f of [...n.order, ...n.parked].filter((f2) => f2.clipId === clip.id).sort((a, b) => a.startUs - b.startUs)) {
      if (f.startUs !== cursor) throw new Error("Narration source coverage has a gap or duplicate voice");
      cursor = f.endUs;
    }
    if (cursor !== clip.durationUs) throw new Error("Narration must account for every source exactly once");
  }
  if (new Set(n.cutClipboard).size !== n.cutClipboard.length || n.cutClipboard.some((id) => !n.parked.some((f) => f.id === id))) throw new Error("Invalid cut clipboard");
  return n;
}
function reconcileNarration(d, n) {
  const known = new Set(d.clips.map((c) => c.id)), next = structuredClone(n);
  next.order = next.order.filter((f) => known.has(f.clipId));
  next.parked = next.parked.filter((f) => known.has(f.clipId));
  next.cutClipboard = next.cutClipboard.filter((id) => next.parked.some((f) => f.id === id));
  for (const c of clipsFor(d)) if (![...next.order, ...next.parked].some((f) => f.clipId === c.id) && c.durationUs > 0) next.order.push(fragment(d, c.id, 0, c.durationUs));
  return validateNarration(d, next);
}
function orderedWordIndices(d, n = d.narration) {
  if (!n) return d.words.map((_, i) => i);
  const byId = new Map(d.words.map((w, i) => [w.id, i]));
  return n.order.flatMap((f) => f.memberWordIds.flatMap((id) => byId.has(id) ? [byId.get(id)] : []));
}
function cell(d, id) {
  const w = d.words.find((w2) => w2.id === id);
  if (!w || !w.clipId) throw new Error("Choose a current word ID");
  const c = clipsFor(d).find((c2) => c2.id === w.clipId);
  if (!c) throw new Error("Word source clip is missing");
  const words = d.words.filter((w2) => w2.clipId === c.id), i = words.findIndex((v) => v.id === id), mid = us2((w.start + w.end) / 2 - c.start);
  const boundary = (left, right) => Math.max(us2((left.start + left.end) / 2 - c.start), Math.min(us2((right.start + right.end) / 2 - c.start), us2((left.end + right.start) / 2 - c.start)));
  return { clipId: c.id, startUs: i ? boundary(words[i - 1], w) : 0, endUs: i + 1 < words.length ? boundary(w, words[i + 1]) : c.durationUs, midUs: mid };
}
function split(d, list, clipId, point) {
  return list.flatMap((f) => f.clipId === clipId && f.startUs < point && point < f.endUs ? [fragment(d, clipId, f.startUs, point), fragment(d, clipId, point, f.endUs)] : [f]);
}
function splitNarrationAtSource(d, clipId, point) {
  const n = structuredClone(d.narration || naturalNarration(d));
  if (!n.order.some((f) => f.clipId === clipId && f.startUs < point && point < f.endUs)) return null;
  n.order = split(d, n.order, clipId, point);
  return validateNarration(d, n);
}
function extract(d, n, wordIds) {
  if (!wordIds.length || new Set(wordIds).size !== wordIds.length) throw new Error("Select unique narration word IDs");
  const display = orderedWordIndices(d, n).map((i) => d.words[i].id), positions = wordIds.map((id) => display.indexOf(id)).sort((a, b) => a - b);
  if (positions.some((i) => i < 0) || positions.some((i, k) => k > 0 && i !== positions[k - 1] + 1)) throw new Error("Select one contiguous passage in the displayed narration order");
  const selected = new Set(wordIds), cells = wordIds.map((id) => cell(d, id));
  for (const c of cells) {
    n.order = split(d, n.order, c.clipId, c.startUs);
    n.order = split(d, n.order, c.clipId, c.endUs);
  }
  const pieces = n.order.filter((f) => f.memberWordIds.length && f.memberWordIds.every((id) => selected.has(id)));
  n.order = n.order.filter((f) => !pieces.includes(f));
  if (!pieces.length) throw new Error("No narration source in this selection");
  const merged = [];
  for (const f of pieces) {
    const last = merged.at(-1);
    if (last && last.clipId === f.clipId && last.endUs === f.startUs) merged[merged.length - 1] = fragment(d, f.clipId, last.startUs, f.endUs);
    else merged.push(f);
  }
  return merged;
}
function insert(d, n, pieces, beforeWordId, position = "end") {
  let index = n.order.length;
  if (beforeWordId) {
    if (pieces.some((f) => f.memberWordIds.includes(beforeWordId))) throw new Error("Destination is inside the moved passage");
    const c = cell(d, beforeWordId);
    n.order = split(d, n.order, c.clipId, c.startUs);
    index = n.order.findIndex((f) => f.memberWordIds.includes(beforeWordId));
    if (index < 0) throw new Error("Destination word is parked or missing");
  } else if (position === "start") index = 0;
  else if (position !== "end") throw new Error("Choose start, end or beforeWordId");
  n.order.splice(index, 0, ...pieces);
  return validateNarration(d, n);
}
function moveNarration(d, wordIds, beforeWordId, position = "end") {
  const n = structuredClone(d.narration || naturalNarration(d)), pieces = extract(d, n, wordIds);
  return insert(d, n, pieces, beforeWordId, position);
}
function cutNarration(d, wordIds) {
  const n = structuredClone(d.narration || naturalNarration(d));
  if (n.cutClipboard.length) throw new Error("Paste or undo the previous cut before cutting another passage");
  const pieces = extract(d, n, wordIds);
  n.parked.push(...pieces);
  n.cutClipboard = pieces.map((f) => f.id);
  return validateNarration(d, n);
}
function pasteNarration(d, beforeWordId, position = "end") {
  const n = structuredClone(d.narration || naturalNarration(d));
  if (!n.cutClipboard.length) throw new Error("There is no cut narration to paste");
  const selected = new Set(n.cutClipboard), pieces = n.cutClipboard.map((id) => n.parked.find((f) => f.id === id));
  n.parked = n.parked.filter((f) => !selected.has(f.id));
  n.cutClipboard = [];
  return insert(d, n, pieces, beforeWordId, position);
}
function orderedKeepSegments(n, clips, keep) {
  if (!n) return keep;
  const map = new Map(clips.map((c) => [c.id, c]));
  const output = [];
  for (const f of n.order) {
    const c = map.get(f.clipId);
    if (!c) throw new Error("Narration source clip missing");
    const a = c.start + f.startUs / 1e6, b = c.start + f.endUs / 1e6;
    for (const k of keep) {
      const start = Math.max(a, k.start), end = Math.min(b, k.end);
      if (end <= start) continue;
      const last = output.at(-1);
      if (last && Math.abs(last.end - start) < 5e-7) last.end = end;
      else output.push({ start, end });
    }
  }
  return output;
}
function narrationManifestClips(clips, n) {
  if (!n) return clips;
  return clips.map((c) => ({ ...c, duration: Math.max(0, ...[...n.order, ...n.parked].filter((f) => f.clipId === c.id).map((f) => f.endUs)) / 1e6 }));
}

// frontend/src/lib/cutRanges.ts
function getEffectiveCutRanges(words, deletedRanges, videoEnd, soundEvents = []) {
  const end = Math.max(
    videoEnd,
    words[words.length - 1]?.end || 0,
    ...deletedRanges.map((range) => range.end)
  );
  const byIndex = /* @__PURE__ */ new Map();
  const cuts = [];
  for (const range of deletedRanges) {
    const indices = range.wordIndices.filter((index) => index >= 0 && index < words.length);
    if (!indices.length) cuts.push({
      start: range.cutStart ?? range.start,
      end: range.cutEnd ?? range.end
    });
    for (const index of indices) if (!byIndex.has(index)) byIndex.set(index, range);
  }
  const sorted = [...byIndex.keys()].sort((a, b) => a - b);
  for (let position = 0; position < sorted.length; ) {
    const first = sorted[position];
    let last = first;
    while (position + 1 < sorted.length && sorted[position + 1] === last + 1) {
      last = sorted[++position];
    }
    const previousEnd = first > 0 ? words[first - 1].end : 0;
    const nextStart = last + 1 < words.length ? words[last + 1].start : end;
    cuts.push({
      start: byIndex.get(first)?.cutStart ?? previousEnd,
      end: byIndex.get(last)?.cutEnd ?? nextStart
    });
    position++;
  }
  for (const event of soundEvents) {
    if (event.markedForRemoval) cuts.push({
      start: Math.max(0, event.start),
      end: Math.min(end, event.end)
    });
  }
  cuts.sort((a, b) => a.start - b.start);
  const merged = [];
  for (const cut of cuts) {
    cut.start = Math.max(0, Math.min(cut.start, end));
    cut.end = Math.max(0, Math.min(cut.end, end));
    if (cut.end <= cut.start) continue;
    const last = merged[merged.length - 1];
    if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
    else merged.push({ ...cut });
  }
  return merged;
}
function getLockedCutBoundaries(words, deletedRanges, keepSegments) {
  const exits = /* @__PURE__ */ new Set();
  const entrances = /* @__PURE__ */ new Set();
  const lateEntrances = /* @__PURE__ */ new Set();
  const longLateEntrances = /* @__PURE__ */ new Set();
  const deletedWords = new Set(deletedRanges.flatMap((range) => range.wordIndices));
  for (const range of deletedRanges) {
    if (!range.wordIndices.some((index) => index >= 0 && index < words.length)) continue;
    if (range.cutStart !== void 0) {
      const index = keepSegments.findIndex((segment) => Math.abs(segment.end - range.cutStart) < 1e-5);
      if (index >= 0) exits.add(index);
    }
    if (range.cutEnd !== void 0) {
      const index = keepSegments.findIndex((segment) => Math.abs(segment.start - range.cutEnd) < 1e-5);
      if (index >= 0) entrances.add(index);
    } else {
      const last = Math.max(...range.wordIndices);
      if (last >= 0 && last + 1 < words.length && !deletedWords.has(last + 1) && (words[last + 1].start - words[last].end <= 0.18 || /[-—]$/.test(words[last].word))) {
        const nextStart = last + 1 < words.length ? words[last + 1].start : -1;
        const index = keepSegments.findIndex((segment) => Math.abs(segment.start - nextStart) < 1e-5);
        if (index >= 0) {
          lateEntrances.add(index);
          const nextToken = words[last + 1].word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
          const repeated = nextToken.length >= 2 && range.wordIndices.some((wordIndex) => words[wordIndex]?.word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "") === nextToken);
          if (/[-—]$/.test(words[last].word) && repeated) longLateEntrances.add(index);
        }
      }
    }
  }
  return {
    lockedExitIndices: [...exits],
    lockedEntranceIndices: [...entrances],
    lateEntranceIndices: [...lateEntrances],
    longLateEntranceIndices: [...longLateEntrances]
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  IntervalIndex,
  animate,
  applyOperations,
  captionGroups,
  captionSrt,
  clamp,
  colorGradeFragment,
  compileComposition,
  cutNarration,
  defaultColorGrade,
  defaultTextStyle,
  defaultTransform,
  editToSource,
  emptyComposition,
  evaluateFrame,
  expo,
  getEffectiveCutRanges,
  getLockedCutBoundaries,
  isColorGraded,
  moveNarration,
  narrationManifestClips,
  naturalNarration,
  normalizeColorGrade,
  orderedKeepSegments,
  orderedWordIndices,
  pasteNarration,
  presetInstance,
  presetRegistry,
  reconcileNarration,
  resolvePlacement,
  resolvePlacementSpans,
  seconds,
  sourceToEdit,
  speechPlacementForTimeline,
  splitNarrationAtSource,
  transitionLayers,
  us,
  validateComposition,
  validateElement,
  validateNarration,
  validatePreset,
  validateProject,
  visualTimingRequest,
  withCaptions
});
