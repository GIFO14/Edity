import schema from '../../../shared/project-v2-schema.json';
import {validateSchema} from './schemaValidation';
import {validateComposition} from './validation';
import type {ProjectFile} from '../types/project';
export function validateProject(document:ProjectFile){
  validateSchema(document,schema);validateComposition(document.composition!);
  const wordIds=new Set<string>(),clipIds=new Set((document.clips||[]).map(c=>c.id));
  if(clipIds.size!==document.clips?.length)throw new Error('Duplicate clip ID');
  for(const id of Object.keys(document.composition?.sourceGrades||{}))if(!clipIds.has(id)&&!['video','image'].includes(document.composition?.assets[id]?.kind||''))throw new Error('Unknown grading source');
  for(const word of document.words){if(wordIds.has(word.id!))throw new Error('Duplicate word ID');wordIds.add(word.id!);if(word.end<word.start)throw new Error('Reversed word interval');if(word.clipId&&!clipIds.has(word.clipId))throw new Error('Unknown word clip');}
  for(const range of document.deletedRanges)if(range.wordIndices.some(i=>!Number.isSafeInteger(i)||i<0||i>=document.words.length))throw new Error('Unknown deleted word index');
}
