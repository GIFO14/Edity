// Native compositor checks: attached lists and a valid DOM alone cannot prove
// that Windows has a display surface for the editor.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({app,win,api,until,report})=>{
 const root=path.dirname(process.env.EDITY_TEST_REPORT),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const phase=name=>fs.writeFileSync(path.join(root,'progress.json'),JSON.stringify({phase:name,at:new Date().toISOString()}));
 const ui=code=>win.webContents.executeJavaScript(code,true);
 const projects=[];
 const input=process.env.EDITY_TEST_REAL_DOCUMENT;
 if(input){
  const bytes=fs.readFileSync(input),doc=JSON.parse(bytes);report.sourceHash=require('node:crypto').createHash('sha256').update(bytes).digest('hex');
  doc.id='qa-native-paint';doc.title='Native paint real project';
  for(const asset of Object.values(doc.composition.assets))for(const key of ['path','previewPath','normalizedPath','thumbnailPath'])if(asset[key]&&!path.isAbsolute(asset[key]))asset[key]=path.resolve(path.dirname(input),asset[key]);
  const directory=path.join(process.env.EDITY_TEST_PROJECTS,doc.id);fs.mkdirSync(directory,{recursive:true});fs.writeFileSync(path.join(directory,'project.edity'),JSON.stringify(doc));projects.push(doc);
 }
 for(const title of ['Paint A','Paint B'])projects.push(await api('createManagedProject',path.join(root,'base.mp4'),{title,words:[{word:'Hello',start:0,end:1,confidence:1}],segments:[],deletedRanges:[],language:'en'}));
 const viewFor=id=>win.getBrowserViews().find(v=>{try{return new URL(v.webContents.getURL()).searchParams.get('project')===id;}catch{return false;}});
 async function choose(p,beside=false){
  await until(()=>ui(`!![...document.querySelectorAll('aside span[title]')].find(n=>n.title===${JSON.stringify(p.title)})`),15000);
  await ui(`(()=>{const n=[...document.querySelectorAll('aside span[title]')].find(n=>n.title===${JSON.stringify(p.title)}).closest('button');${beside?`n.parentElement.querySelector('button[title="Show beside"]').click()`:'n.click()'};})()`);
  return until(async()=>{const v=viewFor(p.id);return v&&!v.webContents.isLoading()&&await v.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Timeline"]')&&document.querySelector('video')?.readyState>=2`)?v:null;},60000);
 }
 async function painted(view,label){
  let image;
  await until(async()=>{try{image=await Promise.race([view.webContents.capturePage(),pause(1500).then(()=>{throw Error('surface timeout');})]);return image&&!image.isEmpty();}catch{return false;}},10000);
  const bitmap=image.toBitmap(),colors=new Set();for(let i=0;i<bitmap.length;i+=100)colors.add(bitmap.subarray(i,i+3).toString('hex'));
  assert.ok(colors.size>20,`${label}: editor has a DOM but no painted surface`);
  fs.writeFileSync(path.join(root,label+'.png'),image.toPNG());return {label,size:image.getSize(),sampleColors:colors.size};
 }
 phase('open-hidden');const first=await choose(projects[0]),firstId=first.webContents.id,saved=await api('getProjectDocument',projects[0].id);
 win.showInactive();await pause(150);if(!win.isVisible())win.showInactive();
 report.electron=process.versions.electron;report.native=true;report.surfaces=[await painted(first,'initial')];
 phase('hidden-switch-and-restore');
 for(let i=0;i<3;i++){
  win.hide();await choose(projects[1]);await choose(projects[0]);win.showInactive();await pause(150);
  report.surfaces.push(await painted(first,'hidden-switch-'+i));assert.equal(viewFor(projects[0].id)?.webContents.id,firstId);
 }
 phase('minimize-and-resize');
 for(let i=0;i<3;i++){
  win.minimize();await pause(200);await api('openWorkspaceView',projects[0].id);win.restore();win.setSize(1100+i*30,760+i*20);await pause(250);
  report.surfaces.push(await painted(first,'restored-'+i));
 }
 phase('split');await choose(projects[1],true);assert.equal(win.getBrowserViews().length,2);
 for(const view of win.getBrowserViews())report.surfaces.push(await painted(view,'split-'+view.webContents.id));
 await ui(`[...document.querySelectorAll('button[title="Close tab"]')].find(n=>n.getAttribute('aria-label')===${JSON.stringify('Close '+projects[1].title)}).click();void 0;`);await until(()=>win.getBrowserViews().length===1,10000);
 phase('playback');
 await first.webContents.executeJavaScript(`(()=>{const v=document.querySelector('video');v.muted=true;v.currentTime=0;return v.play();})()`);await pause(1200);
 const current=await first.webContents.executeJavaScript(`({time:document.querySelector('video').currentTime,paused:document.querySelector('video').paused})`);assert.ok(current.time>.3&&!current.paused);
 await first.webContents.executeJavaScript(`document.querySelector('video').pause();void 0;`);report.playback=current;
 const idleMs=Number(process.env.EDITY_TEST_NATIVE_IDLE_MS||0);if(idleMs){phase('native-idle');await pause(idleMs);report.surfaces.push(await painted(first,'after-idle'));report.idleMs=idleMs;}
 const after=await api('getProjectDocument',projects[0].id);for(const key of ['words','deletedRanges','composition'])assert.deepEqual(after[key],saved[key]);
 assert.equal(first.webContents.id,firstId);report.sameEditorContents=true;report.noReopenOrReload=true;report.projectUnchanged=true;
 if(input)assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync(input)).digest('hex'),report.sourceHash);
 win.hide();phase('done');report.checks.push('Real native display surfaces, hidden tab switches, minimize/restore, resizing, split view, playback and original project preservation; same editor, no Reopen or reload');
};
