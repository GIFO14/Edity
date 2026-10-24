const test=require('node:test'),assert=require('node:assert/strict');
const {speechDuckingEnvelope:envelope}=require('../frontend/node_modules/esbuild').buildSync({entryPoints:[require('node:path').join(__dirname,'../frontend/src/composition/speechDucking.ts')],bundle:true,platform:'node',format:'cjs',write:false}).outputFiles.reduce((m,file)=>{const output={exports:{}};new Function('module','exports',file.text)(output,output.exports);return output.exports;},{});
const manifest={durationUs:12000000,segments:[{globalSourceStartUs:0,editStartUs:0,editEndUs:12000000}]};
const word=(start,end)=>({word:'speech',start,end});
function gainAt(points,timeUs){let a={timeUs:0,gain:1};for(const b of points){if(timeUs<b.timeUs)return a.gain+(b.gain-a.gain)*(timeUs-a.timeUs)/(b.timeUs-a.timeUs);a=b;}return a.gain;}
test('breaths and sentence pauses do not pump the music level',()=>{
 const points=envelope(manifest,[word(0,.5),word(.85,1.3),word(2,2.5),word(3.9,4.5)]);
 for(let time=0;time<=4500000;time+=10000)assert.equal(gainAt(points,time),.25);
});
test('long pauses restore volume gradually after the hold',()=>{
 const points=envelope(manifest,[word(1,2),word(6,7)]);
 assert.equal(gainAt(points,2300000),.25);assert.equal(gainAt(points,2950000),.625);assert.equal(gainAt(points,3500000),1);assert.equal(gainAt(points,6000000),.25);
 for(let i=1;i<points.length;i++)assert.ok(points[i].timeUs>points[i-1].timeUs);
});
test('removed source gaps cannot add a music swell at a cut',()=>{
 const cuts={durationUs:2000000,segments:[{globalSourceStartUs:0,editStartUs:0,editEndUs:1000000},{globalSourceStartUs:10000000,editStartUs:1000000,editEndUs:2000000}]};
 const points=envelope(cuts,[word(0,1),word(10,11)]);
 for(let time=0;time<=2000000;time+=10000)assert.equal(gainAt(points,time),.25);
});
test('muted voice and absent speech leave music at its selected gain',()=>{
 assert.deepEqual(envelope(manifest,[word(1,2)],true),[{timeUs:0,gain:1}]);assert.deepEqual(envelope(manifest,[]),[{timeUs:0,gain:1}]);
});
test('truncated final release has no jump to full volume at project end',()=>{
 const points=envelope({...manifest,durationUs:3000000},[word(1,2)]);
 assert.ok(Math.abs(gainAt(points,3000000)-(.25+.75*.5/.9))<1e-9);
 assert.equal(envelope({...manifest,durationUs:2200000},[word(1,2)]).at(-1).gain,.25);
});
