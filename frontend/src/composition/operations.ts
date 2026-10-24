import type { CompositionDocument, Operation } from './types';
import { validateComposition } from './validation';
import {normalizeColorGrade} from './colorGrade';
function mergeFields(before:any,changes:any):any{const next={...before};for(const [key,value] of Object.entries(changes)){if(['__proto__','constructor','prototype'].includes(key))throw new Error('Invalid field');next[key]=value&&typeof value==='object'&&!Array.isArray(value)&&before?.[key]&&typeof before[key]==='object'&&(!('kind' in value)||(value as any).kind===before[key].kind)?mergeFields(before[key],value):structuredClone(value);}return next;}
export function applyOperations(document:CompositionDocument,operations:Operation[]):CompositionDocument {
  const next=structuredClone(document);
  for(const op of operations){
    switch(op.type){
      case 'sourceGrade':if(!op.sourceId||['__proto__','constructor','prototype'].includes(op.sourceId))throw new Error('Invalid grading source');next.sourceGrades??={};if(op.grade==null)delete next.sourceGrades[op.sourceId];else next.sourceGrades[op.sourceId]=normalizeColorGrade(op.grade);break;
      case 'add':if(next.elements[op.element.id])throw new Error(`Element already exists: ${op.element.id}`);next.elements[op.element.id]=structuredClone(op.element);break;
      case 'update':if(!next.elements[op.id])throw new Error(`Element not found: ${op.id}`);next.elements[op.id]={...mergeFields(next.elements[op.id],op.changes),id:op.id};break;
      case 'remove':delete next.elements[op.id];for(const [id,t] of Object.entries(next.transitions))if(t.fromId===op.id||t.toId===op.id)delete next.transitions[id];break;
      case 'asset':{const existing=next.assets[op.asset.id];if(existing&&existing.hash&&existing.hash!==op.asset.hash)throw new Error('Asset identity cannot change');next.assets[op.asset.id]=structuredClone(op.asset);break;}
      case 'transition':next.transitions[op.transition.id]=structuredClone(op.transition);break;
      case 'removeTransition':delete next.transitions[op.id];break;
      case 'variant':next.presetVariants[op.id]={name:op.name,preset:structuredClone(op.preset)};break;
      case 'buses':next.buses=structuredClone(op.buses);next.masterGainDb=op.masterGainDb;break;
      default:throw new Error('Unsupported composition operation');
    }
  }
  for(const op of operations){const id=op.type==='add'?op.element.id:op.type==='update'?op.id:null;if(id&&next.elements[id]?.colorGrade!=null)next.elements[id].colorGrade=normalizeColorGrade(next.elements[id].colorGrade);}
  validateComposition(next);return next;
}
