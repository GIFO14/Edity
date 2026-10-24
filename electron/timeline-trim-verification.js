// Native pointer input, isolated packaged project; never uses the user's UI.
const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
 const runtime=require('../shared/composition-runtime.cjs'),root=path.dirname(process.env.EDITY_TEST_REPORT);
 const words=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta'].map((word,i)=>({word,start:i,end:i+.8,confidence:1}));
 const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Timeline trim QA',words,segments:[{id:0,start:0,end:8,text:words.map(w=>w.word).join(' '),words}],deletedRanges:[],language:'en'});
 let d=await api('getProjectDocument',project.id);
 await api('commitProject',{id:'trim-fixture',projectId:d.id,baseRevision:d.revision,actor:'manual',operations:[{type:'add',element:{id:'trim-title',kind:'text',trackId:'text',order:1,label:'Trim title',enabled:true,createdBy:'manual',text:'Title',textStyle:runtime.defaultTextStyle(),transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold',placement:{kind:'speech',timingBasis:'transcript',startWordId:d.words[1].id,endWordId:d.words[2].id,memberWordIds:[d.words[1].id,d.words[2].id],startOffsetUs:0,endOffsetUs:0,fallbackClock:'clip-local',fallback:{clipId:d.clips[0].id,startUs:1000000,endUs:2800000}}}}]});
 d=await api('getProjectDocument',project.id);await api('commitProject',{id:'snap-fixture',projectId:d.id,baseRevision:d.revision,actor:'manual',operations:[{type:'add',element:{...d.composition.elements['trim-title'],id:'snap-target',label:'Snap target',trackId:'visual',placement:{kind:'timeline',startUs:4000000,endUs:5000000}}}]});
 win.webContents.setAudioMuted(true);await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:d.id,embedded:'1'}});
 const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 await until(()=>ui(`!!document.querySelector('[data-tracks]')`),45000);
 await ui(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Layers ·')).click()`);
 const element='[data-element-id="trim-title"]',handle=side=>`${element} [aria-label="Trim ${side}"]`;
 await until(()=>ui(`!!document.querySelector(${JSON.stringify(element)})`));
 const state=()=>ui(`(()=>{const e=document.querySelector(${JSON.stringify(element)}),n=document.querySelector('[data-tracks]').parentElement,r=n.getBoundingClientRect(),drag=document.querySelector('[data-timeline-drag]');return{start:Number(e.dataset.startUs),end:Number(e.dataset.endUs),width:n.clientWidth,content:n.scrollWidth,left:n.scrollLeft,x:r.left,y:r.top,drag:drag?{start:Number(drag.dataset.startUs),end:Number(drag.dataset.endUs)}:null};})()`);
 const point=side=>ui(`(()=>{const r=document.querySelector(${JSON.stringify(handle(side))}).getBoundingClientRect();return{x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
 const mouse=(type,x,y,modifiers=[])=>win.webContents.sendInputEvent({type,x:Math.round(x),y:Math.round(y),modifiers,...(type==='mouseDown'||type==='mouseUp'?{button:'left',clickCount:1}:{})});
 const key=(keyCode,modifiers=[])=>{win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});};
 async function begin(side){const body=await ui(`(()=>{const e=document.querySelector(${JSON.stringify(element)}).getBoundingClientRect(),n=document.querySelector('[data-tracks]').parentElement,r=n.getBoundingClientRect();return{x:Math.max(r.left+15,Math.min(r.left+n.clientWidth-15,e.left+e.width/2)),y:e.top+e.height/2};})()`);mouse('mouseMove',body.x,body.y);await pause(40);const p=await point(side);mouse('mouseMove',p.x,p.y);mouse('mouseDown',p.x,p.y,['leftButtonDown','shift']);await pause(40);assert.ok((await state()).drag,'Handle captured');return p;}
 async function release(x,y){mouse('mouseUp',x,y,['shift']);await until(()=>ui(`!document.querySelector('[data-timeline-drag]')`));await pause(350);}
 const before=await state(),docBefore=await api('getProjectDocument',d.id);let p=await begin('end');
 mouse('mouseMove',p.x+50,p.y,['leftButtonDown','shift']);await pause(100);const preview=await state();assert.ok(preview.end>before.end+300000);assert.deepEqual((await api('getProjectDocument',d.id)).composition,docBefore.composition,'Preview is not a history write');
 // Last release location is newer than the last pointermove/animation frame.
 await release(p.x+90,p.y);const grown=await state();assert.ok(Math.abs(grown.end-(before.end+90/before.content*8e6))<15000,JSON.stringify({before,grown}));
 key('Z',['control']);await until(async()=>Math.abs((await state()).end-before.end)<1,8000);key('Z',['control','shift']);await until(async()=>Math.abs((await state()).end-grown.end)<1,8000);
 p=await begin('start');mouse('mouseMove',p.x+400,p.y,['leftButtonDown','shift']);await pause(100);const clamped=await state();assert.ok(clamped.end-clamped.start>=33332);
 mouse('mouseMove',p.x-30,p.y,['leftButtonDown','shift']);await pause(100);assert.ok((await state()).start<before.start);await release(p.x-30,p.y);const extendedStart=await state();
 // Release outside the timeline commits; Escape and lost capture cancel.
 p=await begin('end');mouse('mouseMove',p.x-30,p.y-100,['leftButtonDown','shift']);await pause(80);key('Escape');await pause(100);assert.equal((await state()).end,extendedStart.end);mouse('mouseUp',p.x-30,p.y-100);
 // Snap to another clip, then repeat with Shift for exact free placement.
 p=await point('end');mouse('mouseMove',p.x,p.y);mouse('mouseDown',p.x,p.y,['leftButtonDown']);await pause(40);mouse('mouseMove',p.x+10,p.y,['leftButtonDown']);await pause(100);assert.equal((await state()).end,4000000);assert.ok(await ui(`document.querySelector('[data-timeline-drag]').textContent.includes('Snapped')`));mouse('mouseUp',p.x+10,p.y);await pause(350);key('Z',['control']);await until(async()=>(await state()).end===extendedStart.end,8000);
 p=await begin('end');mouse('mouseMove',p.x+10,p.y,['leftButtonDown','shift']);await pause(100);assert.ok(Math.abs((await state()).end-4000000)>10000);await release(p.x+10,p.y);key('Z',['control']);await until(async()=>(await state()).end===extendedStart.end,8000);
 // Put the playhead on the edge and grab the handle through its hit area.
 const ruler=await ui(`(()=>{const r=document.querySelector('[data-timeline-ruler]').getBoundingClientRect();return{x:r.left+r.width*${extendedStart.end}/8000000,y:r.top+10};})()`);mouse('mouseMove',ruler.x,ruler.y);mouse('mouseDown',ruler.x,ruler.y,['leftButtonDown']);mouse('mouseUp',ruler.x,ruler.y);await pause(100);
 p=await point('end');mouse('mouseMove',p.x-4,p.y);mouse('mouseDown',p.x-4,p.y,['leftButtonDown']);await pause(60);assert.ok((await state()).drag,'Trim wins above playhead');mouse('mouseUp',p.x-4,p.y);await pause(200);assert.equal((await state()).end,extendedStart.end,'Grabbing without moving does not trim');
 // 1000x, keeping the right endpoint in the viewport; drag a partly visible clip.
 await ui(`(()=>{const n=document.querySelector('[data-tracks]').parentElement,r=n.getBoundingClientRect();for(let i=0;i<8;i++)n.dispatchEvent(new WheelEvent('wheel',{bubbles:true,cancelable:true,altKey:true,deltaY:-600,clientX:r.left+100}));})()`);await pause(200);
 await ui(`(()=>{const n=document.querySelector('[data-tracks]').parentElement;n.scrollLeft=${extendedStart.end}/8000000*n.scrollWidth-n.clientWidth*.5;})()`);await pause(100);
 const zoomed=await state();assert.ok(Math.abs(zoomed.content/zoomed.width-1000)<.01);p=await begin('end');
 mouse('mouseMove',p.x+60,p.y,['leftButtonDown','shift']);await pause(100);const precise=await state();assert.ok(Math.abs(precise.end-(zoomed.end+60/zoomed.content*8e6))<50,JSON.stringify({zoomed,precise}));
 const viewportEdge=zoomed.x+zoomed.width-2;mouse('mouseMove',viewportEdge,p.y,['leftButtonDown','shift']);await pause(550);const panned=await state();assert.ok(panned.left>zoomed.left+100,'Auto pan continues trim');await release(viewportEdge,p.y);const final=await state();
 // Saved/reloaded bounds must not jump after acoustic word endpoint refresh.
 const persisted=await api('getProjectDocument',d.id);await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.webContents.reload();});await until(()=>ui(`!!document.querySelector('[data-tracks]')`),30000);await ui(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Layers ·')).click()`);await until(()=>ui(`!!document.querySelector(${JSON.stringify(element)})`));
 const reloaded=await state();assert.equal(reloaded.start,final.start);assert.equal(reloaded.end,final.end);assert.equal(persisted.composition.elements['trim-title'].placement.timingBasis,'transcript');
 report.timelineTrim={before,preview,grown,extendedStart,zoomed,precise,panned,final,reloaded};report.checks.push('Native start/end trims expand/shrink, final pointer release flushes, minimum duration clamps without losing capture, Escape cancels, one-step undo/redo, snap and Shift bypass, no-op click and handle above playhead, 1000x partial clip precision, edge auto-pan, exact saved/reopened speech anchors');
};
