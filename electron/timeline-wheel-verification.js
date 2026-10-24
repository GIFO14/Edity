// Hidden packaged QA: no user projects or visible windows.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),words=[{word:'Hello',start:0,end:1,confidence:1}];
  const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Timeline wheel QA',words,segments:[{id:0,start:0,end:1,text:'Hello',words}],deletedRanges:[],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}});
  win.webContents.setAudioMuted(true);
  await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:project.id,embedded:'1'}});
  const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
  await until(()=>ui(`!!document.querySelector('[data-tracks]')`),30000);
  const state=()=>ui(`(()=>{const tracks=document.querySelector('[data-tracks]'),node=tracks.parentElement,r=node.getBoundingClientRect();return{width:node.clientWidth,content:node.scrollWidth,left:node.scrollLeft,x:r.left+node.clientWidth*.6,y:r.top+10,zoom:node.scrollWidth/node.clientWidth,time:document.querySelector('video').currentTime};})()`);
  async function wheel(delta,modifier,mode=0){const s=await state();const prevented=await ui(`(()=>{const event=new WheelEvent('wheel',{bubbles:true,cancelable:true,clientX:${s.x},clientY:${s.y},deltaY:${delta},deltaMode:${mode},${modifier?modifier+':true':''}});document.querySelector('[data-tracks]').dispatchEvent(event);return event.defaultPrevented;})()`);await pause(100);return prevented;}
  const before=await state();report.timelineWheel={before};assert.ok(Math.abs(before.zoom-1)<.01,JSON.stringify(before));
  assert.equal(await wheel(-400,'altKey'),true);const zoomed=await state();assert.ok(zoomed.zoom>2);
  // Cursor position denotes the same timeline time after zooming.
  assert.ok(Math.abs((zoomed.left+zoomed.width*.6)/zoomed.content-.6)<.003,JSON.stringify(zoomed));
  assert.equal(await wheel(180,'ctrlKey'),true);const forward=await state();assert.ok(forward.left>zoomed.left+150);
  await wheel(-100,'ctrlKey');const backward=await state();assert.ok(backward.left<forward.left-80);
  assert.equal(await wheel(20,''),false);assert.equal(win.webContents.getZoomFactor(),1);
  for(let i=0;i<8;i++)await wheel(-600,'altKey');const maximum=await state();assert.ok(Math.abs(maximum.zoom-1000)<.01,JSON.stringify(maximum));
  assert.ok(await ui(`Array.from(document.querySelectorAll('[data-timeline-tick]')).some(n=>n.textContent.includes('.'))`));
  await ui(`document.querySelector('[aria-label=\"Zoom in\"]').click()`);await pause(50);assert.ok(Math.abs((await state()).zoom-1000)<.01);
  await wheel(180,'ctrlKey');assert.ok((await state()).left>maximum.left+150);
  await ui(`document.querySelector('[aria-label=\"Zoom out\"]').click()`);await pause(50);assert.ok((await state()).zoom<700);
  for(let i=0;i<8;i++)await wheel(600,'altKey');assert.ok(Math.abs((await state()).zoom-1)<.01);
  // Exercise Electron's actual mouse-wheel route as well as DOM cancellation.
  const physical=await state();win.webContents.sendInputEvent({type:'mouseMove',x:Math.round(physical.x),y:Math.round(physical.y)});
  win.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(physical.x),y:Math.round(physical.y),deltaY:120,deltaX:0,modifiers:['alt'],canScroll:true});
  await pause(200);const native=await state();assert.ok(native.zoom>1.1,JSON.stringify(native));
  win.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(physical.x),y:Math.round(physical.y),deltaY:-60,deltaX:0,modifiers:['control'],canScroll:true});
  await pause(200);const nativeForward=await state();assert.ok(nativeForward.left>native.left+20,JSON.stringify({native,nativeForward}));
  win.webContents.sendInputEvent({type:'mouseWheel',x:Math.round(physical.x),y:Math.round(physical.y),deltaY:60,deltaX:0,modifiers:['control'],canScroll:true});
  await pause(200);const nativeBackward=await state();assert.ok(nativeBackward.left<nativeForward.left-20);
  assert.equal(win.webContents.getZoomFactor(),1);assert.ok(Math.abs(native.time-before.time)<.05);
  report.timelineWheel={before,zoomed,forward,backward,native,nativeForward,nativeBackward,webZoom:win.webContents.getZoomFactor()};
  report.checks.push('Alt wheel zooms around pointer, Ctrl wheel scrolls both ways, normal wheel remains available, limits 1–1000x, subsecond ruler and both zoom buttons, native mouse event, no page zoom or playhead move');
};
