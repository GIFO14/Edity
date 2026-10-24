const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const {buildSync}=require('../frontend/node_modules/esbuild');
const source=buildSync({stdin:{contents:`export * from './composition/timelineDrag';export {resolvePlacement} from './composition/timeMap';`,resolveDir:path.resolve(__dirname,'../frontend/src')},bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}}};vm.runInNewContext(source,sandbox);const {dragRange,dragElement,resolvePlacement}=sandbox.module.exports;
const plain=x=>JSON.parse(JSON.stringify(x));
test('moving against either timeline edge preserves the complete duration',()=>{
  const d={start:2e6,end:4e6,duration:10e6,mode:'move'};
  assert.deepEqual(plain(dragRange(d,-9e6,33333,[],0)),{start:0,end:2e6,snapped:null});
  assert.deepEqual(plain(dragRange(d,12e6,33333,[],0)),{start:8e6,end:10e6,snapped:null});
});
test('trim cannot invert a clip; crossing its opposite edge clamps and remains reversible',()=>{
  const d={start:2e6,end:4e6,duration:10e6,mode:'start'};
  assert.equal(dragRange(d,5e6,33333,[],0).start,3966667);
  assert.equal(dragRange(d,-.25e6,33333,[],0).start,1750000);
  assert.equal(dragRange({...d,mode:'end'},-5e6,33333,[],0).end,2033333);
});
test('snap selects the closest valid edge, bypass is exact, movement snaps without shrinking',()=>{
  const d={start:2e6,end:4e6,duration:10e6,mode:'end'};
  assert.equal(dragRange(d,995000,33333,[5e6],10000).end,5e6);
  assert.equal(dragRange(d,995000,33333,[],10000).end,4995000);
  const moved=dragRange({...d,mode:'move'},995000,33333,[5e6],10000);
  assert.equal(moved.start,3e6);assert.equal(moved.end,5e6);
});
test('manual speech resize stays exact across cuts and later acoustic timing updates',()=>{
  const manifest={durationUs:10e6,removedWordIds:[],segments:[{clipId:'c',globalSourceStartUs:0,sourceStartUs:0,sourceEndUs:3e6,editStartUs:0,editEndUs:3e6},{clipId:'c',globalSourceStartUs:7e6,sourceStartUs:7e6,sourceEndUs:14e6,editStartUs:3e6,editEndUs:10e6}],wordTimings:{a:{startUs:2100000,endUs:2700000}}};
  const words=[{id:'a',clipId:'c',start:2,end:2.8},{id:'b',clipId:'c',start:7.1,end:7.8},{id:'c',clipId:'c',start:8,end:8.8}];
  const original={id:'video',kind:'video',sourceInUs:1e6,placement:{kind:'speech',startWordId:'a',endWordId:'b',memberWordIds:['a','b'],timingBasis:'acoustic',endAtCutUs:150000,startOffsetUs:0,endOffsetUs:0,fallback:{clipId:'c',startUs:2e6,endUs:7.8e6}}};
  const changed=dragElement(original,2.1e6,3.8e6,2.25e6,4.65e6,'start',manifest,words);
  assert.equal(changed.placement.kind,'speech');assert.equal(changed.placement.timingBasis,'transcript');
  assert.equal(changed.sourceInUs,1.15e6);assert.equal(changed.placement.endAtCutUs,undefined);
  assert.deepEqual(plain(resolvePlacement(changed.placement,manifest,words)),{startUs:2250000,endUs:4650000});
  assert.deepEqual(plain(resolvePlacement(changed.placement,{...manifest,wordTimings:{a:{startUs:1800000,endUs:2990000},c:{startUs:8250000,endUs:8950000}}},words)),{startUs:2250000,endUs:4650000});
});
