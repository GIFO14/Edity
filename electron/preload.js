const { contextBridge, ipcRenderer, webUtils } = require('electron');

// Sandboxed Electron preload scripts cannot require Node's crypto module.
// These channel names only need to be unique within this renderer process.
let nextProgressChannelId = 0;
const progressChannelFor = (operation) => `${operation}:${Date.now()}:${++nextProgressChannelId}`;

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openVideoFiles: () => ipcRenderer.invoke('dialog:openVideoFiles'),
  chooseChatAttachments: () => ipcRenderer.invoke('chat:chooseAttachments'),
  importChatAttachment: (id,input) => ipcRenderer.invoke('chat:importAttachment',id,input),
  readChatClipboard: () => ipcRenderer.invoke('chat:readClipboard'),
  showChatContextMenu: () => ipcRenderer.invoke('chat:contextMenu'),
  onChatPaste: callback => {const listener=()=>callback();ipcRenderer.on('chat:paste',listener);return()=>ipcRenderer.removeListener('chat:paste',listener);},
  getPathForFile: (file) => webUtils.getPathForFile(file),
  forwardWorkspaceDrop: (paths) => ipcRenderer.send('workspace:droppedFiles', paths),
  onWorkspaceDrop: (callback) => {
    const listener = (_event, paths) => callback(paths);
    ipcRenderer.on('workspace:droppedFiles', listener);
    return () => ipcRenderer.removeListener('workspace:droppedFiles', listener);
  },
  onWorkspaceVisibility:callback=>{const listener=(_event,visible)=>callback(visible);ipcRenderer.on('workspace:visible',listener);return()=>ipcRenderer.removeListener('workspace:visible',listener);},
  onWorkspaceViewState:callback=>{const listener=(_event,state)=>callback(state);ipcRenderer.on('workspace:viewState',listener);return()=>ipcRenderer.removeListener('workspace:viewState',listener);},
  reportRendererError:detail=>ipcRenderer.send('workspace:rendererError',String(detail).slice(0,6000)),
  onWorkspaceOpenProject:callback=>{const listener=(_event,id)=>callback(id);ipcRenderer.on('workspace:openProject',listener);return()=>ipcRenderer.removeListener('workspace:openProject',listener);},
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  encryptString: (data) => ipcRenderer.invoke('safe-storage:encrypt', data),
  decryptString: (encrypted) => ipcRenderer.invoke('safe-storage:decrypt', encrypted),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  initializeProjectDefaults:legacy=>ipcRenderer.invoke('defaults:initialize',legacy),
  getProjectDefaults:()=>ipcRenderer.invoke('defaults:get'),
  updateProjectDefaults:(changes,revision)=>ipcRenderer.invoke('defaults:update',changes,revision),
  onProjectDefaultsChanged:callback=>{const listener=(_event,defaults)=>callback(defaults);ipcRenderer.on('defaults:changed',listener);return()=>ipcRenderer.removeListener('defaults:changed',listener);},
  getNarration:id=>ipcRenderer.invoke('narration:get',id),
  editNarration:(kind,params)=>ipcRenderer.invoke('narration:mutate',kind,params),
  copyNarrationText:(id,wordIds)=>ipcRenderer.invoke('narration:copyText',id,wordIds),
  openManagedProject: (id) => ipcRenderer.invoke('projects:open', id),
  createPendingProject: (sourcePaths, options) => ipcRenderer.invoke('projects:createPending', sourcePaths, options),
  updateProjectProcessing: (id, patch) => ipcRenderer.invoke('projects:updateProcessing', id, patch),
  finishFirstProjectClip: (id, sourcePath) => ipcRenderer.invoke('projects:finishFirstClip', id, sourcePath),
  openWorkspaceView: (id,options) => ipcRenderer.invoke('workspace:openView', id,options),
  layoutWorkspaceViews: (panes,intent) => ipcRenderer.invoke('workspace:layout', panes,intent),
  closeWorkspaceView: (id) => ipcRenderer.invoke('workspace:closeView', id),
  requestWorkspaceClose: () => ipcRenderer.invoke('workspace:requestClose'),
  onWorkspaceCloseProject: callback => {
    const listener = (_event, id) => callback(id);
    ipcRenderer.on('workspace:closeProject', listener);
    return () => ipcRenderer.removeListener('workspace:closeProject', listener);
  },
  showProjectContextMenu: (id) => ipcRenderer.invoke('workspace:projectContextMenu', id),
  createManagedProject: async (sourcePath, initialState, onProgress) => {
    const progressChannel = progressChannelFor('projects:create-progress');
    const listener = (_event, progress) => onProgress?.(progress);
    ipcRenderer.on(progressChannel, listener);
    try {
      return await ipcRenderer.invoke('projects:create', sourcePath, initialState, progressChannel);
    } finally {
      ipcRenderer.removeListener(progressChannel, listener);
    }
  },
  saveManagedProject: (id, snapshot) => ipcRenderer.invoke('projects:save', id, snapshot),
  getProjectDocument:(id)=>ipcRenderer.invoke('project:getDocument',id),
  getEditingLibrary:()=>ipcRenderer.invoke('editingLibrary:get'),
  onEditingLibraryChanged:callback=>{const listener=()=>callback();ipcRenderer.on('editingLibrary:changed',listener);return ()=>ipcRenderer.removeListener('editingLibrary:changed',listener);},
  saveEditingLibrary:(kind,item)=>ipcRenderer.invoke('editingLibrary:save',kind,item),
  getRenderDocument:(id)=>ipcRenderer.invoke('project:renderDocument',id),
  commitProject:(transaction)=>ipcRenderer.invoke('project:commit',transaction),
  undoProject:(id)=>ipcRenderer.invoke('project:undo',id),
  redoProject:(id)=>ipcRenderer.invoke('project:redo',id),
  onProjectChanged:(callback)=>{const listener=(_event,ack)=>callback(ack);ipcRenderer.on('project:changed',listener);return ()=>ipcRenderer.removeListener('project:changed',listener);},
  startJob:request=>ipcRenderer.invoke('job:start',request),
  addClipsJob:(id,sources,config)=>ipcRenderer.invoke('project:addClipsJob',id,sources,config),
  getJob:id=>ipcRenderer.invoke('job:get',id),
  listJobs:id=>ipcRenderer.invoke('job:list',id),
  cancelJob:id=>ipcRenderer.invoke('job:cancel',id),
  retryJob:id=>ipcRenderer.invoke('job:retry',id),
  onJobChanged:callback=>{const listener=(_event,job)=>callback(job);ipcRenderer.on('job:changed',listener);return ()=>ipcRenderer.removeListener('job:changed',listener);},
  renameManagedProject: (id, title) => ipcRenderer.invoke('projects:rename', id, title),
  duplicateManagedProject: (id) => ipcRenderer.invoke('projects:duplicate', id),
  exportManagedProject: (id, destination) => ipcRenderer.invoke('projects:export', id, destination),
  importManagedProject: (source) => ipcRenderer.invoke('projects:import', source),
  deleteManagedProject: (id) => ipcRenderer.invoke('projects:delete', id),
  saveManagedProjectSync: (id, snapshot) => ipcRenderer.sendSync('projects:saveSync', id, snapshot),
  copyProjectAsset: (id, sourcePath) => ipcRenderer.invoke('projects:copyAsset', id, sourcePath),
  addProjectClip: async (id, sourcePath, displayName, onProgress) => {
    const progressChannel = progressChannelFor('projects:addClip:progress');
    const listener = (_event, progress) => onProgress?.(progress);
    ipcRenderer.on(progressChannel, listener);
    try {
      return await ipcRenderer.invoke('projects:addClip', id, sourcePath, displayName, progressChannel);
    } finally {
      ipcRenderer.removeListener(progressChannel, listener);
    }
  },
  removeProjectClip: (id, clipId) => ipcRenderer.invoke('projects:removeClip', id, clipId),
  getProjectsDirectory: () => ipcRenderer.invoke('projects:directory'),
  openProjectsDirectory: () => ipcRenderer.invoke('projects:openDirectory'),
});
