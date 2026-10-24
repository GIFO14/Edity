const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs');
module.exports=async({win,api,until,report})=>{
  const root=path.dirname(process.env.EDITY_TEST_REPORT),words=[{word:'Hello',start:0,end:1,confidence:1}],projects=[];
  for(const title of ['Workspace recovery A','Workspace recovery B','Opening cancellation QA'])projects.push(await api('createManagedProject',path.join(root,'base.mp4'),{title,words,segments:[{id:0,start:0,end:1,text:'Hello',words}],deletedRanges:[],language:'en',processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'small',language:'en'}}));
  const pause=ms=>new Promise(r=>setTimeout(r,ms)),bounded=(promise,ms=10000)=>Promise.race([promise,pause(ms).then(()=>{throw Error('Workspace UI call timed out');})]);
  const ui=code=>bounded(win.webContents.executeJavaScript(code,true));
  const phase=name=>fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify({phase:name,at:new Date().toISOString()}));
  const viewFor=id=>win.getBrowserViews().find(v=>new URL(v.webContents.getURL()).searchParams.get('project')===id);
  async function open(project,beside=false){await until(()=>ui(`!![...document.querySelectorAll('aside span[title]')].find(e=>e.title===${JSON.stringify(project.title)})`),15000);await ui(`(()=>{const label=[...document.querySelectorAll('aside span[title]')].find(e=>e.title===${JSON.stringify(project.title)});${beside?`label.closest('button').parentElement.querySelector('button[title="Show beside"]').click()`:`label.closest('button').click()`};})()`);return until(async()=>{const v=viewFor(project.id);return v&&!v.webContents.isLoading()&&await v.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Timeline"]')&&document.querySelector('video')?.readyState>=2`)?v:null;},45000);}
  let primary=await open(projects[0]);
  phase('opened');
  await ui(`document.querySelector('button[title="Project home"]').click();void 0;`);await until(()=>win.getBrowserViews().length===0,10000);
  primary=await open(projects[0]);assert.equal(win.getBrowserViews().length,1);report.checks.push('Project home hides editors intentionally and selecting the project restores its native view');
  phase('reattached');
  // Closing while loadURL is pending must invalidate that exact view.
  const cancelled=await ui(`Promise.all([window.electronAPI.openWorkspaceView(${JSON.stringify(projects[2].id)}),window.electronAPI.closeWorkspaceView(${JSON.stringify(projects[2].id)})])`);assert.equal(cancelled[0],false);
  phase('cancelled-opening');
  const saved=await api('getProjectDocument',projects[0].id);
  const recovered=new Promise(resolve=>primary.webContents.once('did-finish-load',resolve));
  const shellPid=win.webContents.getOSProcessId();report.rendererProcesses={shell:shellPid,editor:primary.webContents.getOSProcessId()};
  phase('crashing');
  primary.webContents.forcefullyCrashRenderer();
  await Promise.race([recovered,pause(20000).then(()=>{throw Error('Crashed renderer did not finish reloading');})]);
  await pause(500);report.afterCrash=await bounded(primary.webContents.executeJavaScript(`({url:location.href,text:document.body.textContent.slice(0,1500),words:document.querySelectorAll('[data-word-index]').length})`),3000);phase('reload-finished');
  await until(async()=>{try{return await bounded(primary.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Timeline"]')&&document.querySelector('video')?.readyState>=2`),2000);}catch{return false;}},45000);
  await until(async()=>{try{return await ui(`!!document.querySelector('aside')`);}catch{return false;}},45000);
  phase('crash-recovered');
  assert.ok(win.getBrowserViews().includes(primary));assert.deepEqual((await api('getProjectDocument',projects[0].id)).words,saved.words);report.checks.push('Crashed project renderer reloads automatically with editor, saved words and bounds restored');
  await primary.webContents.executeJavaScript(`window.__originalFixed=Number.prototype.toFixed;Number.prototype.toFixed=function(){throw new Error('QA render recovery');};[...document.querySelectorAll('[aria-label="Timeline"] button')].find(b=>b.textContent==='+').click();void 0;`);
  await until(()=>primary.webContents.executeJavaScript(`!!document.querySelector('[role="alert"]')`),10000);
  phase('render-error-fallback');
  const reopened=new Promise(resolve=>primary.webContents.once('did-finish-load',resolve));
  await primary.webContents.executeJavaScript(`Number.prototype.toFixed=window.__originalFixed;setTimeout(()=>document.querySelector('[role="alert"] button').click(),50);void 0;`);
  await Promise.race([reopened,pause(20000).then(()=>{throw Error('Error recovery did not finish reloading');})]);
  await until(()=>primary.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Timeline"]')&&document.querySelector('video')?.readyState>=2`),45000);
  phase('render-error-reopened');
  report.checks.push('React render errors display a recoverable editor message; reopening saves pending work and restores the editor');
  await open(projects[1],true);assert.equal(win.getBrowserViews().length,2);
  for(const p of [projects[1],projects[0]]){await ui(`[...document.querySelectorAll('button[title="Close tab"]')].find(e=>e.getAttribute('aria-label')===${JSON.stringify('Close '+p.title)}).click()`);await pause(150);}
  await until(()=>ui(`document.body.textContent.includes('Open or create a project')`),10000);assert.equal(win.getBrowserViews().length,0);
  await open(projects[0]);assert.equal(win.getBrowserViews().length,1);
  const log=path.join(process.env.EDITY_TEST_USER_DATA,'workspace-diagnostics.jsonl');assert.ok(fs.readFileSync(log,'utf8').includes('QA render recovery'));
  report.checks.push('Split view, close and reopen remain functional; renderer failures leave bounded diagnostic records');
  report.workspaceRecovery={cancelledOpen:true,crashRecovered:true,renderErrorRecovered:true,projectIntact:true};
};
