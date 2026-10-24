const test=require('node:test'),assert=require('node:assert/strict');
const {sourceFrameRate,sourceFrameIndex}=require('./source-frame-time');
test('A 30 fps project retains the distinct source frames of a 60 fps video',()=>{
 const fps=sourceFrameRate({fps:{num:60,den:1}},30);
 assert.equal(sourceFrameIndex(1000000,fps),60);
 assert.equal(sourceFrameIndex(1016667,fps),61);
});
test('A source handle rounded to microseconds selects the closest frame at a scene change',()=>{
 assert.equal(sourceFrameIndex(404330000,60),24260);
 assert.equal(sourceFrameIndex(404296667,60),24258);
});
test('Fractional source rates and assets without FPS use explicit metadata and fallback',()=>{
 const fps=sourceFrameRate({fps:{num:30000,den:1001}},60);
 assert.equal(sourceFrameIndex(1001000,fps),30);
 assert.equal(sourceFrameRate({},24),24);
 assert.equal(sourceFrameRate({fps:{num:30,den:0}},25),25);
 assert.equal(sourceFrameIndex(-1,30),0);
});
