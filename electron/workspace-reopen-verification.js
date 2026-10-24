// Native BrowserViews and shell UI, isolated projects/user-data only.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({app,win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),pause=ms=>new Promise(r=>setTimeout(r,ms)),baseline=process.env.EDITY_TEST_BASELINE==='1';
 const ui=code=>win.webContents.executeJavaScript(code,true),projects=[];
 for(const title of ['Reopen recovery A','Reopen recovery B','Blocked opening','Opening timeout'])projects.push(await api('createManagedProject',path.join(root,'base.mp4'),{title,words:[{word:'Hello',start:0,end:1,confidence:1}],segments:[],deletedRanges:[],language:'en'}));
 if(process.env.EDITY_TEST_REAL_DOCUMENT){
  const source=process.env.EDITY_TEST_REAL_DOCUMENT,doc=JSON.parse(fs.readFileSync(source,'utf8'));report.sourceHash=require('node:crypto').createHash('sha256').update(fs.readFileSync(source)).digest('hex');
  doc.id='qa-real-workspace';doc.title='Reopen real project QA';
  for(const asset of Object.values(doc.composition.assets))for(const key of ['path','previewPath','normalizedPath','thumbnailPath'])if(asset[key]&&!path.isAbsolute(asset[key]))asset[key]=path.resolve(path.dirname(source),asset[key]);
  const dest=path.join(process.env.EDITY_TEST_PROJECTS,doc.id);fs.mkdirSync(dest,{recursive:true});fs.writeFileSync(path.join(dest,'project.edity'),JSON.stringify(doc));projects[0]=doc;
 }
 const viewFor=id=>win.getBrowserViews().find(v=>{try{return new URL(v.webContents.getURL()).searchParams.get('project')===id;}catch{return false;}});
 const ready=async id=>{const view=viewFor(id);try{return view&&!view.webContents.isDestroyed()&&!view.webContents.isLoading()&&await view.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Timeline"]')&&document.querySelector('video')?.readyState>=2`)?view:null;}catch{return null;}};
 async function choose(project){await until(()=>ui(`!![...document.querySelectorAll('aside span[title]')].find(n=>n.title===${JSON.stringify(project.title)})`),15000);await ui(`[...document.querySelectorAll('aside span[title]')].find(n=>n.title===${JSON.stringify(project.title)}).closest('button').click();void 0;`);}
 async function reopen(id){await ui(`document.querySelector('[data-workspace-placeholder="${id}"] button').click();void 0;`);}
 await choose(projects[0]);let first=await until(()=>ready(projects[0].id),90000);const firstId=first.webContents.id,saved=await api('getProjectDocument',projects[0].id);
 report.initialBounds=first.getBounds();assert.ok(report.initialBounds.width>100&&report.initialBounds.height>100);
 // Simulate the lifecycle signal Electron gives for a stuck editor. A layout
 // pass must not silently reattach the failed view, and Reopen must replace it.
 first.webContents.emit('unresponsive');await pause(150);
 await api('layoutWorkspaceViews',[{id:projects[0].id,x:192,y:44,width:900,height:700}]);
 report.failedViewStayedDetached=!win.getBrowserViews().includes(first);
 await reopen(projects[0].id);await pause(1600);
 let replacement=await ready(projects[0].id);report.replacedUnresponsive=!!replacement&&replacement.webContents.id!==firstId;
 if(!baseline){replacement=await until(()=>ready(projects[0].id),45000);report.replacedUnresponsive=replacement.webContents.id!==firstId;assert.ok(report.replacedUnresponsive);}
 // A real beforeunload snapshot must be saved before the old editor is closed.
 const active=replacement||first;
 await active.webContents.executeJavaScript(`window.addEventListener('beforeunload',()=>window.electronAPI.saveManagedProjectSync(${JSON.stringify(projects[0].id)},{revision:${(await api('getProjectDocument',projects[0].id)).revision},changes:{playhead:12.5}}),{once:true});void 0;`);
 const beforeFlush=active.webContents.id;await reopen(projects[0].id);await pause(1400);if(!baseline)await until(()=>ready(projects[0].id),45000);const flushed=await api('getProjectDocument',projects[0].id);
 report.flushedBeforeReplace=flushed.playhead===12.5;report.secondReplacement=viewFor(projects[0].id)?.webContents.id!==beforeFlush;
 assert.deepEqual(flushed.words,saved.words);assert.deepEqual(flushed.deletedRanges,saved.deletedRanges);assert.deepEqual(flushed.composition,saved.composition);
 if(!baseline){
  const stuck=await ready(projects[0].id),stuckId=stuck.webContents.id,execute=stuck.webContents.executeJavaScript.bind(stuck.webContents);
  stuck.webContents.executeJavaScript=(code,...args)=>code.includes('dispatchEvent(new Event("beforeunload"))')?new Promise(()=>{}):execute(code,...args);
  const began=Date.now();await reopen(projects[0].id);const fresh=await until(async()=>{const next=await ready(projects[0].id);return next&&next.webContents.id!==stuckId?next:null;},45000);report.hungFlushRecovered=fresh.webContents.id!==stuckId;report.hungFlushRecoveryMs=Date.now()-began;assert.ok(report.hungFlushRecovered&&report.hungFlushRecoveryMs<15000);
 }
 // Hold one navigation forever without hanging the test process itself.
 const holds=new Set([projects[2].id,projects[3].id]),held=new Map();
 const intercept=(_event,contents)=>{const load=contents.loadURL.bind(contents);contents.loadURL=(url,...args)=>{const id=new URL(url).searchParams.get('project');if(holds.delete(id)){held.set(id,contents);return new Promise(()=>{});}return load(url,...args);};};app.on('web-contents-created',intercept);
 try{
  await choose(projects[2]);await until(()=>held.has(projects[2].id),10000);const old=held.get(projects[2].id);
  report.pendingPlaceholder=await ui(`!!document.querySelector('[data-workspace-placeholder="${projects[2].id}"]')`);
  if(report.pendingPlaceholder){await reopen(projects[2].id);await pause(1600);report.replacedPending=!!await ready(projects[2].id)&&old.isDestroyed();}else report.replacedPending=false;
  if(!baseline)assert.ok(report.replacedPending,'Reopen must bypass both pending-open caches');
  await choose(projects[3]);await until(()=>held.has(projects[3].id),10000);await pause(2400);
  report.timeoutVisible=await ui(`document.querySelector('[data-workspace-placeholder="${projects[3].id}"]')?.textContent.includes('timed out')||false`);
  if(report.timeoutVisible){await reopen(projects[3].id);await until(()=>ready(projects[3].id),45000);report.timeoutRecovered=true;}else report.timeoutRecovered=false;
 }finally{app.removeListener('web-contents-created',intercept);}
 await choose(projects[0]);await until(()=>ready(projects[0].id),45000);await choose(projects[1]);await until(()=>ready(projects[1].id),45000);
 report.checks.push('Actual shell Reopen replaces failed native views, saves pending snapshots, bypasses stalled opening promises and recovers after a bounded navigation timeout');
 report.hidden=!win.isVisible();
 if(process.env.EDITY_TEST_REAL_DOCUMENT)report.sourceUnchanged=report.sourceHash===require('node:crypto').createHash('sha256').update(fs.readFileSync(process.env.EDITY_TEST_REAL_DOCUMENT)).digest('hex');
 if(!baseline){for(const key of ['failedViewStayedDetached','replacedUnresponsive','flushedBeforeReplace','secondReplacement','pendingPlaceholder','replacedPending','timeoutVisible','timeoutRecovered'])assert.ok(report[key],key);if(process.env.EDITY_TEST_REAL_DOCUMENT)assert.ok(report.sourceUnchanged);}
 else assert.equal(report.replacedUnresponsive,false,'Baseline must reproduce the ineffective recovery button');
};
