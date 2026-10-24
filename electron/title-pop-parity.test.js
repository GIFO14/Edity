const test=require('node:test');
const assert=require('node:assert/strict');
const {animate,presetInstance,validatePreset,defaultTransform}=require('../shared/composition-runtime.cjs');

test('Editable pop reproduces the native title entry sampled at 30 fps',()=>{
  // The reference title's native effect contains scale .6, .9, .8 at frames
  // 0, 2, 4 at 60 fps (0, 1, 2 after Resolve converts it to 30 fps).
  const preset={...presetInstance('pop-in'),params:{duration:2/30,from:.6/.8,overshoot:.9/.8-1,peak:.5}};
  validatePreset(preset);
  for(const [frame,expected] of [[0,.75],[1,1.125],[2,1],[15,1],[59,1]]){
    const layer={transform:defaultTransform()};
    animate(layer,preset,frame/30,2-frame/30);
    assert.ok(Math.abs(layer.transform.scaleX-expected)<1e-10);
    assert.equal(layer.transform.scaleY,layer.transform.scaleX);
    assert.equal(layer.transform.opacity,1);
  }
});

test('Pop timing and rebound remain configurable for other titles',()=>{
  const preset={...presetInstance('pop-in'),params:{duration:1,from:.2,overshoot:.4,peak:.25}};
  validatePreset(preset);
  for(const [time,expected] of [[0,.2],[.125,.8],[.25,1.4],[.625,1.2],[1,1]]){
    const layer={transform:{...defaultTransform(),scaleX:2,scaleY:.5}};
    animate(layer,preset,time,3-time);
    assert.ok(Math.abs(layer.transform.scaleX-expected*2)<1e-10);
    assert.ok(Math.abs(layer.transform.scaleY-expected*.5)<1e-10);
  }
  for(const peak of [0,1])assert.throws(()=>validatePreset({...preset,params:{...preset.params,peak}}));
});
