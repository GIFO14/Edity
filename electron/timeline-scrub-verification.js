// Real pointer input in a hidden, disposable packaged project.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),words=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta'].map((word,i)=>({word,start:i,end:i+.9,confidence:1}));
  const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Timeline scrub QA',words,segments:[{id:0,start:0,end:8,text:words.map(w=>w.word).join(' '),words}],deletedRanges:[{id:'qa-cut',start:2,end:4,wordIndices:[2,3],cutStart:2,cutEnd:4}],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}});
  win.webContents.setAudioMuted(true);await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:project.id,embedded:'1'}});
  const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
  await until(()=>ui(`!!document.querySelector('[aria-label="Playhead"]')&&document.querySelector('video')?.muted`),45000);
  const document=await api('getProjectDocument',project.id),backend=await api('getBackendUrl');
  const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(document))});assert.ok(response.ok);const manifest=await response.json(),runtime=require('../shared/composition-runtime.cjs');
  await ui(`window.__scrubSeeks=0;document.querySelector('video').addEventListener('edity-seek',()=>window.__scrubSeeks++);void 0;`);
  const state=()=>ui(`(()=>{const p=document.querySelector('[aria-label="Playhead"]'),r=p.getBoundingClientRect(),node=document.querySelector('[data-tracks]').parentElement,v=node.getBoundingClientRect();return{editUs:Number(p.getAttribute('aria-valuenow'))*1e6,time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused,seeks:window.__scrubSeeks,x:Math.max(v.left+2,Math.min(v.right-2,r.x+r.width/2)),y:v.top+10,left:v.left,width:node.clientWidth,scroll:node.scrollLeft,content:node.scrollWidth};})()`);
  const mouse=(type,x,y,extra={})=>win.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(y),...(type==='mouseDown'?{modifiers:['leftButtonDown']}:{}),...extra});
  let s=await state();await mouse('mouseMove',s.x,s.y);await mouse('mouseDown',s.x,s.y,{button:'left',clickCount:1});
  const samples=[];
  for(const fraction of [.25,.5,.75]){await mouse('mouseMove',s.left+s.width*fraction,s.y,{modifiers:['leftButtonDown']});await pause(130);const sample=await state();samples.push(sample);const expected=runtime.editToSource(manifest,Math.round(manifest.durationUs*fraction)).globalSourceUs/1e6;assert.ok(Math.abs(sample.time-expected)<.08,JSON.stringify({sample,expected}));}
  await mouse('mouseUp',s.left+s.width*.75,s.y,{button:'left',clickCount:1});await pause(100);const released=await state();assert.equal(released.paused,true);assert.ok(released.seeks>=4);assert.ok(samples[1].time-samples[0].time>2,'Dragging crosses the removed source region using edited time');
  s=await state();report.timelineScrub={samples,released,rulerStart:s};
  await mouse('mouseMove',s.left+s.width*.1,s.y);await mouse('mouseDown',s.left+s.width*.1,s.y,{button:'left',clickCount:1});await pause(70);
  await mouse('mouseMove',s.left+s.width*.3,s.y-40,{modifiers:['leftButtonDown']});await pause(120);await mouse('mouseUp',s.left+s.width*.3,s.y-40,{button:'left',clickCount:1});await pause(100);const outside=await state();report.timelineScrub.outside=outside;assert.ok(Math.abs(outside.editUs/manifest.durationUs-.3)<.01,JSON.stringify(outside));
  await ui(`document.querySelector('video').play()`);await pause(120);s=await state();await mouse('mouseMove',s.x,s.y);await mouse('mouseDown',s.x,s.y,{button:'left',clickCount:1});await pause(100);assert.equal((await state()).paused,true);
  await mouse('mouseMove',s.left+s.width*.4,s.y,{modifiers:['leftButtonDown']});await pause(80);await mouse('mouseUp',s.left+s.width*.4,s.y,{button:'left',clickCount:1});await pause(180);assert.equal((await state()).paused,false);await ui(`document.querySelector('video').pause()`);
  // Zoom to ~2.2x, then hold the handle at the viewport's right edge.
  await ui(`document.querySelector('[data-tracks]').dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,altKey:true,deltaY:-400,clientX:${s.left+s.width*.4}}))`);await pause(150);
  s=await state();await mouse('mouseMove',s.x,s.y);await mouse('mouseDown',s.x,s.y,{button:'left',clickCount:1});await mouse('mouseMove',s.left+s.width-2,s.y,{modifiers:['leftButtonDown']});await pause(650);const autoScroll=await state();assert.ok(autoScroll.scroll>s.scroll+100,JSON.stringify({s,autoScroll}));await mouse('mouseUp',s.left+s.width-2,s.y,{button:'left',clickCount:1});await pause(80);
  const after=await api('getProjectDocument',project.id);assert.deepEqual(after.deletedRanges,document.deletedRanges);assert.deepEqual(after.composition,document.composition);
  report.timelineScrub={samples,released,outside,autoScroll,cutSegments:manifest.segments};
  report.checks.push('Native pointer drag seeks continuously across cuts, captures outside ruler, preserves paused/playing state, auto-scrolls zoomed viewport, and leaves edits untouched');
};
