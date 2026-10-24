const test=require('node:test');
const assert=require('node:assert/strict');
const {mediaCapabilities}=require('./media-capabilities');
const {emptyComposition,presetInstance}=require('../shared/composition-runtime.cjs');

test('AI sees customized saved variants, project overrides and actual fonts without mutating them',()=>{
  const document={composition:emptyComposition()};
  const saved={name:'Entrada ràpida',preset:{...presetInstance('pop-in'),params:{duration:.14,from:.4,overshoot:.3,peak:.6}}};
  const local={name:'Entrada local',preset:{...saved.preset,params:{...saved.preset.params,duration:.3}}};
  document.composition.presetVariants.custom=local;
  document.composition.assets.font={id:'font',kind:'font',fontFamily:'Imported font',status:'ready'};
  const library={variants:{custom:saved,other:saved,stale:{name:'Old',preset:{presetId:'removed',params:{},presetVersion:1}}}};
  const capabilities=mediaCapabilities(document,{library,fontFamilies:['Arial','Montserrat Black','Arial']});
  assert.deepEqual(capabilities.presetVariants.custom,{id:'custom',...local,scope:'project'});
  assert.deepEqual(capabilities.presetVariants.other,{id:'other',...saved,scope:'saved'});
  assert.equal(capabilities.presetVariants.stale,undefined);
  assert.ok(capabilities.fontFamilies.includes('Montserrat Black'));
  assert.ok(capabilities.fontFamilies.includes('Imported font'));
  assert.equal(capabilities.fontFamilies.filter(f=>f==='Arial').length,1);
  capabilities.presetVariants.other.preset.params.duration=1;
  assert.equal(saved.preset.params.duration,.14);
});
