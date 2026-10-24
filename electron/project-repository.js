const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { applyOperations, validateComposition,validateProject,validateNarration,reconcileNarration } = require('../shared/composition-runtime.cjs');
const { migrateProject } = require('./composition-migration');
const { PROJECT_NAME } = require('./project-migration');
const {captureSpeechMembers}=require('./speech-membership');
const clone=value=>value===undefined?undefined:structuredClone(value);
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const safeKey=key=>!['__proto__','constructor','prototype'].includes(key);
function diff(before,after,prefix=[]) {
  if(equal(before,after))return [];
  if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].flatMap(key=>{if(!safeKey(key))throw new Error('Invalid document key');return diff(before[key],after[key],[...prefix,key]);});
  return [{path:prefix,before:clone(before),after:clone(after)}];
}
function valueAt(doc,keys){return keys.reduce((value,key)=>value?.[key],doc);}
function patch(doc,change) {let parent=doc;for(const key of change.path.slice(0,-1)){if(!safeKey(key))throw new Error('Invalid patch path');if(!parent[key])parent[key]={};parent=parent[key];}const key=change.path.at(-1);if(!safeKey(key))throw new Error('Invalid patch path');if(change.after===undefined)delete parent[key];else parent[key]=clone(change.after);}
class ProjectRepository extends EventEmitter {
  constructor(store){super();this.store=store;this.states=new Map();}
  directory(id){if(!/^[a-z0-9_-]{1,100}$/i.test(id))throw new Error('Invalid project ID');return path.join(this.store.root,id);}
  load(id){
    if(this.states.has(id))return this.states.get(id);
    const directory=this.directory(id),original=this.store.open(id);let document=migrateProject(original,directory);
    const journal=path.join(directory,'history.jsonl');let entries=[],checkpoint=null;
    if(fs.existsSync(journal)){const bytes=fs.readFileSync(journal);let offset=0,valid=0;
      while(offset<bytes.length){const end=bytes.indexOf(10,offset);if(end<0)break;const line=bytes.subarray(offset,end).toString('utf8');offset=end+1;
        try{if(line){const entry=JSON.parse(line);if(entry.checkpoint)checkpoint=entry;else{if(entry.revision>document.revision){for(const change of entry.patches)patch(document,change);document.revision=entry.revision;}entries.push(entry);}}valid=offset;}catch{break;}}
      if(valid<bytes.length)fs.truncateSync(journal,valid);
    }
    const state={document,entries,originalVersion:original.version,minimumRevision:checkpoint?.minimumRevision||0,undo:checkpoint?.undo||[],redo:checkpoint?.redo||[],dedup:new Map([...(checkpoint?.dedup||[]),...entries.map(e=>[e.transactionId,e.revision])])};
    for(const entry of entries){
      if(entry.historyAction){const source=entry.historyAction==='undo'?state.undo:state.redo,target=entry.historyAction==='undo'?state.redo:state.undo;const members=new Set(entry.historyMembers||[]);const moved=source.filter(item=>members.has(item.transactionId));for(let i=source.length-1;i>=0;i--)if(members.has(source[i].transactionId))source.splice(i,1);target.push(...moved);}
      else if(!entry.skipHistory){state.undo.push(entry);state.redo=[];}
    }
    state.undo=state.undo.filter(Boolean);state.redo=state.redo.filter(Boolean);
    this.states.set(id,state);return state;
  }
  getDocument(id){return clone(this.load(id).document);}
  persist(id,state,entry){
    const directory=this.directory(id),file=path.join(directory,PROJECT_NAME);
    if(state.originalVersion===1&&!fs.existsSync(`${file}.v1-backup`))fs.copyFileSync(file,`${file}.v1-backup`);
    const journal=path.join(directory,'history.jsonl');
    const fd=fs.openSync(journal,'a');try{fs.writeSync(fd,`${JSON.stringify(entry)}\n`);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    const temporary=`${file}.${randomUUID()}.tmp`;const snapshot=fs.openSync(temporary,'wx');try{fs.writeSync(snapshot,JSON.stringify(state.document,null,2));fs.fsyncSync(snapshot);}finally{fs.closeSync(snapshot);}
    fs.renameSync(temporary,file);state.originalVersion=2;
  }
  compact(id,state){
    if(state.entries.length<=400)return;
    const keep=state.entries.slice(-200),minimumRevision=keep[0].revision-1;
    const undo=state.undo.filter(e=>e.revision<=minimumRevision).slice(-200),redo=state.redo.filter(e=>e.revision<=minimumRevision).slice(-200);
    const dedup=[...state.dedup].slice(-10000),journal=path.join(this.directory(id),'history.jsonl'),temporary=`${journal}.${randomUUID()}.tmp`;
    const fd=fs.openSync(temporary,'wx');try{fs.writeSync(fd,[JSON.stringify({checkpoint:true,minimumRevision,undo,redo,dedup}),...keep.map(e=>JSON.stringify(e))].join('\n')+'\n');fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
    fs.renameSync(temporary,journal);state.minimumRevision=minimumRevision;state.entries=keep;state.undo=state.undo.slice(-400);state.redo=state.redo.slice(-400);state.dedup=new Map(dedup);
  }
  commit(transaction){
    const {projectId:id,baseRevision,operations}=transaction,state=this.load(id),current=state.document;
    if(state.dedup.has(transaction.id))return {revision:state.dedup.get(transaction.id),document:clone(current),duplicate:true};
    if(!Number.isSafeInteger(baseRevision)||baseRevision<0||baseRevision>current.revision)throw new Error('Invalid base revision');
    if(baseRevision<state.minimumRevision){const error=new Error('This revision is outside the rebase window; reload the project');error.code='REVISION_CONFLICT';throw error;}
    if(!transaction.id||!['manual','ai','migration'].includes(transaction.actor)||!Array.isArray(operations))throw new Error('Invalid transaction');
    let baseline=clone(current);
    for(const entry of [...state.entries].reverse().filter(e=>e.revision>baseRevision))for(const change of [...entry.patches].reverse())patch(baseline,{...change,after:change.before});
    const desired=clone(baseline);desired.composition=applyOperations(desired.composition,operations);
    captureSpeechMembers(desired.composition,baseline.words,baseline.composition,operations);
    if(transaction.documentChanges){const allowed=['title','sourceVideoPath','words','segments','deletedRanges','soundEvents','mediaItems','chatMessages','language','clips','mediaFolders','studioSoundEnabled','aiSettings','instructionProfile','processing','videoPath','playhead','narration'];for(const [key,value] of Object.entries(transaction.documentChanges)){if(!allowed.includes(key))throw new Error(`Unsupported document field: ${key}`);desired[key]=clone(value);}}
    if(transaction.documentChanges?.clips&&desired.composition.sourceGrades){const kept=new Set(desired.clips.map(c=>c.id));for(const clip of baseline.clips||[])if(!kept.has(clip.id))delete desired.composition.sourceGrades[clip.id];}
    if(desired.narration){if(transaction.documentChanges?.clips)desired.narration=reconcileNarration(desired,desired.narration);else validateNarration(desired,desired.narration);}
    const changes=diff(baseline,desired).filter(c=>!['revision','modifiedAt'].includes(c.path[0]));
    const conflicts=changes.filter(c=>!equal(valueAt(current,c.path),c.before)&&!equal(valueAt(current,c.path),c.after));
    if(conflicts.length){const error=new Error('Project changed in the same fields; reload and retry this edit');error.code='REVISION_CONFLICT';error.paths=conflicts.map(c=>c.path);throw error;}
    const updated=clone(current);for(const change of changes)patch(updated,change);validateComposition(updated.composition);
    for(const asset of Object.values(updated.composition.assets)){
      const previous=current.composition.assets[asset.id];if(previous?.path===asset.path)continue;
      const resolved=path.resolve(this.directory(id),asset.path),relative=path.relative(this.directory(id),resolved);
      if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Import this asset into the project before referencing it');
      if(!fs.existsSync(resolved))throw new Error(`Asset not found: ${asset.name}`);
    }
    if(changes.some(c=>['words','deletedRanges','clips','soundEvents','narration'].includes(c.path[0])))updated.transcriptRevision=(current.transcriptRevision||0)+1;
    updated.revision=current.revision+1;updated.modifiedAt=new Date().toISOString();
    validateProject(updated);
    const patches=diff(current,updated).filter(c=>c.path[0]!=='revision');
    const entry={revision:updated.revision,transactionId:transaction.id,actor:transaction.actor,label:transaction.label||'Edit',groupId:transaction.groupId||transaction.id,patches,historyAction:transaction.historyAction,skipHistory:transaction.skipHistory};
    const previous=state.document;state.document=updated;
    try{this.persist(id,state,entry);}catch(error){state.document=previous;this.states.delete(id);throw error;}
    state.entries.push(entry);state.dedup.set(transaction.id,updated.revision);
    if(!transaction.historyAction&&!transaction.skipHistory){state.undo.push(entry);state.redo=[];}
    this.compact(id,state);
    const ack={revision:updated.revision,document:clone(updated),duplicate:false};this.emit('commit',id,ack);return ack;
  }
  history(id,direction,{transactionId}={}){
    const state=this.load(id);
    if(transactionId&&state.dedup.has(transactionId))return {revision:state.dedup.get(transactionId),document:clone(state.document),duplicate:true};
    const stack=direction==='undo'?state.undo:state.redo;if(!stack.length)return {revision:state.document.revision,document:clone(state.document)};
    const last=stack.at(-1),members=stack.filter(entry=>entry.groupId===last.groupId),group=direction==='undo'?[...members].reverse():members;
    for(let i=stack.length-1;i>=0;i--)if(stack[i].groupId===last.groupId)stack.splice(i,1);
    const desired=clone(state.document);
    for(const entry of group)for(const change of direction==='undo'?[...entry.patches].reverse():entry.patches){const expected=direction==='undo'?change.after:change.before,target=direction==='undo'?change.before:change.after;if(equal(valueAt(desired,change.path),expected))patch(desired,{...change,after:target});}
    const docChanges={};for(const key of Object.keys(desired))if(!['id','version','revision','modifiedAt','createdAt','composition','transcriptRevision'].includes(key)&&!equal(desired[key],state.document[key]))docChanges[key]=desired[key];
    const original=state.document;
    // The same persistence path publishes history changes; compose exact leaf patches first.
    const updated=clone(desired);updated.revision=original.revision+1;updated.modifiedAt=new Date().toISOString();updated.transcriptRevision=(original.transcriptRevision||0)+(Object.keys(docChanges).some(k=>['words','deletedRanges','clips','soundEvents','narration'].includes(k))?1:0);validateComposition(updated.composition);if(updated.narration)validateNarration(updated,updated.narration);
    const entry={revision:updated.revision,transactionId:transactionId||randomUUID(),actor:'manual',label:`${direction}: ${last.label}`,groupId:randomUUID(),patches:diff(original,updated).filter(c=>c.path[0]!=='revision'),historyAction:direction,historyMembers:group.map(e=>e.transactionId)};
    state.document=updated;try{this.persist(id,state,entry);}catch(error){state.document=original;stack.push(...members);stack.sort((a,b)=>a.revision-b.revision);throw error;}
    state.entries.push(entry);state.dedup.set(entry.transactionId,entry.revision);(direction==='undo'?state.redo:state.undo).push(...members);
    const ack={revision:updated.revision,document:clone(updated)};this.emit('commit',id,ack);return ack;
  }
  forget(id){this.states.delete(id);}
}
module.exports={ProjectRepository,diff,patch};
