/// <reference types="vite/client" />

interface ElectronAPI {
  openFile: (options?: Record<string, unknown>) => Promise<string | null>;
  openVideoFiles: () => Promise<string[]>;
  saveFile: (options?: Record<string, unknown>) => Promise<string | null>;
  openProject: () => Promise<string | null>;
  getBackendUrl: () => Promise<string>;
  encryptString: (data: string) => Promise<string>;
  decryptString: (encrypted: string) => Promise<string>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  listProjects: () => Promise<import('./types/project').ProjectSummary[]>;
  openManagedProject: (id: string) => Promise<import('./types/project').ProjectFile>;
  createManagedProject: (sourcePath: string, initialState?: Partial<import('./types/project').ProjectFile>,
    onProgress?: (progress: { progress: number; copied: number; total: number }) => void) => Promise<import('./types/project').ProjectFile>;
  saveManagedProject: (id: string, snapshot: import('./types/project').ProjectSnapshot) => Promise<{ id: string; modifiedAt: string }>;
  renameManagedProject: (id: string, title: string) => Promise<import('./types/project').ProjectFile>;
  duplicateManagedProject: (id: string) => Promise<import('./types/project').ProjectFile>;
  exportManagedProject: (id: string, destination: string) => Promise<string>;
  importManagedProject: (source: string) => Promise<import('./types/project').ProjectFile>;
  deleteManagedProject: (id: string) => Promise<{ pending: boolean }>;
  saveManagedProjectSync: (id: string, snapshot: import('./types/project').ProjectSnapshot) => { ok: boolean; error?: string };
  copyProjectAsset: (id: string, sourcePath: string) => Promise<string>;
  addProjectClip: (id: string, sourcePath: string, displayName?: string,
    onProgress?: (progress: { progress: number; copied: number; total: number }) => void) => Promise<{
    project: import('./types/project').ProjectFile; clip: import('./types/project').ProjectClip }>;
  removeProjectClip: (id: string, clipId: string) => Promise<import('./types/project').ProjectFile>;
  getProjectsDirectory: () => Promise<string>;
  openProjectsDirectory: () => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
