const {test}=require('node:test'),assert=require('node:assert/strict');
const {accelerationOptions,acceleratedExport}=require('./export-acceleration');
const options={format:'mp4',width:1920,height:1080,plan:{document:{canvas:{fps:{num:30,den:1}}}}},resources={cores:16,freeBytes:10*1024**3};
test('1080p60 is eligible while unsupported cadence keeps compatible export',()=>{
 const at=num=>({...options,plan:{document:{canvas:{fps:{num,den:1}}}}});
 assert.deepEqual(accelerationOptions(at(60),resources),accelerationOptions(options,resources));
 assert.equal(accelerationOptions(at(120),resources),null);
});
test('1080p30 acceleration respects memory and explicit legacy choices',()=>{
 assert.deepEqual(accelerationOptions(options,resources),{gpuCodec:true,gpuPacketDecode:true,gpuParallel:6});
 assert.equal(accelerationOptions({...options,capture:true},resources),null);
 assert.equal(accelerationOptions({...options,gpuCodec:false},resources),null);
 assert.equal(accelerationOptions({...options,format:'webm'},resources),null);
 assert.equal(accelerationOptions({...options,width:3840},resources),null);
 assert.equal(accelerationOptions(options,{...resources,freeBytes:2*1024**3}),null);
 assert.equal(accelerationOptions(options,{...resources,freeBytes:4*1024**3}).gpuParallel,2);
});
test('unsupported native encoding retries compatible route once',async()=>{
 const calls=[];const job=acceleratedExport(options,()=>{},o=>{calls.push(o);return{result:calls.length===1?Promise.reject(Error('Unsupported encoder')):Promise.resolve({metrics:{frames:30}}),cancel(){}};});
 const result=await job.result;assert.equal(calls.length,2);assert.equal(calls[1].gpuCodec,false);assert.equal(calls[1].gpuParallel,0);assert.equal(result.metrics.frames,30);assert.match(result.metrics.accelerationFallback,/Unsupported/);
});
test('cancellation never retries or creates a second export',async()=>{
 let reject,calls=0;const job=acceleratedExport(options,()=>{},()=>{calls++;return{result:new Promise((_r,j)=>reject=j),cancel(){reject(Error('Cancelled'));}};});job.cancel();await assert.rejects(job.result,/Cancelled/);assert.equal(calls,1);
});
