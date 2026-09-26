const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell } = require('electron');
const path = require('path');
const { PythonBackend } = require('./python-bridge');
const { createProjectStore } = require('./project-store');
const { migrateLegacyProjects, migrateLegacyUserData } = require('./project-migration');

let mainWindow = null;
let pythonBackend = null;
let projectStore = null;
let deletionCleanupTimer = null;
let deletionCleanupRunning = false;

const isDev = !app.isPackaged;
const BACKEND_PORT = 8643;

migrateLegacyUserData(app.getPath('appData'));

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
      webSecurity: isDev ? false : true,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    if (!process.env.EDITY_LAUNCHER) mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'frontend', 'dist', 'index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  projectStore = createProjectStore(migrateLegacyProjects(app.getPath('documents')));
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
  } catch (error) {
    dialog.showErrorBox('Edity could not start', `${error.message}\n\nInstall the Python dependencies with the setup script and check that FFmpeg is available.`);
    app.quit();
    return;
  }

  createWindow();

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

app.on('before-quit', () => {
  if (deletionCleanupTimer) clearInterval(deletionCleanupTimer);
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
ipcMain.handle('projects:open', (_event, id) => projectStore.open(id));
ipcMain.handle('projects:create', (event, sourcePath, initialState, progressChannel) =>
  projectStore.create(sourcePath, initialState, progressChannel
    ? (progress) => event.sender.send(progressChannel, progress) : undefined));
ipcMain.handle('projects:save', (_event, id, snapshot) => projectStore.save(id, snapshot));
ipcMain.handle('projects:rename', (_event, id, title) => projectStore.rename(id, title));
ipcMain.handle('projects:duplicate', (_event, id) => projectStore.duplicate(id));
ipcMain.handle('projects:export', (_event, id, destination) => projectStore.exportProject(id, destination));
ipcMain.handle('projects:import', (_event, source) => projectStore.importProject(source));
ipcMain.handle('projects:delete', (_event, id) => projectStore.remove(id, (directory) => shell.trashItem(directory)));
ipcMain.handle('projects:copyAsset', (_event, id, sourcePath) => projectStore.copyAsset(id, sourcePath));
ipcMain.handle('projects:addClip', (event, id, sourcePath, displayName, progressChannel) =>
  projectStore.addClip(id, sourcePath, displayName, progressChannel
    ? (progress) => event.sender.send(progressChannel, progress) : undefined));
ipcMain.handle('projects:removeClip', (_event, id, clipId) =>
  projectStore.removeClip(id, clipId, (file) => shell.trashItem(file)));
ipcMain.handle('projects:directory', () => projectStore.root);
ipcMain.handle('projects:openDirectory', () => shell.openPath(projectStore.root));
ipcMain.on('projects:saveSync', (event, id, snapshot) => {
  try {
    event.returnValue = { ok: true, ...projectStore.save(id, snapshot) };
  } catch (error) {
    event.returnValue = { ok: false, error: String(error) };
  }
});
