const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const p=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Playback options QA',words:[{word:'Hello',start:0,end:5,confidence:1}],segments:[],deletedRanges:[],language:'en'});
 const doc=await api('getProjectDocument',p.id),runtime=require('../shared/composition-runtime.cjs');
 await api('commitProject',{id:'qa-title',projectId:p.id,baseRevision:doc.revision,actor:'manual',label:'QA title',operations:[{type:'add',element:{id:'title',kind:'text',trackId:'text',order:1,label:'Fullscreen composite title',enabled:true,createdBy:'manual',placement:{kind:'project',startOffsetUs:0,endOffsetUs:0},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold',text:'FULLSCREEN COMPOSITE',textStyle:runtime.defaultTextStyle()}}]});
 await until(()=>win.webContents.executeJavaScript(`!![...document.querySelectorAll('aside span[title]')].find(n=>n.title==='Playback options QA')`),15000);
 await win.webContents.executeJavaScript(`[...document.querySelectorAll('aside span[title]')].find(n=>n.title==='Playback options QA').closest('button').click()`);
 const v=await until(()=>win.getBrowserViews().find(v=>{try{return new URL(v.webContents.getURL()).searchParams.get('project')===p.id;}catch{return false;}}),30000),ui=code=>v.webContents.executeJavaScript(code,true);
 await until(()=>ui(`!!document.querySelector('[aria-label="Playback quality"]')&&document.querySelector('canvas')?.height===720&&document.querySelector('video')?.readyState>=2`),60000);
 win.showInactive();await pause(300);report.qualities=[];
 const before=await api('getProjectDocument',p.id);
 await ui(`window.__video=document.querySelector('video');window.__video.pause();(()=>{const n=document.querySelector('[data-playback-controls]').firstElementChild,r=n.getBoundingClientRect();n.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+r.width*.25}));})();`);
 await until(()=>ui(`Math.abs(window.__video.currentTime-2)<.15&&!window.__video.seeking`),10000);
 for(const [quality,height] of [['360',360],['480',480],['720',720],['1080',1080],['original',1080],['auto',720]]){
  await ui(`(()=>{const s=document.querySelector('[aria-label="Playback quality"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,${JSON.stringify(quality)});s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
  await until(()=>ui(`document.querySelector('canvas')?.height===${height}&&document.querySelector('video')?.readyState>=2&&!document.querySelector('video').seeking&&${quality==='original'?`!document.querySelector('video').src.includes('edity-preview')`:`document.querySelector('video').videoHeight===${height}`}`),60000);
  const state=await ui(`({quality:document.querySelector('[aria-label="Playback quality"]').value,canvas:[document.querySelector('canvas').width,document.querySelector('canvas').height],videoHeight:window.__video.videoHeight,time:window.__video.currentTime,same:window.__video===document.querySelector('video'),paused:window.__video.paused})`);
  assert.ok(state.same);assert.ok(state.paused);assert.ok(Math.abs(state.time-2)<.15,JSON.stringify(state));report.qualities.push(state);
 }
 const normal=v.getBounds();await ui(`document.querySelector('[aria-label="Full screen"]').click()`);
 await until(()=>ui(`document.fullscreenElement?.hasAttribute('data-playback-surface')`),10000);await pause(600);
 const bounds=v.getBounds(),content=win.getContentBounds();assert.equal(bounds.x,0);assert.equal(bounds.y,0);assert.equal(bounds.width,content.width);assert.equal(bounds.height,content.height);
 assert.ok(await ui(`document.querySelector('[aria-label="Exit full screen (Esc)"]')!==null`));
 fs.writeFileSync(path.join(root,'fullscreen.png'),(await v.webContents.capturePage()).toPNG());
 v.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});v.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});
 await until(()=>ui(`!document.fullscreenElement`),10000);await pause(400);assert.deepEqual(v.getBounds(),normal);
 await ui(`window.__video.muted=true;window.__video.play()`);await pause(300);
 await ui(`document.querySelector('[aria-label="Full screen"]').click()`);await until(()=>ui(`!!document.fullscreenElement`),10000);await pause(400);
 assert.ok(await ui(`!window.__video.paused&&window.__video===document.querySelector('video')`));
 await ui(`document.querySelector('[aria-label="Exit full screen (Esc)"]').click()`);await until(()=>ui(`!document.fullscreenElement`),10000);
 const playingTime=await ui(`window.__video.currentTime`);
 await ui(`(()=>{const s=document.querySelector('[aria-label=\"Playback quality\"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(s,'360');s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 await until(()=>ui(`window.__video.readyState>=2&&window.__video.videoHeight===360&&!window.__video.paused`),15000);await pause(400);assert.ok(await ui(`window.__video.currentTime>${playingTime}&&localStorage.getItem('edity-playback-quality')==='360'`));report.playingQualityChange=true;
 await ui(`window.__video.pause()`);const after=await api('getProjectDocument',p.id);assert.deepEqual(after.composition,before.composition);assert.deepEqual(after.deletedRanges,before.deletedRanges);
 report.fullscreen={bounds,normal,escaped:true,playingPreserved:true};report.projectUnchanged=true;report.checks.push('All quality resolutions, source time and paused state, native fullscreen bounds, Escape, exit button, uninterrupted playback, unchanged composition/export settings');win.hide();
};
