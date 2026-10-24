import type { Element, CompositionDocument } from '../composition/types';
const fonts=new Map<string,Promise<void>>();
const loadedStyles=new Map<string,Promise<FontFace[]>>();
// Shipped with its OFL license. It is available offline in both the player and
// the hidden export window, without requiring a system font installation.
const bundledFonts:Record<string,string>={'Open Sans':'fonts/OpenSans.ttf'};
function family(element:Element,document:CompositionDocument){const asset=document.assets[element.textStyle!.fontAssetId||''];return asset?`edity-font-${asset.hash||asset.id}`:element.textStyle!.fontFamily;}
function installedFont(name:string){if(['serif','sans-serif','monospace'].includes(name))return true;const context=window.document.createElement('canvas').getContext('2d')!,sample='WwmMiIlL0123456789abcdefghijklmnopqrstuvwxyz';return ['monospace','serif'].some(fallback=>{context.font=`72px ${fallback}`;const base=context.measureText(sample).width;context.font=`72px "${name}",${fallback}`;return context.measureText(sample).width!==base;});}
export async function loadCompositionFonts(document:CompositionDocument,urlFor:(path:string)=>string) {
  for(const asset of Object.values(document.assets).filter(a=>a.kind==='font'&&Object.values(document.elements).some(e=>e.enabled&&e.textStyle?.fontAssetId===a.id))){
    const key=asset.hash||asset.path;
    if(!fonts.has(key))fonts.set(key,(async()=>{const font=await new FontFace(`edity-font-${asset.hash||asset.id}`,`url("${urlFor(asset.path)}")`).load(); window.document.fonts.add(font);})());
    await fonts.get(key);
  }
  // document.fonts.ready can wait for a layout/paint that an invisible window
  // never schedules. Load the exact faces used by canvas instead.
  for(const element of Object.values(document.elements))if(element.textStyle){const style=element.textStyle,name=family(element,document);
    if(!style.fontAssetId&&bundledFonts[name]){
      const key=`bundled:${name}`;
      if(!fonts.has(key))fonts.set(key,(async()=>{const url=new URL(bundledFonts[name],window.document.baseURI).href;const face=await new FontFace(name,`url("${url}")`,{weight:'100 900'}).load();window.document.fonts.add(face);})());
      await fonts.get(key);
    }
    if(!style.fontAssetId&&!installedFont(name))throw new Error(`Font unavailable: ${name}. Choose an installed font or import its file.`);const key=`${style.fontWeight} ${style.fontSize}px "${name}"`;if(!loadedStyles.has(key))loadedStyles.set(key,window.document.fonts.load(key));await loadedStyles.get(key);if(loadedStyles.size>200)loadedStyles.delete(loadedStyles.keys().next().value!);}
}
export function rasterizeText(element:Element,doc:CompositionDocument):HTMLCanvasElement {
  const style={...element.textStyle!};
  const lower=element.presets.find(p=>p.presetId==='Dark Box Text Lower Third');
  if(lower)style.backgroundColor=`rgba(12,12,12,${Number(lower.params.opacity ?? .8)})`;
  const canvas=document.createElement('canvas');
  canvas.width=Math.max(1,Math.round(doc.canvas.width*element.transform.width));
  const ctx=canvas.getContext('2d')!;
  const font=`${style.fontWeight} ${style.fontSize}px "${family(element,doc)}"`;
  ctx.font=font;
  const lines:string[]=[];
  for(const paragraph of (element.text||'').split('\n')){
    let line='';for(const word of paragraph.split(' ')){const candidate=line?`${line} ${word}`:word;if(line&&ctx.measureText(candidate).width>canvas.width-style.padding*2){lines.push(line);line=word;}else line=candidate; }lines.push(line);
  }
  canvas.height=Math.max(1,Math.ceil(lines.length*style.fontSize*style.lineHeight+2*(style.padding+style.shadowBlur+style.strokeWidth)));
  ctx.font=font;ctx.textAlign=style.align;ctx.textBaseline='middle';
  ctx.fillStyle=style.backgroundColor;ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle=style.color;ctx.strokeStyle=style.strokeColor;ctx.lineWidth=style.strokeWidth*2;ctx.lineJoin='round';
  ctx.shadowColor=style.shadowColor;ctx.shadowBlur=style.shadowBlur;ctx.shadowOffsetX=style.shadowX;ctx.shadowOffsetY=style.shadowY;
  const x=style.align==='center'?canvas.width/2:style.align==='right'?canvas.width-style.padding:style.padding;
  for(let i=0;i<lines.length;i++){
    const y=style.padding+style.shadowBlur+style.strokeWidth+style.fontSize*style.lineHeight*(i+.5);
    if(style.strokeWidth)ctx.strokeText(lines[i],x,y);ctx.fillText(lines[i],x,y);
  }
  return canvas;
}
