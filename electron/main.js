const { app, BrowserWindow, BrowserView, Menu, ipcMain, dialog, safeStorage, shell, clipboard } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { PythonBackend } = require('./python-bridge');
const { createProjectStore } = require('./project-store');
const { ProjectRepository, diff } = require('./project-repository');
const { wordIds } = require('./composition-migration');
const { randomUUID } = require('node:crypto');
const { JobCoordinator } = require('./job-coordinator');
const {registerMediaJobs}=require('./media-jobs');
const {prepareProjectAssets}=require('./project-asset-preparation');
const {assetPaths}=require('./asset-library');
const {registerMediaOrchestrator}=require('./media-edit-orchestrator');
const {registerProcessingJobs}=require('./processing-jobs');
const {EditingLibrary}=require('./editing-library');
const { migrateLegacyProjects, migrateLegacyUserData } = require('./project-migration');

let mainWindow = null;
let pythonBackend = null;
let projectStore = null;
let projectRepository = null;
let jobCoordinator = null;
let processingJobs=null;
let editingLibrary=null;
let agentBridge=null;
let projectDefaults=null;
let narrationEditor=null;
let deletionCleanupTimer = null;
let deletionCleanupRunning = false;
const projectViews = new Map();
const openingViews = new Map();
const cancelOpeningViews = new Map();
const workspaceLayout=new (require('./workspace-layout').WorkspaceLayout)();
const closingProjectViews = new Map();
let fullscreenProjectId=null;
function workspaceDiagnostic(kind,id,detail){
  try{const fs=require('node:fs'),file=path.join(app.getPath('userData'),'workspace-diagnostics.jsonl');if(fs.existsSync(file)&&fs.statSync(file).size>512000)fs.renameSync(file,file+'.previous');fs.appendFileSync(file,JSON.stringify({at:new Date().toISOString(),kind,projectId:id,detail:String(detail).slice(0,6000)})+'\n');}catch{}
}
function workspaceViewState(id,status,message=''){
  if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send('workspace:viewState',{id,status,message});
}
function layoutWorkspaceViews(){
  if(!mainWindow||mainWindow.isDestroyed())return;
  const content=mainWindow.getContentBounds();
  for(const [id,view] of projectViews){
    if(view.webContents.isDestroyed()){projectViews.delete(id);workspaceViewState(id,'error','The editor closed unexpectedly.');continue;}
    const area=fullscreenProjectId?(id===fullscreenProjectId?{x:0,y:0,width:content.width,height:content.height}:undefined):workspaceLayout.panes.find(p=>p.id===id);
    if(view.workspaceFailed||view.workspaceLoading){mainWindow.removeBrowserView(view);continue;}
    if(!area){
      if(mainWindow.getBrowserViews().includes(view))workspaceDiagnostic('view-detached',id,workspaceLayout.suppressed?'File import overlay':workspaceLayout.activeIds.length?'Inactive tab':'Project home');
      view.webContents.send('workspace:visible',false);view.webContents.setBackgroundThrottling(true);mainWindow.removeBrowserView(view);continue;
    }
    const values=['x','y','width','height'].map(k=>Math.floor(area[k]));
    if(values.some(v=>!Number.isFinite(v))||values[2]<100||values[3]<100)continue;
    const x=Math.max(0,Math.min(content.width-1,values[0])),y=Math.max(0,Math.min(content.height-1,values[1]));
    view.setBounds({x,y,width:Math.max(1,Math.min(values[2],content.width-x)),height:Math.max(1,Math.min(values[3],content.height-y))});
    view.webContents.setBackgroundThrottling(false);view.webContents.send('workspace:visible',true);
    if(!mainWindow.getBrowserViews().includes(view)){mainWindow.addBrowserView(view);workspaceDiagnostic('view-attached',id,`Layout generation ${workspaceLayout.generation}`);}
  }
}

const isDev = !app.isPackaged;
const headless=process.env.EDITY_HEADLESS==='1';
let BACKEND_PORT = Number(process.env.EDITY_BACKEND_PORT||8643);
if(headless&&process.env.EDITY_TEST_USER_DATA)app.setPath('userData',process.env.EDITY_TEST_USER_DATA);

if(!headless)migrateLegacyUserData(app.getPath('appData'));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: 'Edity',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      offscreen:headless&&process.env.EDITY_TEST_NATIVE_PAINT!=='1',backgroundThrottling:!headless,
      webSecurity: isDev ? false : true,
    },
    show: false,
  });

  if (isDev&&!headless) {
    mainWindow.loadURL('http://localhost:5173/?shell=1');
    if (!process.env.EDITY_LAUNCHER) mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'),
      { query: { shell: '1',...(headless&&process.env.EDITY_VERIFY_BUILD!=='1'?{agentSession:'1'}:{}) } });
  }

  mainWindow.once('ready-to-show', () => {
    if(!headless)mainWindow.show();
  });
  // Element fullscreen in an embedded editor needs its native BrowserView to
  // span the window as well; CSS fullscreen alone retains the left pane bounds.
  for(const event of ['resize','enter-full-screen','leave-full-screen'])mainWindow.on(event,()=>{if(fullscreenProjectId)layoutWorkspaceViews();});
  const shellFailures=[];
  mainWindow.webContents.on('did-start-navigation',(_event,_url,_inPlace,isMainFrame)=>{if(isMainFrame)workspaceLayout.reset();});
  mainWindow.webContents.on('render-process-gone',(_event,details)=>{
    workspaceDiagnostic('shell-render-process-gone','shell',JSON.stringify(details));
    const now=Date.now();while(shellFailures.length&&now-shellFailures[0]>60000)shellFailures.shift();shellFailures.push(now);
    const window=mainWindow;if(shellFailures.length<=2)setTimeout(()=>{if(window&&!window.isDestroyed())window.webContents.reload();},350);
  });

  mainWindow.on('closed', () => {
    projectViews.clear();
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  projectStore = createProjectStore(headless&&process.env.EDITY_TEST_PROJECTS?process.env.EDITY_TEST_PROJECTS:migrateLegacyProjects(app.getPath('documents')));
  projectRepository = new ProjectRepository(projectStore);
  narrationEditor=require('./narration-commands').narrationCommands(projectRepository);
  jobCoordinator = new JobCoordinator(path.join(app.getPath('userData'),'jobs'),projectRepository);
  editingLibrary=new EditingLibrary(app.getPath('userData'));
  editingLibrary.on('changed',()=>{for(const contents of [mainWindow?.webContents,...[...projectViews.values()].map(v=>v.webContents)])if(contents&&!contents.isDestroyed())contents.send('editingLibrary:changed');});
  projectDefaults=new (require('./project-defaults').ProjectDefaults)(app.getPath('userData'),{inheritFile:process.env.EDITY_AGENT_DEFAULTS_FILE});
  projectDefaults.on('changed',defaults=>{for(const contents of [mainWindow?.webContents,...[...projectViews.values()].map(v=>v.webContents)])if(contents&&!contents.isDestroyed())contents.send('defaults:changed',defaults);});
  for(const p of projectStore.list()){try{const document=projectRepository.getDocument(p.id),profile=document.instructionProfile;if(profile&&(profile.text||profile.mediaText)){const id=`legacy-${p.id}`;if(!editingLibrary.read().profiles[id])editingLibrary.save('profiles',{...profile,id,name:document.title||profile.name});}}catch(error){console.warn('Project profile unavailable',p.id,error.message);}}
  projectStore.setCommitHandler((id,data)=>{
    const current=projectRepository.getDocument(id),changes={};
    const fields=['title','sourceVideoPath','words','segments','deletedRanges','soundEvents','mediaItems','chatMessages','language','clips','mediaFolders','studioSoundEnabled','aiSettings','instructionProfile','processing','videoPath','playhead'];
    for(const key of fields)if(JSON.stringify(current[key])!==JSON.stringify(data[key])&&Object.hasOwn(data,key))changes[key]=data[key];
    if(changes.words)changes.words=wordIds(changes.words,id);
    const operations=[];
    if(changes.videoPath){const base=current.composition.assets[current.composition.elements.base.assetId],relative=path.relative(path.join(projectStore.root,id),changes.videoPath),assetId=`base-${randomUUID()}`;operations.push({type:'asset',asset:{...base,id:assetId,path:relative&&!relative.startsWith('..')?relative.replace(/\\/g,'/'):changes.videoPath,hash:'',status:'ready'}},{type:'update',id:'base',changes:{assetId}});}
    return projectRepository.commit({id:randomUUID(),projectId:id,baseRevision:current.revision,actor:'migration',label:'Update project',operations,documentChanges:changes,skipHistory:Object.keys(changes).every(key=>['processing','playhead'].includes(key))});
  });
  projectRepository.on('commit',(id,ack)=>{
    jobCoordinator.pump();
    const view=projectViews.get(id);if(view&&!view.webContents.isDestroyed())view.webContents.send('project:changed',ack);
    if(mainWindow&&!mainWindow.isDestroyed()){mainWindow.webContents.send('project:summaryChanged',id);mainWindow.webContents.send('project:changed',ack);}
  });
  jobCoordinator.on('changed',job=>{for(const contents of [mainWindow?.webContents,projectViews.get(job.projectId)?.webContents])if(contents&&!contents.isDestroyed())contents.send('job:changed',job);});
  const cleanupDeletedProjects = async () => {
    if (deletionCleanupRunning) return;
    deletionCleanupRunning = true;
    try {
      await projectStore.cleanupPending((directory) => shell.trashItem(directory));
    } catch (error) {
      console.warn('Deferred project cleanup failed:', error);
    } finally {
      deletionCleanupRunning = false;
    }
  };
  await cleanupDeletedProjects();
  deletionCleanupTimer = setInterval(() => { void cleanupDeletedProjects(); }, 5000);
  deletionCleanupTimer.unref?.();
  pythonBackend = new PythonBackend(BACKEND_PORT, isDev);
  try {
    await pythonBackend.start();
    BACKEND_PORT=pythonBackend.port;
  } catch (error) {
    if(headless)console.error(error);else dialog.showErrorBox('Edity could not start', `${error.message}\n\nInstall the Python dependencies with the setup script and check that FFmpeg is available.`);
    app.quit();
    return;
  }

  const mediaServices=registerMediaJobs(jobCoordinator,projectRepository,`http://127.0.0.1:${BACKEND_PORT}`);
  require('./chat-attachments').registerChatAttachments({ipcMain,dialog,Menu,BrowserWindow,clipboard,repository:projectRepository});
  registerMediaOrchestrator(jobCoordinator,projectRepository,mediaServices,{editingLibrary});
  processingJobs=registerProcessingJobs(jobCoordinator,projectRepository,mediaServices);
  for(const project of projectStore.list())if(project.processing&&['queued','running'].includes(project.processing.status))processingJobs.ensure(project.id);
  if(process.env.EDITY_AGENT_BRIDGE!=='0'){
    try{
      const {startLocalAgentBridge}=require('./local-agent-bridge'),{createExternalAgentTools}=require('./external-agent-tools');
      const artifacts=new Map(),tools=createExternalAgentTools({store:projectStore,repository:projectRepository,coordinator:jobCoordinator,services:mediaServices,processingJobs,editingLibrary,projectDefaults,artifacts,stateDirectory:path.join(app.getPath('userData'),'agent-state'),showProject:async id=>{if(!headless||process.env.EDITY_TEST_WORKSPACE_UI==='1')mainWindow?.webContents.send('workspace:openProject',id);}});
      agentBridge=await startLocalAgentBridge({directory:process.env.EDITY_AGENT_BRIDGE_DIRECTORY||path.join(process.env.LOCALAPPDATA||app.getPath('userData'),'Edity','agent-bridge','instances'),methods:tools.methods,artifacts,info:{mode:headless&&process.env.EDITY_TEST_PROJECTS&&process.env.EDITY_TEST_USER_DATA?'isolated':'desktop',appVersion:app.getVersion(),projectsRoot:projectStore.root,executable:process.execPath},onClose:()=>app.quit()});
    }catch(error){console.error('Local agent bridge unavailable:',error.message);}
  }
  createWindow();
  if(headless&&process.env.EDITY_VERIFY_BUILD==='1'){void require('./packaged-verification')({app,window:mainWindow}).then(()=>app.quit()).catch(error=>{console.error(error);process.exitCode=1;app.quit();});app.on('will-quit',()=>app.exit(process.exitCode||0));}

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

let shuttingDown=false;
app.on('before-quit', event => {
  if (deletionCleanupTimer) clearInterval(deletionCleanupTimer);
  if(jobCoordinator&&!shuttingDown){event.preventDefault();shuttingDown=true;void Promise.allSettled([agentBridge?.close(),jobCoordinator.shutdown()]).finally(()=>{pythonBackend?.stop();app.quit();});return;}
  if (pythonBackend) {
    pythonBackend.stop();
  }
});

// IPC Handlers

ipcMain.handle('dialog:openFile', async (_event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] },
      { name: 'Audio Files', extensions: ['m4a', 'wav', 'mp3', 'flac'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] },
      { name: 'All Files', extensions: ['*'] },
    ],
    ...options,
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('dialog:saveFile', async (_event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: [
      { name: 'Video Files', extensions: ['mp4', 'mov', 'webm'] },
      { name: 'Project Files', extensions: ['edity'] },
    ],
    ...options,
  });
  return result.canceled ? null : result.filePath;
});

ipcMain.handle('dialog:openProject', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'Edity Project', extensions: ['edity', 'aive'] },
    ],
  });
  return result.canceled ? null : result.filePaths[0];
});

ipcMain.handle('safe-storage:encrypt', (_event, data) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(data).toString('base64');
  }
  return data;
});

ipcMain.handle('safe-storage:decrypt', (_event, encrypted) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
  }
  return encrypted;
});

ipcMain.handle('get-backend-url', () => {
  return `http://localhost:${BACKEND_PORT}`;
});

ipcMain.handle('fs:readFile', async (_event, filePath) => {
  const fs = require('fs');
  return fs.readFileSync(filePath, 'utf-8');
});

ipcMain.handle('fs:writeFile', async (_event, filePath, content) => {
  const fs = require('fs');
  fs.writeFileSync(filePath, content, 'utf-8');
  return true;
});

ipcMain.handle('dialog:openVideoFiles', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'mkv', 'webm'] }],
  });
  return result.canceled ? [] : result.filePaths;
});

ipcMain.handle('projects:list', () => projectStore.list());
ipcMain.handle('defaults:initialize',(_event,legacy)=>projectDefaults.initialize(legacy));
ipcMain.handle('defaults:get',()=>projectDefaults.wait());
ipcMain.handle('defaults:update',(_event,changes,revision)=>projectDefaults.update(changes,revision));
ipcMain.handle('narration:get',(event,id)=>{assertProjectSender(event,id);return narrationEditor.get(id);});
ipcMain.handle('narration:mutate',(event,kind,params)=>{assertProjectSender(event,params.projectId);if(!['move','cut','paste'].includes(kind))throw new Error('Unknown narration edit');return narrationEditor.mutate(kind,params,{actor:'manual',transactionId:params.idempotencyKey});});
ipcMain.handle('narration:copyText',(event,id,wordIds)=>{assertProjectSender(event,id);const result=narrationEditor.copyText(id,wordIds);clipboard.writeText(result.text);return result;});
ipcMain.handle('projects:open', (_event, id) => {const document=projectRepository.getDocument(id);prepareProjectAssets(jobCoordinator,projectRepository,document);return document;});
ipcMain.handle('projects:create', (event, sourcePath, initialState, progressChannel) =>
  projectStore.create(sourcePath, initialState, progressChannel
    ? (progress) => event.sender.send(progressChannel, progress) : undefined).then(project=>projectRepository.getDocument(project.id)));
ipcMain.handle('projects:createPending', async (_event, sourcePaths, options) => {
  await projectDefaults.wait();const resolved=projectDefaults.options(options||{});
  const project=projectStore.createPending(sourcePaths, {...options,...resolved});processingJobs.ensure(project.id);return projectRepository.getDocument(project.id);
});
ipcMain.handle('projects:updateProcessing', (_event, id, patch) =>
  projectStore.updateProcessing(id, patch));
ipcMain.handle('projects:finishFirstClip', (_event, id, sourcePath) =>
  projectStore.finishFirstClip(id, sourcePath));
ipcMain.on('workspace:droppedFiles', (_event, paths) => {
  if (Array.isArray(paths)) mainWindow?.webContents.send('workspace:droppedFiles', paths);
});

ipcMain.handle('workspace:openView', async (_event, id, options={}) => {
  projectStore.open(id);
  if(options?.force===true){
    const previous=projectViews.get(id);
    workspaceDiagnostic('reopen-requested',id,'Replacing editor view');
    // Flush a responsive editor before replacement. A hung renderer must not
    // hold the recovery button hostage; saved project data remain authoritative.
    if(previous&&!previous.webContents.isDestroyed()&&!previous.webContents.isCrashed()){
      let timeout;try{await Promise.race([previous.webContents.executeJavaScript('window.dispatchEvent(new Event("beforeunload"));true').catch(()=>{}),new Promise(resolve=>{timeout=setTimeout(resolve,500);})]);}finally{clearTimeout(timeout);}
    }
    if(projectViews.get(id)===previous)closeWorkspaceView(id);
  }
  if (openingViews.has(id)) return openingViews.get(id);
  const existing=projectViews.get(id);
  if(existing&&!existing.webContents.isDestroyed()){
    if(existing.webContents.isCrashed()||existing.needsReload){closeWorkspaceView(id);}
    else{layoutWorkspaceViews();workspaceViewState(id,'ready');return true;}
  }
  projectViews.delete(id);
  const opening = (async () => {
  const view = new BrowserView({ webPreferences: {
    preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
    nodeIntegration: false, backgroundThrottling: false,
    webSecurity: isDev ? false : true,
  } });
  const contentsId=view.webContents.id;
  view.workspaceLoading=true;
  const bounds=mainWindow.getContentBounds();
  // A new unattached BrowserView otherwise starts at 0x0. Give virtualized
  // transcript/layout code a real viewport during initial navigation.
  view.setBounds({x:192,y:44,width:Math.max(100,bounds.width-192),height:Math.max(100,bounds.height-44)});
  let cancelOpen;const cancelled=new Promise(resolve=>{cancelOpen=()=>resolve(false);});
  cancelOpeningViews.set(id,cancelOpen);
  // Register before navigation: closing a still-loading tab must close this
  // exact view, and layout requests arriving during load must not be lost.
  projectViews.set(id,view);workspaceViewState(id,'loading');
  const failures=[];
  view.webContents.on('console-message',(_event,level,message)=>{if(level===3)workspaceDiagnostic('renderer-console',id,message);});
  view.webContents.on('enter-html-full-screen',()=>{if(projectViews.get(id)===view){fullscreenProjectId=id;layoutWorkspaceViews();}});
  view.webContents.on('leave-html-full-screen',()=>{if(fullscreenProjectId===id){fullscreenProjectId=null;layoutWorkspaceViews();}});
  // A busy renderer is still a live editor. Detaching it on a transient stall
  // made normal editing disappear behind the shell's recovery placeholder.
  view.webContents.on('unresponsive',()=>{if(projectViews.get(id)===view){view.needsReload=true;workspaceDiagnostic('unresponsive',id,'Editor busy; retaining its native view');workspaceViewState(id,'error','The editor is busy. Waiting for it to respond…');}});
  view.webContents.on('responsive',()=>{if(projectViews.get(id)===view&&!view.workspaceFailed&&!view.workspaceLoading){view.needsReload=false;layoutWorkspaceViews();workspaceViewState(id,'ready');}});
  view.webContents.on('render-process-gone',(_event,details)=>{
    if(projectViews.get(id)!==view||!mainWindow||mainWindow.isDestroyed())return;
    workspaceDiagnostic('render-process-gone',id,JSON.stringify(details));
    view.workspaceFailed=true;
    mainWindow.removeBrowserView(view);
    const now=Date.now();while(failures.length&&now-failures[0]>60000)failures.shift();failures.push(now);
    if(failures.length<=2){workspaceViewState(id,'loading','Recovering editor…');setTimeout(()=>{if(projectViews.get(id)===view&&!view.webContents.isDestroyed())view.webContents.reload();},300);}
    else{mainWindow.removeBrowserView(view);workspaceViewState(id,'error','The editor stopped repeatedly. Reopen it to try again.');}
  });
  view.webContents.on('did-finish-load',()=>{if(projectViews.get(id)===view){view.workspaceLoading=false;view.workspaceFailed=false;view.needsReload=false;layoutWorkspaceViews();workspaceViewState(id,'ready');}});
  view.webContents.on('did-fail-load',(_event,code,description,_url,isMainFrame)=>{if(isMainFrame&&code!==-3&&projectViews.get(id)===view){view.workspaceFailed=true;view.needsReload=true;workspaceDiagnostic('load-failed',id,description);mainWindow?.removeBrowserView(view);workspaceViewState(id,'error',description);}});
  view.webContents.on('destroyed',()=>{closingProjectViews.delete(contentsId);if(projectViews.get(id)===view){projectViews.delete(id);workspaceViewState(id,'error','The editor closed unexpectedly.');}});
  const query = { project: id, embedded: '1' };
  let loadTimeout;
  try{
  let navigation;
  if (isDev&&!headless) navigation=view.webContents.loadURL(`http://localhost:5173/?${new URLSearchParams(query)}`);
  else {
    const file = pathToFileURL(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
    file.search = new URLSearchParams(query).toString();
    navigation=view.webContents.loadURL(file.toString());
  }
  const limit=headless&&process.env.EDITY_VERIFY_BUILD==='1'?Number(process.env.EDITY_TEST_WORKSPACE_TIMEOUT_MS||20000):20000;
  const loaded=await Promise.race([navigation.then(()=>true),cancelled,new Promise((_,reject)=>{loadTimeout=setTimeout(()=>reject(new Error('Opening the editor timed out. Reopen it to try again.')),limit);})]);
  if(!loaded)return false;
  }catch(error){if(projectViews.get(id)!==view)return false;closeWorkspaceView(id);workspaceViewState(id,'error',String(error));throw error;}
  finally{clearTimeout(loadTimeout);if(cancelOpeningViews.get(id)===cancelOpen)cancelOpeningViews.delete(id);}
  if(projectViews.get(id)!==view)return false;
  layoutWorkspaceViews();
  return true;
  })();
  openingViews.set(id, opening);
  try { return await opening; }
  finally { if(openingViews.get(id)===opening)openingViews.delete(id); }
});
ipcMain.handle('workspace:layout', (event, panes,intent) => {
  if(event.sender!==mainWindow?.webContents)return;
  if(!workspaceLayout.accept(panes,intent)){workspaceDiagnostic('layout-rejected','shell','Obsolete or incomplete layout');return;}
  layoutWorkspaceViews();
});
function closeWorkspaceView(id) {
  if(fullscreenProjectId===id){fullscreenProjectId=null;setImmediate(layoutWorkspaceViews);}
  cancelOpeningViews.get(id)?.();cancelOpeningViews.delete(id);
  openingViews.delete(id);
  const view = projectViews.get(id);
  if (!view) return;
  // beforeunload in the editor writes its latest snapshot synchronously.
  projectViews.delete(id);
  if(!view.webContents.isDestroyed())closingProjectViews.set(view.webContents.id,id);
  mainWindow?.removeBrowserView(view);
  if(!view.webContents.isDestroyed())view.webContents.close();
}
ipcMain.on('workspace:rendererError',(event,detail)=>{const entry=[...projectViews].find(([,v])=>v.webContents===event.sender);if(entry||event.sender===mainWindow?.webContents){workspaceDiagnostic('react-error',entry?.[0]||'shell',detail);if(!entry){workspaceLayout.reset();layoutWorkspaceViews();}}});
ipcMain.handle('workspace:closeView', async (_event, id) => closeWorkspaceView(id));
ipcMain.handle('workspace:requestClose', (event) => {
  // The embedded editor can only ask to close its own pane. The shell owns layout.
  const entry = [...projectViews].find(([, view]) => view.webContents === event.sender);
  if (!entry || !mainWindow || mainWindow.isDestroyed()) throw new Error('Project view is unavailable');
  mainWindow.webContents.send('workspace:closeProject', entry[0]);
});
ipcMain.handle('workspace:projectContextMenu', async (_event, id) => {
  const project = projectStore.open(id);
  const selected = await new Promise((resolve) => {
    const menu = Menu.buildFromTemplate([
      { label: 'Eliminar projecte', click: () => resolve(true) },
    ]);
    menu.popup({ window: mainWindow, callback: () => resolve(false) });
  });
  if (!selected) return false;
  const confirmation = await dialog.showMessageBox(mainWindow, {
    type: 'warning', title: 'Eliminar projecte',
    message: `Vols eliminar «${project.title}»?`,
    detail: 'El projecte i els seus fitxers es mouran a la paperera. La gravació original es conservarà.',
    buttons: ['Cancel·lar', 'Eliminar projecte'], defaultId: 0, cancelId: 0,
    noLink: true,
  });
  if (confirmation.response !== 1) return false;
  // Stop the editor before deleting, including a view still opening in the
  // background. Its beforeunload saves the latest snapshot synchronously.
  await openingViews.get(id);
  closeWorkspaceView(id);
  await jobCoordinator.cancelProject(id);
  const paths = new Set([project.videoPath, ...(project.clips || []).map((clip) => clip.path)]);
  await Promise.allSettled([...paths].filter(Boolean).map((videoPath) =>
    fetch(`http://127.0.0.1:${BACKEND_PORT}/preview/cancel`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: videoPath }), signal: AbortSignal.timeout(3000),
    })));
  await projectStore.remove(id, (directory) => shell.trashItem(directory));
  projectRepository.forget(id);
  return true;
});
function saveSnapshot(id,snapshot){
  const {revision,changes}=snapshot;
  if(!Number.isSafeInteger(revision)||!changes)throw new Error('Project save requires a revision and changed fields');
  return projectRepository.commit({id:randomUUID(),projectId:id,baseRevision:revision,actor:'manual',label:'Edit transcript',operations:[],documentChanges:changes,skipHistory:Object.keys(changes).every(key=>key==='playhead')});
}
function assertProjectSender(event,id){
  const editor=projectViews.get(id);
  if(event.sender===mainWindow?.webContents||event.sender===editor?.webContents||closingProjectViews.get(event.sender.id)===id)return;
  // An embedded editor may request its document before loadURL finishes registering it.
  const url=new URL(event.sender.getURL());if(openingViews.has(id)&&url.searchParams.get('project')===id)return;
  throw new Error('This editor is not authorized for the requested project');
}
ipcMain.handle('projects:save', (event, id, snapshot) => {assertProjectSender(event,id);return saveSnapshot(id,snapshot);});
ipcMain.handle('project:getDocument',(event,id)=>{assertProjectSender(event,id);return projectRepository.getDocument(id);});
ipcMain.handle('editingLibrary:get',()=>editingLibrary.read());
ipcMain.handle('editingLibrary:save',(_event,kind,item)=>editingLibrary.save(kind,item));
ipcMain.handle('project:renderDocument',(event,id)=>{assertProjectSender(event,id);return assetPaths(projectRepository.getDocument(id),projectRepository.directory(id));});
ipcMain.handle('project:commit',(event,transaction)=>{assertProjectSender(event,transaction.projectId);return projectRepository.commit(transaction);});
ipcMain.handle('project:undo',(event,id)=>{assertProjectSender(event,id);return projectRepository.history(id,'undo');});
ipcMain.handle('project:redo',(event,id)=>{assertProjectSender(event,id);return projectRepository.history(id,'redo');});
ipcMain.handle('job:start',(event,request)=>{assertProjectSender(event,request.projectId);return jobCoordinator.start(request);});
ipcMain.handle('project:addClipsJob',(event,id,sources,config)=>{assertProjectSender(event,id);const d=projectRepository.getDocument(id);if(jobCoordinator.list(id).some(j=>j.kind==='process-project'&&['running','queued','waiting'].includes(j.status)))throw new Error('Wait for current clip preparation to finish');const processing={status:'queued',stage:'Preparing clips',progress:0,sources:[...(d.processing?.sources||(d.clips||[]).map(c=>c.sourcePath||c.path)),...sources],nextIndex:(d.clips||[]).length,...config};projectRepository.commit({id:randomUUID(),projectId:id,baseRevision:d.revision,actor:'manual',label:'Add clips',operations:[],documentChanges:{processing}});return jobCoordinator.start({kind:'process-project',projectId:id,requestId:randomUUID(),payload:{}});});
ipcMain.handle('job:get',(event,id)=>{const job=jobCoordinator.get(id);assertProjectSender(event,job.projectId);return job;});
ipcMain.handle('job:list',(event,id)=>{assertProjectSender(event,id);return jobCoordinator.list(id);});
ipcMain.handle('job:cancel',async(event,id)=>{const job=jobCoordinator.get(id);assertProjectSender(event,job.projectId);return jobCoordinator.cancel(id);});
ipcMain.handle('job:retry',(event,id)=>{const job=jobCoordinator.get(id);assertProjectSender(event,job.projectId);return jobCoordinator.retry(id);});
ipcMain.handle('projects:rename', (_event, id, title) => projectStore.rename(id, title));
ipcMain.handle('projects:duplicate', (_event, id) => projectStore.duplicate(id).then(project=>{processingJobs.ensure(project.id);return projectRepository.getDocument(project.id);}));
ipcMain.handle('projects:export', (_event, id, destination) => projectStore.exportProject(id, destination));
ipcMain.handle('projects:import', (_event, source) => projectStore.importProject(source).then(project=>{processingJobs.ensure(project.id);return projectRepository.getDocument(project.id);}));
ipcMain.handle('projects:delete', async(_event, id) => {await jobCoordinator.cancelProject(id);projectRepository.forget(id);return projectStore.remove(id, (directory) => shell.trashItem(directory));});
ipcMain.handle('projects:copyAsset', (_event, id, sourcePath) => projectStore.copyAsset(id, sourcePath));
ipcMain.handle('projects:addClip', (event, id, sourcePath, displayName, progressChannel) =>
  projectStore.addClip(id, sourcePath, displayName, progressChannel
    ? (progress) => event.sender.send(progressChannel, progress) : undefined));
ipcMain.handle('projects:removeClip', (event, id, clipId) => {assertProjectSender(event,id);return jobCoordinator.start({kind:'remove-clip',projectId:id,payload:{clipId},requestId:randomUUID()});});
ipcMain.handle('projects:directory', () => projectStore.root);
ipcMain.handle('projects:openDirectory', () => shell.openPath(projectStore.root));
ipcMain.on('projects:saveSync', (event, id, snapshot) => {
  try {
    assertProjectSender(event,id);
    event.returnValue = { ok: true, ...saveSnapshot(id, snapshot) };
  } catch (error) {
    event.returnValue = { ok: false, error: String(error) };
  }
});
