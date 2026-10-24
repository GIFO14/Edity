const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require('../frontend/node_modules/typescript');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function runtime(options={}){
 const videos=[];
 class Video extends EventTarget{
  paused=true;readyState=4;duration=100;playbackRate=1;_time=0;pauses=0;
  set src(value){this.source=value;if(!options.holdLoad)queueMicrotask(()=>this.onloadeddata?.());}
  get currentTime(){return this._time;}set currentTime(value){this._time=value;this.seeking=true;}
  pause(){this.pauses++;this.paused=true;}play(){this.paused=false;return Promise.resolve();}
  removeAttribute(){}load(){}finish(){this.seeking=false;this.dispatchEvent(new Event('seeked'));}
 }
 const cache=new Map(),context={AbortController,performance,setInterval,clearInterval,setTimeout,clearTimeout,Uint8Array,Image:class{},document:{createElement(){const v=new Video();videos.push(v);return v;}},fetch:options.fetch||(()=>{throw Error('Unexpected fetch');})};
 function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file).exports;const module={exports:{}};cache.set(file,module);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;vm.runInNewContext(`(function(require,module,exports){${code}\n})`,context,{filename:file})(name=>load(path.resolve(path.dirname(file),name+'.ts')),module,module.exports);return module.exports;}
 return{...load(path.resolve('frontend/src/render/frameProvider.ts')),abortable:load(path.resolve('frontend/src/render/abortable.ts')).abortable,videos};
}
const asset={id:'asset',hash:'a',kind:'video',name:'QA',path:'source.mp4',width:1,height:1,fps:{num:30,den:1}};
const layer=(seconds,graded=false)=>({id:'base',sourceTimeUs:seconds*1e6,colorGrade:graded?{exposure:.5}:null});
test('seek cancellation releases a pending decoder load immediately',async()=>{
 const r=runtime({holdLoad:true}),provider=new r.FrameProvider('http://qa');
 try{const pending=provider.frame(layer(10),asset,false,1);provider.invalidate();await assert.rejects(pending,/Superseded seek/);r.videos[0].onloadeddata();await Promise.resolve();assert.equal(r.videos[0].currentTime,0);}finally{provider.dispose();}
});
test('an obsolete seek cannot pause or rewrite a newer playing decoder',async()=>{
 const r=runtime(),provider=new r.FrameProvider('http://qa');
 try{
  const old=provider.frame(layer(10),asset,false,1);await new Promise(setImmediate);assert.equal(r.videos[0].currentTime,10);
  provider.invalidate();await assert.rejects(old,/Superseded seek/);
  const latest=provider.frame(layer(20),asset,true,1);await new Promise(setImmediate);r.videos[0].finish();await latest;
  assert.equal(r.videos[0].currentTime,20);assert.equal(r.videos[0].paused,false);await new Promise(setImmediate);assert.equal(r.videos[0].paused,false);
 }finally{provider.dispose();}
});
test('a slow precise RGBA response cannot retain the frame render lock after invalidation',async()=>{
 const response=deferred(),r=runtime({fetch:()=>response.promise}),provider=new r.FrameProvider('http://qa');
 try{
  const old=provider.frame(layer(10,true),asset,false,1);provider.invalidate();await assert.rejects(old,/Superseded seek/);
  const latest=provider.frame(layer(20),asset,true,1);await new Promise(setImmediate);r.videos[0].finish();await latest;assert.equal(r.videos[0].paused,false);
  response.resolve({ok:true,arrayBuffer:async()=>new Uint8Array(60).buffer});await new Promise(setImmediate);
  assert.equal(r.videos[0].currentTime,20);assert.equal(r.videos[0].paused,false);
 }finally{provider.dispose();}
});
test('cancelled font/image work remains observed even if it fails later',async()=>{
 const r=runtime(),work=deferred(),controller=new AbortController();const pending=r.abortable(work.promise,controller.signal);controller.abort();await assert.rejects(pending,/Superseded seek/);work.reject(Error('Late network failure'));await new Promise(setImmediate);
});
