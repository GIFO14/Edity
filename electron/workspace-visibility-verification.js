// Regression for visibility ownership, without clicking Reopen or replacing editors.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({app,win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),baseline=process.env.EDITY_TEST_BASELINE==='1';
 const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const ui=async code=>{
  const result=await win.webContents.debugger.sendCommand('Runtime.evaluate',{expression:code,awaitPromise:true,returnByValue:true,userGesture:true});
  if(result.exceptionDetails)throw new Error((result.exceptionDetails.exception?.description||result.exceptionDetails.text)+'\nUI code: '+code);return result.result.value;
 };
 const phase=name=>fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify({phase:name,at:new Date().toISOString()}));
 const reload=async()=>{const loaded=new Promise(resolve=>win.webContents.once('did-finish-load',resolve));win.webContents.reload();await loaded;};
 const projects=[];
 for(const title of ['Visibility A','Visibility B'])projects.push(await api('createManagedProject',path.join(root,'base.mp4'),{title,words:[{word:'Hello',start:0,end:1,confidence:1}],segments:[],deletedRanges:[],language:'en'}));
 const source=process.env.EDITY_TEST_REAL_DOCUMENT;
 if(source){
  const bytes=fs.readFileSync(source);report.sourceHash=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  const doc=JSON.parse(bytes);doc.id='qa-real-visibility';doc.title='Visibility real project';
  for(const asset of Object.values(doc.composition.assets))for(const key of ['path','previewPath','normalizedPath','thumbnailPath'])if(asset[key]&&!path.isAbsolute(asset[key]))asset[key]=path.resolve(path.dirname(source),asset[key]);
  const dest=path.join(process.env.EDITY_TEST_PROJECTS,doc.id);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'project.edity'),JSON.stringify(doc));projects[0]=doc;
 }
 // Retain a callback at registration, as a notification already queued by the
 // browser would. Deliver it after its effect has been cleaned up. The test
 // does not inject a bogus layout directly; it runs the actual old shell code.
 win.webContents.debugger.attach('1.3');
 await win.webContents.debugger.sendCommand('Page.enable');
 await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:`
  window.__qaObservers=[];const NativeObserver=window.ResizeObserver;
  window.ResizeObserver=class extends NativeObserver{
   constructor(callback){super(callback);this.record={fire:()=>callback([],this),disconnected:false};window.__qaObservers.push(this.record);}
   disconnect(){this.record.disconnected=true;super.disconnect();}
  };`});
 phase('instrumented-shell');await reload();await until(()=>ui(`!!document.querySelector('button[title="Project home"]')`),20000);
 const viewFor=id=>win.getBrowserViews().find(v=>{try{return new URL(v.webContents.getURL()).searchParams.get('project')===id;}catch{return false;}});
 const ready=async id=>{const view=viewFor(id);try{return view&&!view.webContents.isDestroyed()&&!view.webContents.isLoading()&&await view.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Timeline"]')&&document.querySelector('video')?.readyState>=2`)?view:null;}catch{return null;}};
 async function choose(project,beside=false){await until(()=>ui(`!![...document.querySelectorAll('aside span[title]')].find(n=>n.title===${JSON.stringify(project.title)})`),15000);await ui(`(()=>{const label=[...document.querySelectorAll('aside span[title]')].find(n=>n.title===${JSON.stringify(project.title)});${beside?`label.closest('button').parentElement.querySelector('button[title="Show beside"]').click()`:`label.closest('button').click()`};})()`);return until(()=>ready(project.id),90000);}
 await ui(`document.querySelector('button[title="Project home"]').click();void 0;`);await pause(200);
 const homeCallback=await ui(`window.__qaObservers.length-1`);
 let first=await choose(projects[0]);const firstContents=first.webContents.id,saved=await api('getProjectDocument',projects[0].id);phase('home-callback');
 assert.ok(await ui(`window.__qaObservers[${homeCallback}].disconnected`));
 await ui(`window.__qaObservers[${homeCallback}].fire();void 0;`);await pause(300);
 report.lateHomeNotificationPreservedEditor=win.getBrowserViews().includes(first);
 if(!baseline)assert.ok(report.lateHomeNotificationPreservedEditor,'Late home callback detached the selected editor');
 if(baseline){assert.equal(report.lateHomeNotificationPreservedEditor,false);await ui(`window.dispatchEvent(new Event('focus'));void 0;`);await until(()=>ready(projects[0].id),15000);}
 phase('drag-cancel-callback');
 await ui(`(()=>{const data=new DataTransfer();data.items.add(new File(['x'],'qa.mp4',{type:'video/mp4'}));document.querySelector('#root').firstElementChild.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:data}));})()`);
 await until(()=>win.getBrowserViews().length===0,10000);await pause(150);const dragCallback=await ui(`window.__qaObservers.length-1`);
 await ui(`document.querySelector('#root').firstElementChild.dispatchEvent(new DragEvent('dragleave',{bubbles:true,relatedTarget:null}));void 0;`);await until(()=>ready(projects[0].id),15000);
 await ui(`window.__qaObservers[${dragCallback}].fire();void 0;`);await pause(300);
 report.lateDragNotificationPreservedEditor=win.getBrowserViews().includes(first);
 report.dropOverlayDismissed=await ui(`!document.body.textContent.includes('Drop videos to create projects')`);
 if(!baseline)assert.ok(report.lateDragNotificationPreservedEditor&&report.dropOverlayDismissed);
 if(baseline){assert.equal(report.lateDragNotificationPreservedEditor,false);await ui(`window.dispatchEvent(new Event('focus'));void 0;`);await until(()=>ready(projects[0].id),15000);}
 phase('busy-renderer');
 first.webContents.emit('unresponsive');await pause(200);report.busyEditorStayedAttached=win.getBrowserViews().includes(first);first.webContents.emit('responsive');await until(()=>ready(projects[0].id),15000);
 if(!baseline)assert.ok(report.busyEditorStayedAttached);else assert.equal(report.busyEditorStayedAttached,false);
 report.sameEditorContents=first.webContents.id===firstContents;assert.ok(report.sameEditorContents);
 phase('split-resize-import');
 await choose(projects[1],true);await until(()=>win.getBrowserViews().length===2,10000);
 win.setSize(1100,760);await pause(300);for(const view of win.getBrowserViews()){const b=view.getBounds();assert.ok(b.width>=100&&b.height>=100&&b.x+b.width<=win.getContentBounds().width);}
 await ui(`[...document.querySelectorAll('button[title="Close tab"]')].find(n=>n.getAttribute('aria-label')===${JSON.stringify('Close '+projects[1].title)}).click();void 0;`);await until(()=>win.getBrowserViews().length===1,10000);
 win.webContents.send('workspace:droppedFiles',[path.join(root,'base.mp4')]);await until(()=>win.getBrowserViews().length===0,10000);
 await ui(`[...document.querySelectorAll('button')].find(n=>n.textContent==='Cancel').click();void 0;`);await until(()=>ready(projects[0].id),15000);
 report.importCancelRestoredSameEditor=viewFor(projects[0].id)?.webContents.id===firstContents;assert.ok(report.importCancelRestoredSameEditor);
 // A project editor must not be able to change the shell's visibility state.
 await first.webContents.executeJavaScript(`window.electronAPI.layoutWorkspaceViews([])`);await pause(200);report.embeddedLayoutCannotHideEditor=win.getBrowserViews().includes(first);
 if(!baseline)assert.ok(report.embeddedLayoutCannotHideEditor);else {await ui(`window.dispatchEvent(new Event('focus'));void 0;`);await until(()=>ready(projects[0].id),15000);}
 const after=await api('getProjectDocument',projects[0].id);assert.deepEqual(after.words,saved.words);assert.deepEqual(after.deletedRanges,saved.deletedRanges);assert.deepEqual(after.composition,saved.composition);
 phase('restore-tabs');
 // Restoring two saved tabs must use the current primary, not the initial null closure.
 await ui(`localStorage.setItem('edity-workspace-tabs',${JSON.stringify(JSON.stringify(projects.map(p=>p.id)))});void 0;`);
 await reload();await until(()=>ui(`document.querySelectorAll('[data-workspace-placeholder]').length>=1`),20000);await pause(4000);
 report.restoredTwoSavedPanes=win.getBrowserViews().length===2;
 if(!baseline)assert.ok(report.restoredTwoSavedPanes,'Saved split tabs were restored using a stale primary selection');
 report.hidden=!win.isVisible();report.noReopenClicks=true;report.projectContentPreserved=true;
 if(source)report.sourceUnchanged=report.sourceHash===require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex');
 report.checks.push('Delayed home/drag callbacks, busy renderer signal, split/resize/close, import cancellation, layout ownership and saved-tab restoration; no Reopen and no editor replacement');
 win.webContents.debugger.detach();phase('done');
};
