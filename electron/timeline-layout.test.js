const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),path=require('node:path');
const source=require('../frontend/node_modules/esbuild').buildSync({entryPoints:[path.join(__dirname,'../frontend/src/composition/timelineLayout.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles[0].text;
const sandbox={module:{exports:{}}};vm.runInNewContext(source,sandbox);const {timelineLanes,fadeDuration,timeAtElapsed,fadeGain,fadeEnvelopePoints}=sandbox.module.exports;
test('overlapping clips get separate lanes; adjacent clips and disjoint spans share space',()=>{
 const a={id:'a',order:0,startUs:0,endUs:5,activeSpans:[{startUs:0,endUs:2},{startUs:4,endUs:5}]},b={id:'b',order:1,startUs:2,endUs:4},c={id:'c',order:2,startUs:1,endUs:3};
 const lanes=timelineLanes([a,b,c]);assert.equal(lanes.count,2);assert.equal(lanes.byId.a,lanes.byId.b);assert.notEqual(lanes.byId.c,lanes.byId.a);
});
test('fade drawing includes exact short fade endpoints on long clips',()=>{
 const points=fadeEnvelopePoints(0,200e6,200e6,100000,250000);
 assert.ok(points.some(p=>Math.abs(p.x-.05)<1e-9&&p.y===1));
 assert.ok(points.some(p=>Math.abs(p.x-99.875)<1e-9&&p.y===1));
 assert.equal(points[0].y,97);assert.equal(points.at(-1).y,97);
 const cropped=fadeEnvelopePoints(50e6,10e6,200e6,100000,250000);assert.equal(cropped.length,2);assert.equal(cropped[0].y,1);assert.equal(cropped[1].y,1);
});
test('fade handles move in opposite directions, clamp and map through kept spans',()=>{
 assert.equal(fadeDuration(200000,500000,'fadeIn',1000000),700000);assert.equal(fadeDuration(200000,-500000,'fadeOut',1000000),700000);
 assert.equal(fadeDuration(200000,500000,'fadeOut',1000000),0);assert.equal(fadeDuration(200000,5000000,'fadeIn',1000000),1000000);
 const spans=[{startUs:10,endUs:20,elapsedUs:0},{startUs:30,endUs:40,elapsedUs:10}];assert.equal(timeAtElapsed(spans,15),35);assert.equal(timeAtElapsed(spans,10),30);
 assert.equal(fadeGain(50,100,100,0),.5);assert.equal(fadeGain(50,100,0,100),.5);assert.equal(fadeGain(50,100,100,100),.25);
});
