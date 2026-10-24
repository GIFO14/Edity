const assert=require('node:assert/strict'),path=require('node:path');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),runtime=require('../shared/composition-runtime.cjs');
  const words=['Alpha','Beta','Gamma','Delta','Epsilon','Zeta','Eta','Theta'].map((word,i)=>({word,start:i,end:i+.9,confidence:1}));
  const project=await api('createManagedProject',path.join(root,'base.mp4'),{title:'Locked base cuts QA',words,segments:[{id:0,start:0,end:8,text:words.map(w=>w.word).join(' '),words}],deletedRanges:[{id:'cut',start:2,end:4,wordIndices:[2,3],cutStart:2,cutEnd:4}],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}});
  let d=await api('getProjectDocument',project.id);
  const clips=d.clips.map(c=>({...c,sourceMap:{version:1,kind:'silence-processed',marginSeconds:.1,originalDurationUs:10500000,segments:[{originalStartUs:0,originalEndUs:1000000,processedStartUs:0,processedEndUs:1000000},{originalStartUs:2000000,originalEndUs:4000000,processedStartUs:1000000,processedEndUs:3000000},{originalStartUs:5000000,originalEndUs:8000000,processedStartUs:3000000,processedEndUs:6000000},{originalStartUs:8500000,originalEndUs:10500000,processedStartUs:6000000,processedEndUs:8000000}]}}));
  await api('commitProject',{id:'qa-silence-map',projectId:d.id,baseRevision:d.revision,actor:'manual',label:'Fixture source map',operations:[{type:'add',element:{id:'movable-title',kind:'text',trackId:'text',order:1,label:'Movable title',text:'Title',textStyle:runtime.defaultTextStyle(),enabled:true,createdBy:'manual',placement:{kind:'timeline',startUs:500000,endUs:1500000},transform:runtime.defaultTransform(),presets:[],sourceInUs:0,endPolicy:'hold'}}],documentChanges:{clips}});
  win.webContents.setAudioMuted(true);await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:d.id,embedded:'1'}});
  const ui=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
  await until(()=>ui(`document.querySelectorAll('[data-base-piece]').length===4&&document.querySelector('video')?.muted`),45000);
  const pieces=await ui(`Array.from(document.querySelectorAll('[data-base-piece]')).map(e=>({start:Number(e.dataset.startUs),end:Number(e.dataset.endUs),kinds:e.dataset.cutKinds,trimHandles:e.querySelectorAll('[aria-label^="Trim"]').length}))`);
  assert.deepEqual(pieces.map(p=>[p.start,p.end]),[[0,1000000],[1000000,2000000],[2000000,4000000],[4000000,6000000]]);
  assert.ok(pieces[1].kinds.includes('silence-removal'));assert.ok(pieces[2].kinds.includes('edit-removal'));assert.ok(pieces.every(p=>p.trimHandles===0));
  const point=selector=>ui(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return{x:Math.round(r.left+r.width*${selector.includes('Select ')?'.25':'.5'}),y:Math.round(r.top+r.height/2)};})()`);
  async function drag(selector,dx){const p=await point(selector);win.webContents.sendInputEvent({type:'mouseMove',...p});win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1,modifiers:['leftButtonDown']});await pause(50);win.webContents.sendInputEvent({type:'mouseMove',x:p.x+dx,y:p.y,modifiers:['leftButtonDown']});await pause(100);win.webContents.sendInputEvent({type:'mouseUp',x:p.x+dx,y:p.y,button:'left',clickCount:1});await pause(350);}
  const before=await api('getProjectDocument',d.id);await drag('[data-base-piece]',100);const locked=await api('getProjectDocument',d.id);assert.deepEqual(locked.composition.elements.base,before.composition.elements.base);assert.deepEqual(locked.deletedRanges,before.deletedRanges);
  await ui(`[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Layers ·')).click()`);await until(()=>ui(`!!document.querySelector('[data-element-id="movable-title"]')`));
  await drag('[data-element-id="movable-title"]',80);await until(async()=>(await api('getProjectDocument',d.id)).composition.elements['movable-title'].placement.startUs>500000);
  const moved=await api('getProjectDocument',d.id),target=moved.composition.elements['movable-title'].placement.startUs+100000;
  async function key(keyCode,modifiers=[]){win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await pause(100);}
  await key('Z',['control']);
  await until(async()=>(await api('getProjectDocument',d.id)).composition.elements['movable-title'].placement.startUs===500000,8000);
  await key('Z',['control','shift']);
  await until(async()=>(await api('getProjectDocument',d.id)).composition.elements['movable-title'].placement.startUs===moved.composition.elements['movable-title'].placement.startUs,8000);
  // A prior text field focus must not swallow history after selecting words.
  await ui(`(()=>{const t=document.createElement('textarea');t.id='qa-chat-draft';document.body.append(t);t.value='Draft';t.style.cssText='position:fixed;right:0;top:0;width:30px;height:20px';t.focus({preventScroll:true});})()`);
  const word=await point('[data-word-index="5"]');win.webContents.sendInputEvent({type:'mouseMove',...word});win.webContents.sendInputEvent({type:'mouseDown',...word,button:'left',clickCount:1,modifiers:['leftButtonDown']});win.webContents.sendInputEvent({type:'mouseUp',...word,button:'left',clickCount:1});
  await pause(100);report.wordSelection=await ui(`({point:${JSON.stringify(word)},active:document.activeElement?.outerHTML.slice(0,200),word:document.querySelector('[data-word-index=\"5\"]').outerHTML})`);assert.ok(report.wordSelection.word.includes('bg-editor-word-selected'),JSON.stringify(report.wordSelection));
  await key('Delete');await key('Z',['control']);
  await until(async()=>!(await api('getProjectDocument',d.id)).deletedRanges.some(r=>r.wordIndices.includes(5)),8000);
  await key('Z',['control','shift']);
  await until(async()=>(await api('getProjectDocument',d.id)).deletedRanges.some(r=>r.wordIndices.includes(5)),8000);
  await key('Z',['control']);
  await until(async()=>!(await api('getProjectDocument',d.id)).deletedRanges.some(r=>r.wordIndices.includes(5)),8000);
  // Native text undo remains native while actually typing in a field.
  const revisionBeforeDraft=(await api('getProjectDocument',d.id)).revision;
  await ui(`document.querySelector('#qa-chat-draft').focus()`);win.webContents.insertText(' local text');await key('Z',['control']);
  assert.equal((await api('getProjectDocument',d.id)).revision,revisionBeforeDraft);
  await ui(`document.querySelector('#qa-chat-draft').remove()`);
  report.checks.push('Native Ctrl+Z / Ctrl+Shift+Z undo and redo timeline moves and immediate transcript deletions, switching focus from text to transcript works, text fields do not undo the project');
  const p=await ui(`(()=>{const r=document.querySelector('[data-timeline-ruler]').getBoundingClientRect();return{x:Math.round(r.left+r.width*${target}/6000000),y:Math.round(r.top+10)};})()`);
  win.webContents.sendInputEvent({type:'mouseMove',...p});win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1,modifiers:['leftButtonDown']});win.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});
  await until(()=>ui(`!!document.querySelector('[aria-label="Select Movable title"]')`),15000);
  await drag('[aria-label="Select Movable title"]',25);
  await until(async()=>(await api('getProjectDocument',d.id)).composition.elements['movable-title'].transform.x>.5,15000);
  assert.equal(await ui(`!!document.querySelector('[role="alert"]')`),false);
  report.baseCuts={pieces,baseStayedLocked:true,overlayMoved:true,viewerDragWorked:true};report.checks.push('All base cuts are literal adjacent pieces, silence inside removed region stays absent, base drag only scrubs, no trim handles, text and viewer dragging remain editable without a render crash');
};
