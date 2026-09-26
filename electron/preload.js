const { contextBridge, ipcRenderer } = require('electron');

// Sandboxed Electron preload scripts cannot require Node's crypto module.
// These channel names only need to be unique within this renderer process.
let nextProgressChannelId = 0;
const progressChannelFor = (operation) => `${operation}:${Date.now()}:${++nextProgressChannelId}`;

contextBridge.exposeInMainWorld('electronAPI', {
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),
  openVideoFiles: () => ipcRenderer.invoke('dialog:openVideoFiles'),
  saveFile: (options) => ipcRenderer.invoke('dialog:saveFile', options),
  openProject: () => ipcRenderer.invoke('dialog:openProject'),
  getBackendUrl: () => ipcRenderer.invoke('get-backend-url'),
  encryptString: (data) => ipcRenderer.invoke('safe-storage:encrypt', data),
  decryptString: (encrypted) => ipcRenderer.invoke('safe-storage:decrypt', encrypted),
  readFile: (path) => ipcRenderer.invoke('fs:readFile', path),
  writeFile: (path, content) => ipcRenderer.invoke('fs:writeFile', path, content),
  listProjects: () => ipcRenderer.invoke('projects:list'),
  openManagedProject: (id) => ipcRenderer.invoke('projects:open', id),
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
