import type { CompositionDocument, Element } from './types';
import { validatePreset } from './presetRegistry';
import schema from '../../../shared/composition-schema.json';
import {validateSchema} from './schemaValidation';
const finite=(value:number,name:string,min=-1e9,max=1e9)=>{if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`Invalid ${name}`);};
const time=(value:number,name:string,min=0)=>{finite(value,name,min,Number.MAX_SAFE_INTEGER);if(!Number.isSafeInteger(value))throw new Error(`${name} must be integer microseconds`);};
export function validateComposition(doc:CompositionDocument) {
  validateSchema(doc,schema);
  if(!doc||doc.version!==2)throw new Error('Unsupported composition version');
  finite(doc.canvas.width,'canvas width',16,7680);finite(doc.canvas.height,'canvas height',16,4320);
  finite(doc.canvas.fps.num,'fps numerator',1,240000);finite(doc.canvas.fps.den,'fps denominator',1,10000);
  const tracks=new Set(doc.tracks.map(t=>t.id));if(tracks.size!==doc.tracks.length)throw new Error('Duplicate track ID');
  for(const [id,a] of Object.entries(doc.assets)) {if(a.id!==id||!a.path||!['image','video','audio','font'].includes(a.kind))throw new Error(`Invalid asset: ${id}`);time(a.durationUs,'asset duration');}
  for(const [id,e] of Object.entries(doc.elements)){
    if(id!==e.id||!tracks.has(e.trackId)||!['base','image','video','text','audio'].includes(e.kind))throw new Error(`Invalid element or track: ${id}`);
    if(e.kind!=='text'&&(!e.assetId||!doc.assets[e.assetId]))throw new Error(`Missing asset for ${id}`);
    if(e.kind==='text'&&(!e.textStyle||typeof e.text!=='string'))throw new Error(`Invalid text: ${id}`);
    if(e.colorGrade&&['text','audio'].includes(e.kind))throw new Error('Grade only video/image layers');
    const track=doc.tracks.find(t=>t.id===e.trackId)!;if((e.kind==='audio')!==(track.kind==='audio'))throw new Error(`Incompatible track: ${id}`);
    if(e.assetId){const kind=doc.assets[e.assetId].kind;if(e.kind==='image'&&kind!=='image'||['video','base'].includes(e.kind)&&kind!=='video'||e.kind==='audio'&&!['audio','video'].includes(kind))throw new Error(`Incompatible asset: ${id}`);}
    const p=e.placement;
    if(p.kind!=='speech'&&(('timingBasis' in p&&p.timingBasis!=='auto')||('endAtCutUs' in p&&p.endAtCutUs)))throw new Error('Acoustic timing and cut extension require speech placement');
    if(p.kind==='timeline'||p.kind==='source'){time(p.startUs,'start');time(p.endUs,'end');if(p.endUs<=p.startUs)throw new Error('Empty element interval');}
    else if(p.kind==='project'){time(p.startOffsetUs,'start offset',-Number.MAX_SAFE_INTEGER);time(p.endOffsetUs,'end offset',-Number.MAX_SAFE_INTEGER);}
    else if(p.kind==='speech'){if(!p.startWordId||!p.endWordId||!p.fallback.clipId||p.fallback.endUs<=p.fallback.startUs)throw new Error('Speech anchor needs word IDs and a fallback interval');time(p.fallback.startUs,'fallback start');time(p.fallback.endUs,'fallback end');time(p.startOffsetUs,'offset',-Number.MAX_SAFE_INTEGER);time(p.endOffsetUs,'offset',-Number.MAX_SAFE_INTEGER);}
    else throw new Error('Unknown placement kind');
    if(p.kind==='source'&&!p.clipId)throw new Error('Source anchor needs a clip ID');
    if(p.kind==='timeline'&&p.ranges){let end=p.startUs;if(!p.ranges.length||p.ranges[0].startUs!==p.startUs||p.ranges.at(-1)!.endUs!==p.endUs)throw new Error('Clip ranges must match its bounds');for(const range of p.ranges){time(range.startUs,'range start');time(range.endUs,'range end');if(range.startUs<end||range.endUs<=range.startUs)throw new Error('Invalid clip ranges');end=range.endUs;}}
    time(e.sourceInUs,'source in');if(!['hold','loop','trim'].includes(e.endPolicy))throw new Error('Invalid end policy');
    for(const window of [e.contentWindow,e.audio?.envelopeWindow])if(window){time(window.offsetUs,'content offset');time(window.durationUs,'content duration',1);}
    for(const [key,value] of Object.entries(e.transform))if(typeof value==='number')finite(value,`transform ${key}`);
    finite(e.transform.opacity,'opacity',0,1);finite(e.transform.scaleX,'scale X',.001,100);finite(e.transform.scaleY,'scale Y',.001,100);
    finite(e.transform.pitch,'pitch',-89,89);finite(e.transform.yaw,'yaw',-89,89);
    for(const [key,value] of Object.entries(e.transform.crop))finite(value,`crop ${key}`,0,.999);
    if(e.transform.crop.left+e.transform.crop.right>=1||e.transform.crop.top+e.transform.crop.bottom>=1)throw new Error('Crop removes entire image');
    for(const p of e.presets)validatePreset(p);
    if(e.audio){finite(e.audio.gainDb,'gain',-96,24);time(e.audio.fadeInUs,'fade in');time(e.audio.fadeOutUs,'fade out');}
    if(e.textStyle){finite(e.textStyle.fontSize,'font size',1,1000);finite(e.textStyle.strokeWidth,'stroke',0,100);finite(e.textStyle.lineHeight,'line height',.5,4);}
    if(e.textStyle?.fontAssetId&&doc.assets[e.textStyle.fontAssetId]?.kind!=='font')throw new Error(`Missing font for ${id}`);
  }
  for(const [id,t] of Object.entries(doc.transitions)){if(t.id!==id||!doc.elements[t.fromId]||!doc.elements[t.toId])throw new Error('Broken transition reference');time(t.atUs,'transition time');time(t.durationUs,'transition duration');if(!t.durationUs)throw new Error('Empty transition');validatePreset(t.preset);}
  finite(doc.masterGainDb,'master gain',-96,6);
  for(const id of Object.keys(doc.sourceGrades||{}))if(!id||['__proto__','constructor','prototype'].includes(id))throw new Error('Invalid grading source');
  if(Object.keys(doc.buses).sort().join(',')!=='music,sound,supplemental,voice')throw new Error('Missing audio bus');
  for(const variant of Object.values(doc.presetVariants))validatePreset(variant.preset);
  for(const bus of Object.values(doc.buses))finite(bus.gainDb,'bus gain',-96,24);
}
export function validateElement(element:Element,document:CompositionDocument){validateComposition({...document,elements:{...document.elements,[element.id]:element}});}
