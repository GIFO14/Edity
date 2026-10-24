const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const os=require('node:os');
const {createProjectStore}=require('./project-store');const {ProjectRepository}=require('./project-repository');
const runtime=require('../shared/composition-runtime.cjs');
async function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-repository-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const video=path.join(root,'source.mp4');fs.copyFileSync(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),video);const store=createProjectStore(path.join(root,'projects'));const project=await store.create(video,{words:[{word:'hello',start:0,end:1,confidence:1}],segments:[],deletedRanges:[]});return {root,store,project,repo:new ProjectRepository(store)};}
function text(id){return {id,kind:'text',trackId:'text',order:1,label:id,enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:0,endUs:1000000},transform:runtime.defaultTransform(),text:id,textStyle:runtime.defaultTextStyle(),presets:[],sourceInUs:0,endPolicy:'hold'};}
function tx(project,id,revision,operations,extra={}){return {id,projectId:project.id,baseRevision:revision,actor:'manual',label:id,operations,...extra};}
test('migration is pure, first commit backs up v1, revisions survive reopen and retries do not duplicate',async t=>{
 const {store,project,repo}=await fixture(t),file=path.join(store.root,project.id,'project.edity');const original=fs.readFileSync(file);
 const migrated=repo.getDocument(project.id);assert.equal(migrated.version,2);assert.ok(migrated.words[0].id);assert.deepEqual(fs.readFileSync(file),original);
 const transaction=tx(project,'add',0,[{type:'add',element:text('title')}]);const ack=repo.commit(transaction);assert.equal(ack.revision,1);assert.deepEqual(fs.readFileSync(file+'.v1-backup'),original);
 assert.equal(repo.commit(transaction).duplicate,true);assert.equal(new ProjectRepository(store).getDocument(project.id).revision,1);
});
test('independent fields rebase and the same field conflicts without losing manual changes',async t=>{
 const {project,repo}=await fixture(t);repo.commit(tx(project,'add',0,[{type:'add',element:text('title')}]));
 const before=repo.getDocument(project.id).composition.elements.title;
 repo.commit(tx(project,'move',1,[{type:'update',id:'title',changes:{transform:{...before.transform,x:.2}}}]));
 repo.commit(tx(project,'font',1,[{type:'update',id:'title',changes:{textStyle:{...before.textStyle,fontSize:90}}}],{actor:'ai'}));
 assert.equal(repo.getDocument(project.id).composition.elements.title.transform.x,.2);
 assert.throws(()=>repo.commit(tx(project,'conflict',1,[{type:'update',id:'title',changes:{transform:{...before.transform,x:.8}}}],{actor:'ai'})),/same fields/);
});
test('grouped AI undo preserves interleaved manual edits and redo survives restart',async t=>{
 const {store,project,repo}=await fixture(t);
 repo.commit(tx(project,'ai1',0,[{type:'add',element:text('a')}],{actor:'ai',groupId:'request'}));
 repo.commit(tx(project,'manual',1,[{type:'update',id:'a',changes:{text:'manual'}}]));
 repo.commit(tx(project,'ai2',2,[{type:'add',element:text('b')}],{actor:'ai',groupId:'request'}));
 const undone=repo.history(project.id,'undo');assert.equal(undone.document.composition.elements.a.text,'manual');assert.equal(undone.document.composition.elements.b,undefined);
 const reopened=new ProjectRepository(store);const redone=reopened.history(project.id,'redo');assert.equal(redone.document.composition.elements.a.text,'manual');assert.ok(redone.document.composition.elements.b);assert.ok(redone.revision>undone.revision);
});
test('journal recovers a persisted commit whose snapshot publication was interrupted',async t=>{
 const {store,project,repo}=await fixture(t);repo.commit(tx(project,'one',0,[{type:'add',element:text('title')}]));
 const file=path.join(store.root,project.id,'project.edity'),saved=fs.readFileSync(file);repo.commit(tx(project,'two',1,[{type:'update',id:'title',changes:{text:'new'}}]));fs.writeFileSync(file,saved);
 const recovered=new ProjectRepository(store).getDocument(project.id);assert.equal(recovered.revision,2);assert.equal(recovered.composition.elements.title.text,'new');
});
test('v2 archives, duplication and import retain text, variants, word IDs and relative assets',async t=>{
 const {root,store,project,repo}=await fixture(t);repo.commit(tx(project,'one',0,[{type:'add',element:text('title')},{type:'variant',id:'grow-fast',name:'Grow fast',preset:runtime.presetInstance('grow')}]));
 const copy=await store.duplicate(project.id);assert.equal(copy.version,2);assert.equal(copy.composition.elements.title.text,'title');assert.equal(copy.words[0].id,repo.getDocument(project.id).words[0].id);
 const archive=path.join(root,'export.edity');await store.exportProject(project.id,archive);const imported=await store.importProject(archive);assert.equal(imported.version,2);assert.ok(imported.composition.presetVariants['grow-fast']);assert.equal(imported.composition.assets.baseAsset.path,'video/video.mp4');assert.ok(fs.existsSync(path.join(store.root,imported.id,imported.composition.assets.baseAsset.path)));
});
test('redo replays dependent AI operations in their original order',async t=>{
 const {store,project,repo}=await fixture(t);repo.commit(tx(project,'a1',0,[{type:'add',element:text('title')}],{actor:'ai',groupId:'ai'}));repo.commit(tx(project,'a2',1,[{type:'update',id:'title',changes:{text:'Updated',textStyle:{color:'#ffff00'}}}],{actor:'ai',groupId:'ai'}));
 repo.history(project.id,'undo');const reopened=new ProjectRepository(store);const result=reopened.history(project.id,'redo');assert.equal(result.document.composition.elements.title.text,'Updated');assert.equal(result.document.composition.elements.title.textStyle.color,'#ffff00');assert.equal(result.document.composition.elements.title.textStyle.fontSize,72);
});
test('a truncated journal tail is removed before the next durable commit',async t=>{
 const {store,project,repo}=await fixture(t);repo.commit(tx(project,'one',0,[{type:'add',element:text('title')}]));const journal=path.join(store.root,project.id,'history.jsonl');fs.appendFileSync(journal,'{"revision":2,"broken":');const reopened=new ProjectRepository(store);reopened.commit(tx(project,'two',1,[{type:'update',id:'title',changes:{text:'Recovered'}}]));assert.equal(new ProjectRepository(store).getDocument(project.id).composition.elements.title.text,'Recovered');assert.ok(fs.readFileSync(journal,'utf8').endsWith('\n'));
});
test('compaction retains recoverable history, deduplication and the bounded rebase window',async t=>{
 const {store,project,repo}=await fixture(t);repo.commit(tx(project,'add',0,[{type:'add',element:text('title')}]));for(let n=1;n<415;n++)repo.commit(tx(project,`change-${n}`,n,[{type:'update',id:'title',changes:{text:`Text ${n}`}}]));
 const reopened=new ProjectRepository(store);assert.equal(reopened.getDocument(project.id).revision,415);assert.equal(reopened.commit(tx(project,'add',0,[])).duplicate,true);assert.throws(()=>reopened.commit(tx(project,'old',0,[])),/outside the rebase window/);assert.equal(reopened.history(project.id,'undo').document.composition.elements.title.text,'Text 413');assert.equal(new ProjectRepository(store).history(project.id,'redo').document.composition.elements.title.text,'Text 414');
});
test('pending projects can duplicate and archive all unprocessed recordings',async t=>{
 const {root,store}=await fixture(t);const pending=store.createPending([path.join(root,'source.mp4'),path.join(root,'source.mp4')],{aiSettings:{editingInstructions:'Keep speech',mediaInstructions:'Titles',customFillerWords:''}});const duplicate=await store.duplicate(pending.id);assert.ok(duplicate.processing.sources.every(p=>fs.existsSync(p)&&p.startsWith(store.root)));const archive=path.join(root,'pending.edity');await store.exportProject(pending.id,archive);const imported=await store.importProject(archive);assert.equal(imported.processing.status,'queued');assert.ok(imported.processing.sources.every(p=>fs.existsSync(p)&&p.startsWith(store.root)));assert.equal(imported.aiSettings.mediaInstructions,'Titles');
});
test('explicit history transaction IDs deduplicate undo after restart without undoing another edit',async t=>{
 const {store,project,repo}=await fixture(t);repo.commit(tx(project,'first',0,[{type:'add',element:text('a')}]));repo.commit(tx(project,'second',1,[{type:'add',element:text('b')}]));
 const undone=repo.history(project.id,'undo',{transactionId:'stable-undo'});assert.ok(undone.document.composition.elements.a);assert.equal(undone.document.composition.elements.b,undefined);
 const reopened=new ProjectRepository(store),repeat=reopened.history(project.id,'undo',{transactionId:'stable-undo'});assert.equal(repeat.duplicate,true);assert.equal(repeat.revision,undone.revision);assert.ok(repeat.document.composition.elements.a);
});
