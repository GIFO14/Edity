const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const r=require('../shared/composition-runtime.cjs');
test('source grading follows recording cuts and base zooms, overrides and neutral bypass are explicit',()=>{
 const d=structuredClone(require('../tests/fixtures/composition/validation.json')[0].document),asset={id:'v',kind:'video',path:'v.mp4',hash:'v',name:'v',durationUs:2e6,width:160,height:90,hasAudio:false,hasAlpha:false,status:'ready'};d.assets.v=asset;
 const base={id:'base',kind:'base',assetId:'v',trackId:'base',order:0,label:'Base',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:r.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold'};d.elements={base,zoom:{...base,id:'zoom',trackId:'visual',order:1}};
 const grade={...r.defaultColorGrade(),temperature:.3,tint:-.2,rolloff:.4};d.sourceGrades={first:grade};
 const m={id:'m',inputRevision:'m',durationUs:2e6,keepSegments:[{start:0,end:2}],segments:[{clipId:'first',sourceStartUs:0,sourceEndUs:1e6,globalSourceStartUs:0,editStartUs:0,editEndUs:1e6,joinInUs:0,joinOutUs:0},{clipId:'second',sourceStartUs:0,sourceEndUs:1e6,globalSourceStartUs:1e6,editStartUs:1e6,editEndUs:2e6,joinInUs:0,joinOutUs:0}]};
 const p=r.compileComposition(d,m);assert.ok(r.evaluateFrame(p,500000).every(l=>l.colorGrade.temperature===.3));assert.ok(r.evaluateFrame(p,1500000).every(l=>!l.colorGrade));
 d.elements.zoom.colorGrade={...r.defaultColorGrade(),enabled:false};assert.equal(r.isColorGraded(r.evaluateFrame(r.compileComposition(d,m),500000).find(l=>l.id==='zoom').colorGrade),false);
 const partial=r.applyOperations(d,[{type:'sourceGrade',sourceId:'first',grade:{exposure:.2,mask:{shape:'rectangle'}}}]).sourceGrades.first;assert.equal(partial.mask.width,.5);assert.equal(partial.contrast,1);
 assert.equal(r.isColorGraded(r.defaultColorGrade()),false);assert.equal(r.isColorGraded(grade),true);
 assert.throws(()=>r.applyOperations(d,[{type:'sourceGrade',sourceId:'first',grade:{exposure:6}}]),/Invalid/);
 assert.equal(r.applyOperations(d,[{type:'sourceGrade',sourceId:'first',grade:null}]).sourceGrades.first,undefined);
});
test('grading is durable, revision checked, undoable and validates its source reference',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-grade-'));t.after(()=>{assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-grade-')));fs.rmSync(root,{recursive:true,force:true});});
 const {createProjectStore}=require('./project-store'),{ProjectRepository}=require('./project-repository'),store=createProjectStore(path.join(root,'projects')),created=await store.create(path.join(__dirname,'../tests/fixtures/composition/base.mp4'),{words:[],segments:[],deletedRanges:[]}),repo=new ProjectRepository(store),d=repo.getDocument(created.id),id=d.clips[0].id;
 const tx={id:'grade',projectId:d.id,baseRevision:d.revision,actor:'manual',label:'Grade',operations:[{type:'sourceGrade',sourceId:id,grade:{...r.defaultColorGrade(),exposure:.3}}]};repo.commit(tx);
 const fresh=new ProjectRepository(store);assert.equal(fresh.getDocument(d.id).composition.sourceGrades[id].exposure,.3);fresh.history(d.id,'undo');assert.equal(fresh.getDocument(d.id).composition.sourceGrades?.[id],undefined);fresh.history(d.id,'redo');assert.equal(fresh.getDocument(d.id).composition.sourceGrades[id].exposure,.3);
 const current=fresh.getDocument(d.id);assert.throws(()=>fresh.commit({...tx,id:'unknown',baseRevision:current.revision,operations:[{type:'sourceGrade',sourceId:'unknown',grade:r.defaultColorGrade()}]}),/Unknown grading/);
});
