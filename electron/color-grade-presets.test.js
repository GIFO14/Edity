const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {EditingLibrary}=require('./editing-library'),{listColorPresets,saveColorPreset,colorPresetOperation}=require('./color-grade-presets'),r=require('../shared/composition-runtime.cjs');
function fixture(t){const directory=fs.mkdtempSync(path.join(os.tmpdir(),'edity-color-presets-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));return {directory,library:new EditingLibrary(directory)};}
test('library reads old profiles/variants and persists complete color settings across restart',t=>{
 const {directory,library}=fixture(t),profile={id:'p',name:'Old profile',text:'a',mediaText:'b'},variant={id:'v',name:'Old effect',preset:r.presetInstance('zoom')};fs.writeFileSync(library.file,JSON.stringify({profiles:{p:profile},variants:{v:variant}}));
 const grade={...r.defaultColorGrade(),exposure:.45,temperature:.1,tint:-.8,contrast:1.15,saturation:1.02,shadows:-.025,midtones:.04,highlights:-.05,rolloff:.12,mask:{shape:'ellipse',x:.4,y:.6,width:.7,height:.8,feather:.2,invert:true}};
 const saved=library.save('colorGrades',{name:'My recording',grade});grade.mask.x=.9;
 assert.equal(saved.grade.mask.x,.4);const reopened=new EditingLibrary(directory),data=reopened.read();assert.deepEqual(data.profiles.p,profile);assert.deepEqual(data.variants.v,variant);assert.deepEqual(listColorPresets(reopened)[0].grade,saved.grade);
});
test('invalid grades and stale library updates cannot overwrite a good preset',t=>{
 const {library}=fixture(t),saved=library.save('colorGrades',{name:'Good',grade:{exposure:.3}}),before=fs.readFileSync(library.file,'utf8');
 for(const grade of [{exposure:6},{tint:NaN},{saturation:-1},{mask:{shape:'unknown'}},{extra:'field'}])assert.throws(()=>library.save('colorGrades',{name:'Invalid',grade}));
 assert.throws(()=>library.save('colorGrades',{name:'good',grade:{}}),/already exists/);assert.throws(()=>library.save('colorGrades',{id:saved.id,name:saved.name,grade:{exposure:.8},expectedRevision:0}),/changed/);assert.equal(fs.readFileSync(library.file,'utf8'),before);
 const next=library.save('colorGrades',{id:saved.id,name:'Good updated',grade:{exposure:.8},expectedRevision:1});assert.equal(next.revision,2);assert.equal(next.createdAt,saved.createdAt);
});
test('save retry is idempotent and applying copies independent source/layer snapshots',t=>{
 const {library}=fixture(t),params={name:'Reusable',grade:{exposure:.6}},first=saveColorPreset(library,params,'request-1'),second=saveColorPreset(library,params,'request-1');assert.equal(first.id,second.id);assert.equal(second.revision,1);
 const doc={clips:[{id:'clip'}],composition:{...r.emptyComposition(),elements:{base:{kind:'base'},caption:{kind:'text'}},assets:{image:{kind:'image'},audio:{kind:'audio'}}}};
 const a=colorPresetOperation(library,doc,{presetId:first.id,sourceId:'clip'}),b=colorPresetOperation(library,doc,{presetId:first.id,elementId:'base'});assert.equal(a.operation.type,'sourceGrade');assert.equal(b.operation.changes.colorGrade.exposure,.6);a.operation.grade.exposure=2;assert.equal(listColorPresets(library)[0].grade.exposure,.6);
 assert.throws(()=>colorPresetOperation(library,doc,{presetId:first.id,sourceId:'clip',elementId:'base'}),/exactly one/);assert.throws(()=>colorPresetOperation(library,doc,{presetId:first.id,sourceId:'audio'}),/recording/);assert.throws(()=>colorPresetOperation(library,doc,{presetId:first.id,elementId:'caption'}),/layer/);
 library.save('colorGrades',{id:first.id,name:first.name,grade:{exposure:1},expectedRevision:1});assert.equal(b.operation.changes.colorGrade.exposure,.6);assert.throws(()=>colorPresetOperation(library,doc,{presetId:first.id,sourceId:'clip',expectedPresetRevision:1}),/changed/);
});
test('a corrupt library is reported and never silently replaced',t=>{
 const {library}=fixture(t);fs.writeFileSync(library.file,'broken-json');assert.throws(()=>library.save('colorGrades',{name:'New',grade:{}}),/read/);assert.equal(fs.readFileSync(library.file,'utf8'),'broken-json');
});
