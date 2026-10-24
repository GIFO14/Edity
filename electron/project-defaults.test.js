const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {ProjectDefaults}=require('./project-defaults');
test('manual and external import options inherit durable global instructions, fillers and processing selections',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-defaults-'));try{
    const defaults=new ProjectDefaults(root);assert.equal(defaults.read().initialized,false);
    const saved=defaults.initialize({processing:{preset:'custom',customMargin:.08,engine:'whisperx',model:'tiny',language:'en'},aiSettings:{editingInstructions:'Conserva la presa final.',mediaInstructions:'Segueix la parla.',customFillerWords:'uh, um'}});
    assert.equal(saved.initialized,true);const manual=defaults.options({}),external=defaults.options({aiSettings:{}});assert.deepEqual(manual,external);assert.equal(external.aiSettings.editingInstructions,'Conserva la presa final.');assert.equal(external.preset,'custom');assert.equal(external.language,'en');
    assert.deepEqual(new ProjectDefaults(root).options({}),external);
    assert.equal(defaults.initialize({aiSettings:{editingInstructions:'A project override must not become global.'}}).aiSettings.editingInstructions,'Conserva la presa final.');
    defaults.update({aiSettings:{editingInstructions:''}});assert.equal(defaults.options({}).aiSettings.editingInstructions,'');assert.throws(()=>defaults.update({processing:{engine:'whisperx',model:'turbo'}}),/Invalid/);assert.equal(defaults.read().processing.model,'tiny');
  }finally{assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-defaults-')));fs.rmSync(root,{recursive:true,force:true});}
});
test('an isolated session copies seeded desktop defaults without altering the seed',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'edity-defaults-'));try{
    const source=new ProjectDefaults(path.join(root,'source'));source.initialize({processing:{language:'en'},aiSettings:{editingInstructions:'Shared instructions'}});const before=fs.readFileSync(source.file);
    const copied=new ProjectDefaults(path.join(root,'qa'),{inheritFile:source.file});assert.equal(copied.read().initialized,true);copied.update({aiSettings:{editingInstructions:'QA only'}});assert.deepEqual(fs.readFileSync(source.file),before);
  }finally{assert.ok(path.resolve(root).startsWith(path.join(os.tmpdir(),'edity-defaults-')));fs.rmSync(root,{recursive:true,force:true});}
});
