// Opt-in hidden packaged check. Uses real signed-in Edity AI and production jobs.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
module.exports=async({win,api,until,report})=>{
  if(process.env.EDITY_TEST_REAL_RESOURCES==='1')return require('./real-resource-vision-verification')({win,api,until,report});
  const root=path.dirname(process.env.EDITY_TEST_REPORT),{randomUUID}=require('node:crypto');
  const words=[['Mira',2,2.4],['l’estrella',2.5,3.1],['blava.',3.2,4],['Ara',6,6.4],['el',6.5,6.7],['títol.',6.8,8],['Final.',11.5,12]].map(([word,start,end])=>({word,start,end,confidence:1}));
  const cuts=[{id:'existing-cut',start:9,end:9.4,wordIndices:[]}];
  const project=await api('createManagedProject',path.join(root,'base.mp4'),{words,segments:[],deletedRanges:cuts,language:'ca',mediaFolders:{image:'',broll:path.join(root,'input'),music:''},
    processing:{status:'done',stage:'Ready',progress:100,sources:[],nextIndex:1,preset:'personal',customMargin:.1,engine:'crisper',model:'medium',language:'ca'},
    aiSettings:{editingInstructions:'Conserva les paraules i els talls.',mediaInstructions:'Aplica les indicacions del guió adjunt. Text editable amb Open Sans, blanc, centrat. B-roll mut, opac, a pantalla sencera. No afegeixis música.',customFillerWords:''}});
  await win.loadFile(path.join(__dirname,'../frontend/dist/index.html'),{query:{project:project.id,embedded:'1'}});
  await until(()=>win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('header button')).some(b=>b.textContent==='AI')`),30000);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('header button')).find(b=>b.textContent==='AI').click()`);
  await until(()=>win.webContents.executeJavaScript(`!!document.querySelector('[aria-label="Attach files"]')`),30000);
  // Mock only OS-picker input so there is no visible native dialog. Production
  // renderer -> sandboxed preload -> IPC -> managed copy still runs unchanged.
  const {dialog}=require('electron'),originalDialog=dialog.showOpenDialog;
  dialog.showOpenDialog=async()=>({canceled:false,filePaths:[path.join(root,'Guió.md')]});
  try{await win.webContents.executeJavaScript(`document.querySelector('[aria-label="Attach files"]').click()`);
      await until(()=>win.webContents.executeJavaScript(`document.querySelector('[aria-label="Pending attachments"]')?.textContent.includes('Guió.md')`),10000);
  }finally{dialog.showOpenDialog=originalDialog;}
  // Drag a PDF onto the conversation; prevent it becoming a workspace video.
  const pdf=fs.readFileSync(path.join(root,'Referència.pdf')).toString('base64');
  await win.webContents.executeJavaScript(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(pdf)}),c=>c.charCodeAt(0))],'Referència.pdf',{type:'application/pdf'}));document.querySelector('[aria-label="Codex conversation"]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));})()`);
  await until(()=>win.webContents.executeJavaScript(`document.querySelector('[aria-label="Pending attachments"]')?.textContent.includes('Referència.pdf')`),10000);
  // Clipboard image follows the actual DOM paste handler and managed byte upload.
  const png=fs.readFileSync(path.join(root,'reference.png')).toString('base64');
  await win.webContents.executeJavaScript(`(()=>{const dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(${JSON.stringify(png)}),c=>c.charCodeAt(0))],'reference.png',{type:'image/png'}));document.querySelector('textarea[placeholder^="Ask Codex"]').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));})()`);
  await until(()=>win.webContents.executeJavaScript(`document.querySelectorAll('[aria-label="Pending attachments"] button').length===3`),10000);
  await until(()=>win.webContents.executeJavaScript(`document.querySelector('[aria-label="Pending attachments"] img')?.naturalWidth>0`),10000);
  report.checks.push('Packaged chat uploads through its button, receives a dropped PDF and a pasted image, and displays its image preview');
  fs.writeFileSync(path.join(root,'attachments.png'),(await win.webContents.capturePage()).toPNG());
  if(process.env.EDITY_TEST_CHAT_UI_ONLY==='1'){
    // Exercise Ctrl+V and the right-click Paste callback through the actual
    // renderer/preload, without replacing or reading the user's OS clipboard.
    const {ipcMain,clipboard}=require('electron');let clipboardCalls=0;
    ipcMain.removeHandler('chat:readClipboard');
    ipcMain.handle('chat:readClipboard',async()=>{
      clipboardCalls++;
      return clipboardCalls===1?{inputs:[{path:path.join(root,'Guió.md')},{path:path.join(root,'Referència.pdf')}],text:''}
        :clipboardCalls===2?{inputs:[{path:path.join(root,'reference.png')}],text:''}:{inputs:[],text:'Text enganxat'};
    });
    try{
      await win.webContents.executeJavaScript(`document.querySelectorAll('[aria-label="Pending attachments"] button').forEach(b=>b.click())`);
      await until(()=>win.webContents.executeJavaScript(`!document.querySelector('[aria-label="Pending attachments"]')`),10000);
      const prevented=await win.webContents.executeJavaScript(`(()=>{const event=new KeyboardEvent('keydown',{key:'v',ctrlKey:true,bubbles:true,cancelable:true});document.querySelector('textarea[placeholder^="Ask Codex"]').dispatchEvent(event);return event.defaultPrevented;})()`);assert.ok(prevented);
      await until(()=>win.webContents.executeJavaScript(`document.querySelectorAll('[aria-label="Pending attachments"] button').length===2`),10000);
      win.webContents.send('chat:paste');
      await until(()=>win.webContents.executeJavaScript(`document.querySelectorAll('[aria-label="Pending attachments"] button').length===3`),10000);
      win.webContents.send('chat:paste');
      await until(()=>win.webContents.executeJavaScript(`document.querySelector('textarea[placeholder^="Ask Codex"]').value==='Text enganxat'`),10000);
      assert.equal(clipboardCalls,3);
      report.checks.push('Ctrl+V attaches multiple Explorer-style files; native-menu Paste callback attaches an image and pastes ordinary text through sandboxed IPC');
      fs.writeFileSync(path.join(root,'clipboard.png'),(await win.webContents.capturePage()).toPNG());
    }finally{ipcMain.removeHandler('chat:readClipboard');ipcMain.handle('chat:readClipboard',()=>require('./chat-attachments').readClipboardInputs(clipboard));}
    report.projectId=project.id;return;
  }
  // Enter text using the same textarea event React uses.
  await win.webContents.executeJavaScript(`(()=>{const area=document.querySelector('textarea[placeholder^="Ask Codex"]');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(area,'Segueix el guió Markdown adjunt, compara els B-rolls mirant-los i aplica també el títol que hi ha a la tercera pàgina del PDF. Fes-ho directament i mantén els talls existents.');area.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  await until(()=>win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send'&&!b.disabled)`),10000);
  await win.webContents.executeJavaScript(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Send').click()`);
  const job=await until(async()=>{const jobs=await api('listJobs',project.id);const j=jobs.find(j=>j.kind==='media-edit');if(j&&['failed','partial','cancelled'].includes(j.status))throw new Error(JSON.stringify(j));return j?.status==='complete'?j:null;},900000);
  const document=await api('getProjectDocument',project.id);
  assert.equal(document.chatMessages.find(m=>m.role==='user').attachments.length,3);
  assert.deepEqual(document.deletedRanges,cuts);
  const candidates=new Map(job.checkpoint.candidates),results=job.checkpoint.results;
  const video=Object.values(document.composition.elements).find(e=>e.kind==='video');assert.ok(video,'AI added a matching video');
  assert.equal(document.composition.assets[video.assetId].name,'02-camera-023.mp4','AI uses content over misleading name');
  const title=Object.values(document.composition.elements).find(e=>e.kind==='text');assert.ok(title);assert.equal(title.text,'VISIO CONFIRMADA');
  const inspected=results.filter(r=>r.type==='inspectResource'&&r.result?.kind==='video');assert.ok(inspected.length>=2,'AI compares multiple B-rolls');
  assert.ok(inspected.filter(r=>r.result.timeUs===2000000).length>=2,'Default inspection samples 25% of each 8-second B-roll');
  assert.ok(results.some(r=>r.type==='readAttachment'&&r.result.pages?.some(p=>p.pageIndex===2)),'AI sees the scanned third PDF page');
  report.checks.push('Real AI reads Markdown, sees the image reference and third scanned PDF page, rejects a misleadingly named clip and chooses matching B-roll by vision');
  const renderDocument=await api('getRenderDocument',project.id),backend=await api('getBackendUrl'),runtime=require('../shared/composition-runtime.cjs');
  const response=await fetch(backend+'/preview/manifest',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(require('./manifest-request').manifestRequest(renderDocument))});assert.ok(response.ok);const manifest=await response.json();
  const plan=runtime.compileComposition(renderDocument.composition,manifest,renderDocument.words);
  const interval=plan.elements.find(e=>e.id===video.id);assert.ok(interval.startUs<=2500000&&interval.endUs>=3500000,'B-roll aligns to actual spoken passage');
  const textInterval=plan.elements.find(e=>e.id===title.id);assert.equal(textInterval.startUs,6000000);assert.equal(textInterval.endUs,8000000);
  const {exportComposition}=require('./render-worker-manager');
  for(const [label,time]of [['chosen-broll',3000000],['pdf-title',7000000]])await exportComposition({plan,outputPath:path.join(root,label+'.png'),width:640,height:360,capture:true,atUs:time}).result;
  const outputPath=path.join(root,'chat-vision-sample.mp4'),exportJob=await api('startJob',{kind:'export',projectId:project.id,payload:{document:renderDocument,manifest,outputPath,width:640,height:360,format:'mp4',studioSound:false,captions:'none'}});
  await until(async()=>{const state=await api('getJob',exportJob.id);if(state.status==='failed')throw new Error(state.error);return state.status==='complete';},180000);
  assert.ok(fs.statSync(outputPath).size>10000);
  report.checks.push('Vision-selected B-roll and PDF-derived editable title render and export through the production engine with original speech cuts preserved');
  // Ask a later follow-up: the older attachment remains available through its ID.
  const followup=await api('startJob',{kind:'media-edit',projectId:project.id,payload:{requestId:randomUUID(),message:'Torna a llegir el guió Markdown que vaig adjuntar abans. No canviïs el muntatge: només confirma breument quin B-roll descrivia.'}});
  const completed=await until(async()=>{const state=await api('getJob',followup.id);if(['failed','partial','cancelled'].includes(state.status))throw new Error(JSON.stringify(state));return state.status==='complete'?state:null;},300000);
  assert.ok(completed.checkpoint.results.some(r=>r.type==='readAttachment'),'Follow-up can retrieve previous document');
  const after=await api('getProjectDocument',project.id);assert.deepEqual(after.composition.elements,document.composition.elements);assert.deepEqual(after.deletedRanges,cuts);
  report.checks.push('Follow-up rereads a previous attachment without changing the composition or transcript');
  report.projectId=project.id;report.outputPath=outputPath;report.aiResults=results;report.aiCandidates=[...candidates];report.composition=document.composition;
};
