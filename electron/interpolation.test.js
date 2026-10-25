const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {ProjectDefaults}=require('./project-defaults'),{ProjectRepository}=require('./project-repository'),{createProjectStore}=require('./project-store');
test('new and inherited import preferences enable interpolation; explicit opt-out is durable',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-fps-'));
 try{const defaults=new ProjectDefaults(root);defaults.initialize({processing:{language:'en'}});assert.equal(defaults.options({}).interpolate60,true);assert.equal(defaults.options({interpolate60:false}).interpolate60,false);defaults.update({processing:{interpolate60:false}});assert.equal(new ProjectDefaults(root).options({}).interpolate60,false);assert.throws(()=>defaults.options({interpolate60:'true'}),/Invalid interpolation/);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('canvas FPS changes are validated revisioned operations with undo and redo',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-fps-'));
 try{const store=createProjectStore(root),p=await store.create(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),{words:[{id:'stable',word:'kept',start:0,end:1}],segments:[],deletedRanges:[]}),repository=new ProjectRepository(store),d=repository.getDocument(p.id);const changed=repository.commit({id:'fps',projectId:p.id,baseRevision:d.revision,actor:'manual',label:'Frame rate',operations:[{type:'canvas',canvas:{...d.composition.canvas,fps:{num:60,den:1}}}]}).document;assert.deepEqual(changed.words,d.words);assert.equal(changed.composition.canvas.fps.num,60);repository.history(p.id,'undo');assert.equal(repository.getDocument(p.id).composition.canvas.fps.num,30);repository.history(p.id,'redo');assert.equal(repository.getDocument(p.id).composition.canvas.fps.num,60);}finally{fs.rmSync(root,{recursive:true,force:true});}
});
