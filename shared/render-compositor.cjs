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

// frontend/src/render-worker/direct.ts
var direct_exports = {};
__export(direct_exports, {
  createDirectRenderer: () => createDirectRenderer
});
module.exports = __toCommonJS(direct_exports);

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

// frontend/src/composition/types.ts
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

// frontend/src/composition/timeMap.ts
function search(items, value, start) {
  let lo = 0, hi = items.length;
  while (lo < hi) {
    const mid = lo + hi >>> 1;
    if (start(items[mid]) <= value) lo = mid + 1;
    else hi = mid;
  }
  return items[lo - 1];
}
function editToSource(manifest, editUs) {
  const s = search(manifest.segments, Math.max(0, editUs), (s2) => s2.editStartUs) || manifest.segments[0];
  return s ? { clipId: s.clipId, sourceUs: s.sourceStartUs + Math.min(s.editEndUs - s.editStartUs - 1, Math.max(0, editUs - s.editStartUs)), globalSourceUs: s.globalSourceStartUs + Math.min(s.editEndUs - s.editStartUs - 1, Math.max(0, editUs - s.editStartUs)) } : null;
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

// frontend/src/render/textRasterizer.ts
var fonts = /* @__PURE__ */ new Map();
var loadedStyles = /* @__PURE__ */ new Map();
var bundledFonts = { "Open Sans": "fonts/OpenSans.ttf" };
function family(element, document2) {
  const asset = document2.assets[element.textStyle.fontAssetId || ""];
  return asset ? `edity-font-${asset.hash || asset.id}` : element.textStyle.fontFamily;
}
function installedFont(name) {
  if (["serif", "sans-serif", "monospace"].includes(name)) return true;
  const context = window.document.createElement("canvas").getContext("2d"), sample = "WwmMiIlL0123456789abcdefghijklmnopqrstuvwxyz";
  return ["monospace", "serif"].some((fallback) => {
    context.font = `72px ${fallback}`;
    const base = context.measureText(sample).width;
    context.font = `72px "${name}",${fallback}`;
    return context.measureText(sample).width !== base;
  });
}
async function loadCompositionFonts(document2, urlFor) {
  for (const asset of Object.values(document2.assets).filter((a) => a.kind === "font" && Object.values(document2.elements).some((e) => e.enabled && e.textStyle?.fontAssetId === a.id))) {
    const key = asset.hash || asset.path;
    if (!fonts.has(key)) fonts.set(key, (async () => {
      const font = await new FontFace(`edity-font-${asset.hash || asset.id}`, `url("${urlFor(asset.path)}")`).load();
      window.document.fonts.add(font);
    })());
    await fonts.get(key);
  }
  for (const element of Object.values(document2.elements)) if (element.textStyle) {
    const style = element.textStyle, name = family(element, document2);
    if (!style.fontAssetId && bundledFonts[name]) {
      const key2 = `bundled:${name}`;
      if (!fonts.has(key2)) fonts.set(key2, (async () => {
        const url = new URL(bundledFonts[name], window.document.baseURI).href;
        const face = await new FontFace(name, `url("${url}")`, { weight: "100 900" }).load();
        window.document.fonts.add(face);
      })());
      await fonts.get(key2);
    }
    if (!style.fontAssetId && !installedFont(name)) throw new Error(`Font unavailable: ${name}. Choose an installed font or import its file.`);
    const key = `${style.fontWeight} ${style.fontSize}px "${name}"`;
    if (!loadedStyles.has(key)) loadedStyles.set(key, window.document.fonts.load(key));
    await loadedStyles.get(key);
    if (loadedStyles.size > 200) loadedStyles.delete(loadedStyles.keys().next().value);
  }
}
function rasterizeText(element, doc) {
  const style = { ...element.textStyle };
  const lower = element.presets.find((p) => p.presetId === "Dark Box Text Lower Third");
  if (lower) style.backgroundColor = `rgba(12,12,12,${Number(lower.params.opacity ?? 0.8)})`;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(doc.canvas.width * element.transform.width));
  const ctx = canvas.getContext("2d");
  const font = `${style.fontWeight} ${style.fontSize}px "${family(element, doc)}"`;
  ctx.font = font;
  const lines = [];
  for (const paragraph of (element.text || "").split("\n")) {
    let line = "";
    for (const word of paragraph.split(" ")) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > canvas.width - style.padding * 2) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    lines.push(line);
  }
  canvas.height = Math.max(1, Math.ceil(lines.length * style.fontSize * style.lineHeight + 2 * (style.padding + style.shadowBlur + style.strokeWidth)));
  ctx.font = font;
  ctx.textAlign = style.align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = style.backgroundColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.color;
  ctx.strokeStyle = style.strokeColor;
  ctx.lineWidth = style.strokeWidth * 2;
  ctx.lineJoin = "round";
  ctx.shadowColor = style.shadowColor;
  ctx.shadowBlur = style.shadowBlur;
  ctx.shadowOffsetX = style.shadowX;
  ctx.shadowOffsetY = style.shadowY;
  const x = style.align === "center" ? canvas.width / 2 : style.align === "right" ? canvas.width - style.padding : style.padding;
  for (let i = 0; i < lines.length; i++) {
    const y = style.padding + style.shadowBlur + style.strokeWidth + style.fontSize * style.lineHeight * (i + 0.5);
    if (style.strokeWidth) ctx.strokeText(lines[i], x, y);
    ctx.fillText(lines[i], x, y);
  }
  return canvas;
}

// frontend/src/render/geometry.ts
function projectedCorners(t, width, height, aspect) {
  let boxW = t.width * width, boxH = t.height * height;
  if (t.fit === "contain") {
    const fit = t.fit === "contain" ? Math.min(boxW / aspect, boxH) : Math.max(boxW / aspect, boxH);
    boxW = fit * aspect;
    boxH = fit;
  }
  boxW *= t.scaleX;
  boxH *= t.scaleY;
  const rz = t.rotation * Math.PI / 180, rx = t.pitch * Math.PI / 180, ry = t.yaw * Math.PI / 180;
  const crop = t.crop;
  return [[0, 0], [1, 0], [0, 1], [1, 1]].map(([cornerU, cornerV]) => {
    const u = crop.left + cornerU * (1 - crop.left - crop.right);
    const v = crop.top + cornerV * (1 - crop.top - crop.bottom);
    let x = (u - t.pivotX) * boxW, y = (v - t.pivotY) * boxH, z = 0;
    z = -Math.sin(ry) * x;
    x = Math.cos(ry) * x;
    const nextY = Math.cos(rx) * y - Math.sin(rx) * z;
    z = Math.sin(rx) * y + Math.cos(rx) * z;
    y = nextY;
    const nextX = Math.cos(rz) * x - Math.sin(rz) * y;
    y = Math.sin(rz) * x + Math.cos(rz) * y;
    x = nextX;
    const w = Math.max(0.05, 1 + z / (width * 1.5));
    return [t.x * width + x / w, t.y * height + y / w, w];
  });
}

// frontend/src/render/compositor.ts
var vertex = `#version 300 es
in vec4 a_position; in vec2 a_uv; out vec2 v_uv;
void main(){gl_Position=a_position;v_uv=a_uv;}`;
var fragment = `#version 300 es
precision highp float; in vec2 v_uv; out vec4 outputColor;
uniform sampler2D u_texture; uniform vec4 u_crop; uniform vec2 u_pixel; uniform float u_opacity;
uniform float u_blur;uniform float u_angle;uniform float u_radial;uniform bool u_mirror;
uniform bool u_flip;
uniform vec3 u_key;uniform float u_tolerance;uniform float u_softness;uniform float u_spill;
vec2 edge(vec2 p){return u_mirror?1.0-abs(mod(p,2.0)-1.0):clamp(p,vec2(0),vec2(1));}
vec4 sampleColor(vec2 p){vec2 uv=edge(mix(u_crop.xy,vec2(1)-u_crop.zw,p));if(u_flip)uv.y=1.0-uv.y;return texture(u_texture,uv);}
void main(){
 vec4 color=vec4(0);float weights=0.0;
 if(u_blur<0.001 && abs(u_radial)<0.00001){color=sampleColor(v_uv);weights=1.0;}else for(int i=-8;i<=8;i++){float t=float(i)/8.0;float weight=exp(-t*t*3.0);
  vec2 p=v_uv+vec2(cos(u_angle),sin(u_angle))*u_pixel*u_blur*t;
  if(abs(u_radial)>0.00001){float a=u_radial*t;vec2 d=p-vec2(.5);p=vec2(cos(a)*d.x-sin(a)*d.y,sin(a)*d.x+cos(a)*d.y)+vec2(.5);}
  color+=sampleColor(p)*weight;weights+=weight;
 }
 color/=weights;
 if(u_tolerance>=0.0){float distanceToKey=distance(color.rgb,u_key);float mask=smoothstep(u_tolerance,u_tolerance+u_softness,distanceToKey);color.a*=mask;
  vec3 dominance=max(vec3(0),u_key-vec3(min(min(u_key.r,u_key.g),u_key.b)));color.rgb=max(vec3(0),color.rgb-dominance*(1.0-mask)*u_spill*.35);
 }
 color.a*=u_opacity;outputColor=vec4(color.rgb*color.a,color.a);
}`;
var gaussian = `#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;uniform sampler2D u_texture;uniform vec2 u_direction;uniform bool u_flip;
void main(){vec4 color=vec4(0);float sum=0.0;for(int i=-8;i<=8;i++){float t=float(i)/8.0;float w=exp(-3.0*t*t);vec2 uv=clamp(v_uv+u_direction*t,vec2(0),vec2(1));if(u_flip)uv.y=1.0-uv.y;vec4 s=texture(u_texture,uv);color+=vec4(s.rgb*s.a,s.a)*w;sum+=w;}color/=sum;outputColor=vec4(color.a>.00001?color.rgb/color.a:vec3(0),color.a);}`;
var keyer = `#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;uniform sampler2D u_texture;uniform bool u_flip;uniform vec3 u_key;uniform float u_tolerance;uniform float u_softness;uniform float u_spill;
void main(){vec2 uv=v_uv;if(u_flip)uv.y=1.0-uv.y;vec4 c=texture(u_texture,uv);float mask=smoothstep(u_tolerance,u_tolerance+u_softness,distance(c.rgb,u_key));c.a*=mask;vec3 dominance=max(vec3(0),u_key-vec3(min(min(u_key.r,u_key.g),u_key.b)));c.rgb=max(vec3(0),c.rgb-dominance*(1.0-mask)*u_spill*.35);outputColor=c;}`;
var borderFragment = `#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;
uniform vec2 u_size;uniform vec3 u_color;uniform float u_width;uniform float u_radius;uniform float u_softness;uniform float u_opacity;
void main(){
 vec2 halfSize=u_size*.5;float radius=min(u_radius,min(halfSize.x,halfSize.y));
 vec2 q=abs((v_uv-.5)*u_size)-(halfSize-vec2(radius));
 float d=length(max(q,vec2(0)))+min(max(q.x,q.y),0.0)-radius;
 float aa=max(fwidth(d),max(.001,u_softness));
 float a=(1.0-smoothstep(-aa,0.0,d))*smoothstep(-u_width-aa,-u_width+aa,d)*u_opacity;
 if(u_width<=0.0)a=0.0;
 outputColor=vec4(u_color*a,a);
}`;
var transitionFragment = `#version 300 es
precision highp float;in vec2 v_uv;out vec4 outputColor;uniform sampler2D u_out;uniform sampler2D u_in;uniform vec4 u_warpOut;uniform vec4 u_warpIn;uniform float u_mix;uniform vec4 u_motion;uniform bool u_mirror;uniform float u_aspect;
vec2 edge(vec2 p){return u_mirror?1.0-abs(mod(p,2.0)-1.0):p;}
vec4 sampleWarp(sampler2D tex,vec2 p,vec4 warp){p-=vec2(.5)+warp.xy;p.x*=u_aspect;float a=-warp.z;vec2 uv=vec2(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y);uv.x/=u_aspect;uv=uv/max(.001,warp.w)+vec2(.5);if(!u_mirror&&(any(lessThan(uv,vec2(0)))||any(greaterThan(uv,vec2(1)))))return vec4(0);uv=edge(uv);return texture(tex,vec2(uv.x,1.0-uv.y));}
vec4 merged(vec2 p){return mix(sampleWarp(u_out,p,u_warpOut),sampleWarp(u_in,p,u_warpIn),u_mix);}
void main(){
 if(u_motion.x<.00001&&abs(u_motion.z)<.00001&&u_motion.w<.00001){outputColor=merged(v_uv);return;}
 vec4 color=vec4(0);float sum=0.0;
 vec2 direction=vec2(cos(u_motion.y),sin(u_motion.y)*u_aspect)*u_motion.x;
 vec2 size=vec2(textureSize(u_out,0));
 int steps=int(clamp(ceil(length(direction*size)+abs(u_motion.z)*max(size.x,size.y)+u_motion.w*max(size.x,size.y)),8.0,128.0));
 // Fusion's default Linear DirectionalBlur smears in one direction. Centered
 // Gaussian sampling shifts both sides of the seam and changes its appearance.
 bool linear=abs(u_motion.z)<.00001&&u_motion.w<.00001;
 for(int i=-128;i<=128;i++){
  if(abs(i)>steps)continue;
  float t=float(i)/float(steps);
  float w=linear?1.0:exp(-3.0*t*t);
  if(linear)t=(t-1.0)*.5;
  vec2 p=v_uv+direction*t;
  vec2 d=p-vec2(.5);d.x*=u_aspect;float a=u_motion.z*t;
  d=vec2(cos(a)*d.x-sin(a)*d.y,sin(a)*d.x+cos(a)*d.y);d.x/=u_aspect;
  p=d*(1.0+u_motion.w*t)+vec2(.5);
  // Blur the merged frame; its borders do not introduce additional mirrored
  // copies of the source transforms outside the composition canvas.
  color+=merged(linear?clamp(p,vec2(0),vec2(1)):p)*w;sum+=w;
 }
 outputColor=color/sum;
}`;
function shader(gl, type, source) {
  const s = gl.createShader(type);
  gl.shaderSource(s, source);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || "Shader compilation failed");
  return s;
}
var colors = /* @__PURE__ */ new Map();
var colorCanvas = null;
function colorRGB(color) {
  const cached = colors.get(color);
  if (cached) return cached;
  if (!colorCanvas) colorCanvas = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  colorCanvas.clearRect(0, 0, 1, 1);
  colorCanvas.fillStyle = "#000000";
  colorCanvas.fillStyle = color;
  colorCanvas.fillRect(0, 0, 1, 1);
  const bytes = colorCanvas.getImageData(0, 0, 1, 1).data, result = [bytes[0] / 255, bytes[1] / 255, bytes[2] / 255];
  colors.set(color, result);
  if (colors.size > 128) colors.delete(colors.keys().next().value);
  return result;
}
var Compositor = class {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = canvas.getContext("webgl2", { alpha: false, premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false });
    if (!gl) throw new Error("WebGL2 is unavailable");
    this.gl = gl;
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl, gl.VERTEX_SHADER, vertex));
    gl.attachShader(program, shader(gl, gl.FRAGMENT_SHADER, fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) || "Shader link failed");
    this.program = program;
    this.buffer = gl.createBuffer();
    for (const name of ["texture", "crop", "pixel", "opacity", "blur", "angle", "radial", "mirror", "key", "tolerance", "softness", "spill", "flip"]) this.locations[name] = gl.getUniformLocation(program, `u_${name}`);
    const make = (source) => {
      const p = gl.createProgram();
      gl.attachShader(p, shader(gl, gl.VERTEX_SHADER, vertex));
      gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER, source));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || "Shader failed");
      return p;
    };
    this.gradeProgram = make(colorGradeFragment);
    this.gaussianProgram = make(gaussian);
    this.transitionProgram = make(transitionFragment);
    this.keyerProgram = make(keyer);
    this.borderProgram = make(borderFragment);
  }
  gl;
  program;
  buffer;
  textures = /* @__PURE__ */ new Map();
  sequence = 0;
  locations = {};
  gradeProgram;
  gaussianProgram;
  transitionProgram;
  keyerProgram;
  borderProgram;
  targets = /* @__PURE__ */ new Map();
  target(id, width, height) {
    const gl = this.gl;
    let target = this.targets.get(id);
    if (target && (target.width !== width || target.height !== height)) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
      this.targets.delete(id);
      target = void 0;
    }
    if (!target) {
      const texture = gl.createTexture(), framebuffer = gl.createFramebuffer();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("Composition framebuffer unavailable");
      target = { texture, framebuffer, width, height };
      this.targets.set(id, target);
    }
    return target;
  }
  geometry(program, data) {
    const gl = this.gl;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const pos = gl.getAttribLocation(program, "a_position"), uv = gl.getAttribLocation(program, "a_uv");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 24, 16);
    gl.bufferData(gl.ARRAY_BUFFER, data || new Float32Array([-1, 1, 0, 1, 0, 0, 1, 1, 0, 1, 1, 0, -1, -1, 0, 1, 0, 1, 1, -1, 0, 1, 1, 1]), gl.DYNAMIC_DRAW);
  }
  draw(plan, timeUs, frames, width = plan.document.canvas.width, height = plan.document.canvas.height) {
    this.sequence++;
    const gl = this.gl;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.viewport(0, 0, width, height);
    const background = colorRGB(plan.document.canvas.background);
    gl.clearColor(background[0], background[1], background[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const pos = gl.getAttribLocation(this.program, "a_position"), uv = gl.getAttribLocation(this.program, "a_uv");
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 4, gl.FLOAT, false, 24, 0);
    gl.enableVertexAttribArray(uv);
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 24, 16);
    const layers = evaluateFrame(plan, timeUs);
    const prepared = /* @__PURE__ */ new Map();
    for (const layer of layers) {
      let frame = frames.get(layer.id) || frames.get(layer.element.assetId || "");
      const key = layer.element.kind === "text" ? JSON.stringify([layer.element.text, layer.element.textStyle, layer.element.presets.filter((p) => p.presetId === "Dark Box Text Lower Third"), layer.element.transform.width, plan.document.canvas.width]) : void 0;
      const previous = this.textures.get(layer.id);
      if (layer.element.kind === "text") frame = previous?.key === key ? void 0 : rasterizeText(layer.element, plan.document);
      if (!frame && !previous) {
        if (layer.element.kind !== "text") throw new Error(`Frame unavailable: ${layer.element.label}`);
        continue;
      }
      const texture = previous || { texture: gl.createTexture(), width: 1, height: 1, used: this.sequence, key };
      texture.used = this.sequence;
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      if (frame) {
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        if ("data" in frame) {
          texture.width = frame.width;
          texture.height = frame.height;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, frame.width, frame.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, frame.data);
        } else {
          const f = frame;
          texture.width = f.videoWidth || frame.naturalWidth || frame.width;
          texture.height = f.videoHeight || frame.naturalHeight || frame.height;
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
        }
        texture.key = key;
        this.textures.set(layer.id, texture);
      }
      let processed = texture.texture, flip = false;
      let lastTarget = null, keyPass = 0;
      for (const effect of layer.element.presets) {
        if (effect.presetId === "Gaussian Blur" && Number(effect.params.radius ?? 12) > 0) {
          const radius = Number(effect.params.radius ?? 12);
          for (let pass = 0; pass < 2; pass++) {
            const id = `blur-${pass}`, target = this.target(id, texture.width, texture.height);
            gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
            gl.viewport(0, 0, texture.width, texture.height);
            gl.disable(gl.BLEND);
            this.geometry(this.gaussianProgram);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, processed);
            gl.uniform1i(gl.getUniformLocation(this.gaussianProgram, "u_texture"), 0);
            gl.uniform1i(gl.getUniformLocation(this.gaussianProgram, "u_flip"), flip ? 1 : 0);
            gl.uniform2f(gl.getUniformLocation(this.gaussianProgram, "u_direction"), pass === 0 ? radius / texture.width : 0, pass === 1 ? radius / texture.height : 0);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            processed = target.texture;
            flip = true;
            lastTarget = id;
          }
        }
        if (effect.presetId === "3D Keyer") {
          const id = `key-${keyPass++ % 2}`, target = this.target(id, texture.width, texture.height);
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
          gl.viewport(0, 0, texture.width, texture.height);
          gl.disable(gl.BLEND);
          this.geometry(this.keyerProgram);
          gl.activeTexture(gl.TEXTURE0);
          gl.bindTexture(gl.TEXTURE_2D, processed);
          const loc = (name) => gl.getUniformLocation(this.keyerProgram, `u_${name}`), color = colorRGB(String(effect.params.color ?? "#00ff00"));
          gl.uniform1i(loc("texture"), 0);
          gl.uniform1i(loc("flip"), flip ? 1 : 0);
          gl.uniform3f(loc("key"), color[0], color[1], color[2]);
          gl.uniform1f(loc("tolerance"), Number(effect.params.tolerance ?? 0.25));
          gl.uniform1f(loc("softness"), Number(effect.params.softness ?? 0.08));
          gl.uniform1f(loc("spill"), Number(effect.params.spill ?? 0.5));
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          processed = target.texture;
          flip = true;
          lastTarget = id;
        }
      }
      if (isColorGraded(layer.colorGrade)) {
        const g = normalizeColorGrade(layer.colorGrade), target = this.target("grade", texture.width, texture.height), program = this.gradeProgram;
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, texture.width, texture.height);
        gl.disable(gl.BLEND);
        this.geometry(program);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, processed);
        const loc = (name) => gl.getUniformLocation(program, `u_${name}`);
        gl.uniform1i(loc("texture"), 0);
        gl.uniform1i(loc("flip"), flip ? 1 : 0);
        gl.uniform4f(loc("primary"), g.exposure, g.temperature, g.tint, g.contrast);
        gl.uniform4f(loc("tone"), g.saturation, g.shadows, g.midtones, g.highlights);
        gl.uniform1f(loc("rolloff"), g.rolloff);
        const m = g.mask;
        gl.uniform4f(loc("region"), m?.x ?? 0.5, m?.y ?? 0.5, m?.width ?? 1, m?.height ?? 1);
        gl.uniform3f(loc("mask"), !m ? 0 : m.shape === "ellipse" ? 2 : 1, m?.feather ?? 0, m?.invert ? 1 : 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        processed = target.texture;
        flip = true;
        lastTarget = "grade";
      }
      if (lastTarget) {
        const copy = this.target(`processed-${layer.id}`, texture.width, texture.height);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.targets.get(lastTarget).framebuffer);
        gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, copy.framebuffer);
        gl.blitFramebuffer(0, 0, texture.width, texture.height, 0, 0, texture.width, texture.height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        processed = copy.texture;
      }
      prepared.set(layer.id, { texture: processed, width: texture.width, height: texture.height, flip });
    }
    const drawLayer = (layer, framebuffer) => {
      const texture = prepared.get(layer.id);
      if (!texture) return;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.viewport(0, 0, width, height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      if (layer.element.matteColor) {
        const target = this.target("matte", 1, 1), color2 = colorRGB(layer.element.matteColor);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
        gl.viewport(0, 0, 1, 1);
        gl.clearColor(color2[0], color2[1], color2[2], 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.viewport(0, 0, width, height);
        const corners2 = projectedCorners({ ...layer.transform, fit: "stretch" }, plan.document.canvas.width, plan.document.canvas.height, 1);
        this.geometry(this.program, new Float32Array(corners2.flatMap(([x, y, w], i) => [(x / plan.document.canvas.width * 2 - 1) * w, (1 - y / plan.document.canvas.height * 2) * w, 0, w, i % 2, Math.floor(i / 2)])));
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, target.texture);
        gl.uniform1i(this.locations.texture, 0);
        gl.uniform4f(this.locations.crop, 0, 0, 0, 0);
        gl.uniform1f(this.locations.opacity, layer.transform.opacity);
        gl.uniform1f(this.locations.blur, 0);
        gl.uniform1f(this.locations.radial, 0);
        gl.uniform1f(this.locations.tolerance, -1);
        gl.uniform1i(this.locations.flip, 0);
        gl.uniform1i(this.locations.mirror, 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
      const crop = { ...layer.transform.crop }, aspect = texture.width / texture.height;
      const corners = projectedCorners(layer.transform, plan.document.canvas.width, plan.document.canvas.height, aspect);
      if (layer.transform.fit === "cover") {
        const boxAspect = layer.transform.width * plan.document.canvas.width / (layer.transform.height * plan.document.canvas.height);
        if (aspect > boxAspect) {
          const retained = boxAspect / aspect, margin = (1 - retained) / 2;
          crop.left = margin + crop.left * retained;
          crop.right = margin + crop.right * retained;
        } else {
          const retained = aspect / boxAspect, margin = (1 - retained) / 2;
          crop.top = margin + crop.top * retained;
          crop.bottom = margin + crop.bottom * retained;
        }
      }
      const data = new Float32Array(corners.flatMap(([x, y, w], i) => [(x / plan.document.canvas.width * 2 - 1) * w, (1 - y / plan.document.canvas.height * 2) * w, 0, w, i % 2, Math.floor(i / 2)]));
      this.geometry(this.program, data);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.uniform1i(this.locations.flip, texture.flip ? 1 : 0);
      gl.uniform1i(this.locations.texture, 0);
      gl.uniform4f(this.locations.crop, crop.left, crop.top, crop.right, crop.bottom);
      gl.uniform2f(this.locations.pixel, 1 / texture.width, 1 / texture.height);
      gl.uniform1f(this.locations.opacity, layer.transform.opacity);
      gl.uniform1f(this.locations.blur, 0);
      gl.uniform1f(this.locations.angle, layer.blurAngle * Math.PI / 180);
      gl.uniform1f(this.locations.radial, layer.radialBlur);
      gl.uniform1i(this.locations.mirror, layer.mirrorEdges ? 1 : 0);
      const color = colorRGB(layer.keyColor);
      gl.uniform3f(this.locations.key, color[0], color[1], color[2]);
      gl.uniform1f(this.locations.tolerance, -1);
      gl.uniform1f(this.locations.softness, layer.keySoftness);
      gl.uniform1f(this.locations.spill, layer.keySpill);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      for (const preset of layer.element.presets.filter((p) => p.presetId === "Colored Border")) {
        const params = preset.params, onCanvas = params.onCanvas !== false;
        const transform = onCanvas ? defaultTransform() : layer.transform;
        const borderCorners = projectedCorners(transform, plan.document.canvas.width, plan.document.canvas.height, onCanvas ? plan.document.canvas.width / plan.document.canvas.height : aspect);
        this.geometry(this.borderProgram, new Float32Array(borderCorners.flatMap(([x, y, w], i) => [(x / plan.document.canvas.width * 2 - 1) * w, (1 - y / plan.document.canvas.height * 2) * w, 0, w, i % 2, Math.floor(i / 2)])));
        const loc = (name) => gl.getUniformLocation(this.borderProgram, `u_${name}`), rgb = colorRGB(String(params.color ?? "#ffffff"));
        const boxWidth = Math.hypot(borderCorners[1][0] - borderCorners[0][0], borderCorners[1][1] - borderCorners[0][1]);
        const boxHeight = Math.hypot(borderCorners[2][0] - borderCorners[0][0], borderCorners[2][1] - borderCorners[0][1]);
        gl.uniform2f(loc("size"), boxWidth, boxHeight);
        gl.uniform3f(loc("color"), rgb[0], rgb[1], rgb[2]);
        gl.uniform1f(loc("width"), Number(params.width ?? 36));
        gl.uniform1f(loc("radius"), Number(params.cornerRadius ?? 0));
        gl.uniform1f(loc("softness"), Number(params.softEdge ?? 0));
        gl.uniform1f(loc("opacity"), layer.transform.opacity);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }
    };
    for (let i = 0; i < layers.length; i++) {
      const layer = layers[i], incoming = layers[i + 1];
      if (layer.transition && incoming?.transition?.group === layer.transition.group) {
        const a = this.target("transition-out", width, height), b = this.target("transition-in", width, height);
        for (const [l, target] of [[layer, a], [incoming, b]]) {
          gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
          gl.clearColor(0, 0, 0, 0);
          gl.clear(gl.COLOR_BUFFER_BIT);
          drawLayer(l, target.framebuffer);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        this.geometry(this.transitionProgram);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, a.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, b.texture);
        const loc = (name) => gl.getUniformLocation(this.transitionProgram, `u_${name}`);
        gl.uniform1i(loc("out"), 0);
        gl.uniform1i(loc("in"), 1);
        for (const [name, l] of [["warpOut", layer], ["warpIn", incoming]]) {
          const t2 = l.transition;
          gl.uniform4f(loc(name), t2.offsetX, t2.offsetY, t2.rotation * Math.PI / 180, t2.scale);
        }
        const t = layer.transition;
        gl.uniform1f(loc("mix"), t.mix);
        gl.uniform1f(loc("aspect"), width / height);
        gl.uniform1i(loc("mirror"), layer.mirrorEdges ? 1 : 0);
        gl.uniform4f(loc("motion"), t.blur, t.angle * Math.PI / 180, t.radial, t.zoomBlur);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        i++;
      } else drawLayer(layer, null);
    }
    for (const [id, entry] of this.textures) if (entry.used < this.sequence - 2) {
      gl.deleteTexture(entry.texture);
      this.textures.delete(id);
    }
    for (const [id, target] of this.targets) if (id.startsWith("processed-") && !this.textures.has(id.slice(10))) {
      gl.deleteTexture(target.texture);
      gl.deleteFramebuffer(target.framebuffer);
      this.targets.delete(id);
    }
    return layers;
  }
  readRgba() {
    const { gl, canvas } = this;
    const pixels = new Uint8Array(canvas.width * canvas.height * 4);
    gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const stride = canvas.width * 4, row = new Uint8Array(stride);
    for (let y = 0; y < Math.floor(canvas.height / 2); y++) {
      const a = y * stride, b = (canvas.height - 1 - y) * stride;
      row.set(pixels.subarray(a, a + stride));
      pixels.copyWithin(a, b, b + stride);
      pixels.set(row, b);
    }
    return pixels;
  }
  dispose() {
    const gl = this.gl;
    for (const t of this.textures.values()) gl.deleteTexture(t.texture);
    this.textures.clear();
    for (const t of this.targets.values()) {
      gl.deleteTexture(t.texture);
      gl.deleteFramebuffer(t.framebuffer);
    }
    this.targets.clear();
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
    gl.deleteProgram(this.gaussianProgram);
    gl.deleteProgram(this.transitionProgram);
    gl.deleteProgram(this.keyerProgram);
    gl.deleteProgram(this.borderProgram);
    gl.deleteProgram(this.gradeProgram);
  }
};

// frontend/src/render-worker/direct.ts
function createDirectRenderer() {
  const compositor = new Compositor(document.querySelector("canvas"));
  let plan, verifyParity = false;
  const gl = compositor.canvas.getContext("webgl2"), pack = gl.createBuffer();
  let packSize = 0;
  const read = async () => {
    const width = compositor.canvas.width, height = compositor.canvas.height, size = width * height * 4;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pack);
    if (packSize !== size) {
      gl.bufferData(gl.PIXEL_PACK_BUFFER, size, gl.STREAM_READ);
      packSize = size;
    }
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    if (!fence) throw Error("Export GPU readback unavailable");
    try {
      const deadline = performance.now() + 6e4;
      for (; ; ) {
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
        if (status === gl.WAIT_FAILED || performance.now() > deadline) throw Error("Export GPU readback timed out");
        await new Promise((r) => setTimeout(r, 1));
      }
      const pixels = new Uint8Array(size);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, pixels);
      const stride = width * 4, row = new Uint8Array(stride);
      for (let y = 0; y < Math.floor(height / 2); y++) {
        const a = y * stride, b = (height - 1 - y) * stride;
        row.set(pixels.subarray(a, a + stride));
        pixels.copyWithin(a, b, b + stride);
        pixels.set(row, b);
      }
      return pixels;
    } finally {
      gl.deleteSync(fence);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    }
  };
  return async (request) => {
    if (request.type === "init") {
      plan = request.plan;
      verifyParity = request.verifyParity;
      await loadCompositionFonts(plan.document, (p) => `file:///${p.replace(/\\/g, "/")}`);
      return {};
    }
    if (request.type === "evaluate") return { layers: evaluateFrame(plan, request.timeUs).filter((l) => l.element.kind !== "text").map((l) => ({ id: l.id, assetId: l.element.assetId, sourceTimeUs: l.sourceTimeUs, colorManaged: isColorGraded(l.colorGrade) })) };
    if (request.type === "frame") {
      const frames = new Map(request.frames.map((f) => [f.id, { data: f.data, width: f.width, height: f.height }]));
      const started = performance.now();
      compositor.draw(plan, request.timeUs, frames, request.width, request.height);
      const rendered = performance.now(), data = await read();
      let parity = true;
      if (request.index === 0 && verifyParity) {
        const preview = new Compositor(document.createElement("canvas"));
        preview.draw(plan, request.timeUs, frames, request.width, request.height);
        const pixels = preview.readRgba();
        parity = data.every((v, i) => v === pixels[i]);
        preview.dispose();
      }
      return { data, parity, renderMs: rendered - started, readbackMs: performance.now() - rendered };
    }
    throw Error("Unknown render request");
  };
}
