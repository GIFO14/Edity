// Isolated native keyboard/IPC verification. Never read/write the user's OS clipboard.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),{ipcMain,clipboard,Menu}=require('electron');
 const {FORMAT,readTimelineClipboard}=require('./timeline-clipboard'),memory=new Map();
 const originalWrite=clipboard.writeBuffer,originalMenu=Menu.buildFromTemplate;
 let external={inputs:[],text:''},lastMenu,copyCalls=0;
 clipboard.writeBuffer=(format,buffer)=>{memory.clear();memory.set(format,Buffer.from(buffer));copyCalls++;};
 assert.notEqual(clipboard.writeBuffer,originalWrite);
 const fakeClipboard={readBuffer:format=>memory.get(format)||Buffer.alloc(0)},repository={directory:id=>path.join(process.env.EDITY_TEST_PROJECTS,id)};
 ipcMain.removeHandler('timeline:readClipboard');ipcMain.handle('timeline:readClipboard',(_event,id)=>readTimelineClipboard(fakeClipboard,repository,id,async()=>external));
 Menu.buildFromTemplate=template=>{if(template[0]?.label==='Copy'&&template[1]?.label==='Paste here'){lastMenu=template;return {popup:()=>{}};}return originalMenu.call(Menu,template);};
 const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const key=(keyCode,modifiers=['control'])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});};
 let id;
 const overlays=async()=>Object.values((await api('getProjectDocument',id)).composition.elements).filter(e=>e.id!=='base');
 const count=async n=>until(async()=>{const e=await overlays(),error=await ui(`document.querySelector('[data-timeline-import-status]')?.textContent||''`);if(/Error:/.test(error))throw Error(error);return e.length===n?e:null;},45000);
 const focus=()=>ui(`document.querySelector('[aria-label="Timeline"]').focus()`);
 const seek=async time=>{
  const p=await ui(`(()=>{const n=document.querySelector('[data-tracks]'),r=n.getBoundingClientRect(),t=document.querySelector('[data-timeline-ruler]').getBoundingClientRect();return{x:r.left+${time}/12*r.width,y:t.top+5};})()`);
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,x:Math.round(p.x),y:Math.round(p.y),button:'left',clickCount:1});
  await until(()=>ui(`Math.abs(Number(document.querySelector('[aria-label="Playhead"]').getAttribute('aria-valuenow'))-${time})<.04`),15000);await focus();
 };
 const pasteFiles=files=>{memory.clear();external={inputs:files.map(p=>({path:p})),text:''};};
 const open=async title=>{
  const words=Array.from({length:12},(_,i)=>({word:`word${i}`,start:i,end:i+.8,confidence:1}));
  const project=await api('createManagedProject',path.join(root,'base.mp4'),{title,words,segments:[],deletedRanges:[],language:'es'});id=project.id;
  await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:id,embedded:'1'}});
  await until(()=>ui(`!!document.querySelector('[data-tracks]')`),45000);
  if(!(await ui(`!!document.querySelector('[data-timeline-track="music"]')`)))await ui(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Layers ·')).click()`);
  await focus();return id;
 };
 try{
  win.webContents.setAudioMuted(true);const first=await open('Timeline clipboard QA');
  pasteFiles([path.join(root,'Música pròpia.wav')]);await seek(1);key('V');let items=await count(1),music=items[0];
  assert.equal(music.kind,'audio');assert.equal(music.trackId,'music');assert.ok(Math.abs(music.placement.startUs-1e6)<40000);
  let d=await api('getProjectDocument',id);await api('commitProject',{id:'qa-set-audio',projectId:id,baseRevision:d.revision,actor:'manual',label:'Audio settings',operations:[{type:'update',id:music.id,changes:{sourceInUs:200000,audio:{...music.audio,gainDb:-17,fadeInUs:300000,fadeOutUs:200000}}}]});
  await until(async()=> (await overlays())[0].audio.gainDb===-17);
  await focus();key('C');await until(()=>memory.has(FORMAT));await seek(4);key('V');items=await count(2);
  const duplicate=items.find(e=>e.id!==music.id);music=items.find(e=>e.id===music.id);
  assert.ok(Math.abs(duplicate.placement.startUs-4e6)<40000);assert.equal(duplicate.sourceInUs,music.sourceInUs);assert.equal(duplicate.audio.gainDb,-17);assert.equal(duplicate.audio.fadeInUs,300000);assert.equal(duplicate.audio.fadeOutUs,200000);
  // Native timeline undo/redo changes only the newly pasted layer.
  await focus();key('Z');await count(1);key('Z',['control','shift']);await count(2);
  // Copy back to an earlier point, then paste with the context-menu request.
  await seek(6);
  const p=await ui(`(()=>{const n=document.querySelector('[data-tracks]').getBoundingClientRect(),r=document.querySelector('[data-timeline-track="music"]').getBoundingClientRect();return{x:n.left+n.width*.5,y:r.top+25};})()`);
  win.webContents.sendInputEvent({type:'mouseDown',x:Math.round(p.x),y:Math.round(p.y),button:'right',clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',x:Math.round(p.x),y:Math.round(p.y),button:'right',clickCount:1});
  await until(()=>!!lastMenu);assert.equal(lastMenu[1].label,'Paste here');lastMenu[1].click();items=await count(3);assert.ok(items.some(e=>Math.abs(e.placement.startUs-6e6)<40000));
  // External video/image and multiple Explorer files use the real managed importer.
  pasteFiles([path.join(root,'overlay.png'),path.join(root,'Música pròpia.wav')]);await seek(2);key('V');items=await count(5);assert.ok(items.some(e=>e.kind==='image'));
  pasteFiles([path.join(root,'base.mp4')]);await seek(8);key('V');items=await count(6);assert.equal(items.find(e=>e.kind==='video').audio.mute,true);
  memory.clear();external={inputs:[],text:'Copied title ✓'};await seek(.5);key('V');items=await count(7);const title=items.find(e=>e.kind==='text');assert.equal(title.text,'Copied title ✓');
  await focus();key('C');await until(()=>memory.has(FORMAT)&&JSON.parse(memory.get(FORMAT).toString()).element.kind==='text');await seek(7);key('V');items=await count(8);assert.equal(items.filter(e=>e.text==='Copied title ✓').length,2);
  // Standard application Edit > Paste dispatches a ClipboardEvent as well.
  memory.clear();external={inputs:[{bytes:fs.readFileSync(path.join(root,'overlay.png'))}],text:''};
  await ui(`document.querySelector('[aria-label="Timeline"]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true}))`);await count(9);
  const before=await overlays();assert.equal(await ui(`(()=>{const t=document.createElement('textarea');t.id='qa-input';document.querySelector('[aria-label="Timeline"]').append(t);const e=new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true});t.dispatchEvent(e);t.remove();return e.defaultPrevented;})()`),false);assert.equal((await overlays()).length,before.length);
  // Cross-project text and media copies create independent IDs and managed assets.
  // Use the real copy IPC with current visible timing; keyboard routing already tested.
  d=await api('getProjectDocument',id);await api('copyTimelineElement',{projectId:id,elementId:music.id,expectedRevision:d.revision,spans:[{startUs:music.placement.startUs,endUs:music.placement.endUs}]});
  const copied=JSON.parse(memory.get(FORMAT).toString());const second=await open('Cross-project clipboard QA');await seek(3);key('V');items=await count(1);
  assert.equal(items[0].audio.gainDb,-17);assert.notEqual(items[0].id,music.id);
  d=await api('getRenderDocument',id);const asset=d.composition.assets[items[0].assetId];assert.ok(asset.path.startsWith(path.join(process.env.EDITY_TEST_PROJECTS,second)));assert.ok(fs.existsSync(asset.path));
  const saved=d.composition;await win.reload();await until(()=>ui(`!!document.querySelector('[data-tracks]')`),45000);assert.deepEqual((await api('getRenderDocument',id)).composition,saved);
  assert.equal(copied.sourceProjectId,first);
  report.timelineClipboard={firstProject:first,secondProject:second,firstElementCount:9,secondElementCount:1,copyCalls,clipboardProvider:'injected; user OS clipboard untouched',undoRedo:true,persisted:true};
  report.checks.push('Native Ctrl+C/Ctrl+V at playhead; native context-menu request/Paste here command; independent IDs, gain, source trim and fades; multi-file media, muted B-roll, images/bitmap/text; cross-project managed asset copies; text input focus; undo/redo and reopen persistence');
 }finally{
  clipboard.writeBuffer=originalWrite;Menu.buildFromTemplate=originalMenu;ipcMain.removeHandler('timeline:readClipboard');
 }
};
