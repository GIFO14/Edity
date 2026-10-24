const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path'),vm=require('node:vm');
const {buildSync}=require('../frontend/node_modules/esbuild');
test('slow persistence keeps each transcript edit and serializes media commits with undo/redo',async()=>{
  const source=buildSync({stdin:{contents:`export * from './lib/projectPersistence';export {useEditorStore} from './store/editorStore';export {useCompositionStore} from './store/compositionStore';`,resolveDir:path.resolve(__dirname,'../frontend/src')},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
  const storage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}},sandbox={module:{exports:{}},console,require,process:{env:{NODE_ENV:"test"}},setTimeout,clearTimeout,structuredClone,crypto:require('node:crypto').webcrypto,localStorage:storage,window:{addEventListener(){},removeEventListener(){},localStorage:storage}};
  vm.runInNewContext(source,sandbox);const p=sandbox.module.exports,editor=p.useEditorStore,composition=p.useCompositionStore;
  const clone=x=>JSON.parse(JSON.stringify(x)),pause=()=>new Promise(r=>setTimeout(r,25));
  let document={...clone(p.getProjectSnapshot()),id:'qa',revision:0,videoPath:null,composition:clone(composition.getState().document)};
  document.composition.elements.title={id:'title',label:'Before'};
  const undo=[],redo=[],saved=[];
  async function apply(changes,revision){await pause();assert.equal(revision,document.revision);undo.push(clone(document));redo.length=0;document={...document,...clone(changes),revision:document.revision+1};return {revision:document.revision,document:clone(document)};}
  async function history(direction){await pause();const from=direction==='undo'?undo:redo,to=direction==='undo'?redo:undo;const old=from.pop();if(old){to.push(clone(document));document={...old,revision:document.revision+1};}return {revision:document.revision,document:clone(document)};}
  sandbox.window.electronAPI={onProjectChanged:()=>()=>{},saveManagedProject:async(id,{revision,changes})=>{saved.push(clone(changes));return apply(changes,revision);},commitProject:async tx=>{const next=clone(document.composition);for(const op of tx.operations)Object.assign(next.elements[op.id],op.changes);return apply({composition:next},tx.baseRevision);},undoProject:()=>history('undo'),redoProject:()=>history('redo')};
  p.setActiveProjectId('qa',document);composition.getState().load('qa',0,document.composition);const detach=p.attachProjectAutosave(()=>{});
  try{
    const first={id:'one',wordIndices:[1]},second={id:'two',wordIndices:[2]};
    editor.setState({deletedRanges:[first]});editor.setState({deletedRanges:[first,second]});
    await p.saveCurrentProject();assert.deepEqual(saved.map(s=>s.deletedRanges),[[first],[first,second]]);
    await p.projectHistory('undo');assert.deepEqual(clone(editor.getState().deletedRanges),[first]);
    await p.projectHistory('redo');assert.equal(editor.getState().deletedRanges.length,2);
    const committed=p.commitComposition([{type:'update',id:'title',changes:{label:'After'}}]);
    const undone=p.projectHistory('undo');await Promise.all([committed,undone]);assert.equal(composition.getState().document.elements.title.label,'Before');
    await p.projectHistory('redo');assert.equal(composition.getState().document.elements.title.label,'After');
    await Promise.all([p.projectHistory('undo'),p.projectHistory('undo')]);assert.deepEqual(clone(editor.getState().deletedRanges),[first]);
  }finally{detach();p.setActiveProjectId(null);}
});
