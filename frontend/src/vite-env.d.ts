/// <reference types="vite/client" />

interface ElectronAPI {
  onWorkspaceViewState:(callback:(state:{id:string;status:'loading'|'ready'|'error';message:string})=>void)=>()=>void;
  reportRendererError:(detail:string)=>void;
  getNarration:(id:string)=>Promise<{revision:number;arrangement:import('./composition/types').NarrationArrangement;orderedWordIds:string[];clipboard:string[]}>;
  editNarration:(kind:'move'|'cut'|'paste',params:{projectId:string;expectedRevision:number;idempotencyKey:string;wordIds?:string[];beforeWordId?:string;position?:'start'|'end'})=>Promise<{revision:number;document:import('./types/project').ProjectFile}>;
  copyNarrationText:(id:string,wordIds:string[])=>Promise<{text:string;wordIds:string[]}>;
  initializeProjectDefaults:(legacy:unknown)=>Promise<import('./lib/projectDefaults').ProjectDefaults>;
  getProjectDefaults:()=>Promise<import('./lib/projectDefaults').ProjectDefaults>;
  updateProjectDefaults:(changes:unknown,revision?:number)=>Promise<import('./lib/projectDefaults').ProjectDefaults>;
  onProjectDefaultsChanged:(callback:(defaults:import('./lib/projectDefaults').ProjectDefaults)=>void)=>()=>void;
  chooseChatAttachments:()=>Promise<string[]>;
  importChatAttachment:(id:string,input:{path?:string;name?:string;bytes?:Uint8Array})=>Promise<import('./types/project').ChatAttachment>;
  readChatClipboard:()=>Promise<{inputs:Array<{path?:string;name?:string;bytes?:Uint8Array}>;text:string}>;
  showChatContextMenu:()=>Promise<void>;
  onChatPaste:(callback:()=>void)=>()=>void;
  getEditingLibrary:()=>Promise<{profiles:Record<string,unknown>;variants:Record<string,unknown>;colorGrades:Record<string,import('./composition/types').ColorGradePreset>}>;
  onEditingLibraryChanged:(callback:()=>void)=>()=>void;
  saveEditingLibrary:(kind:'profiles'|'variants'|'colorGrades',item:Record<string,unknown>)=>Promise<Record<string,unknown>>;
  addClipsJob:(id:string,sources:string[],config:Record<string,unknown>)=>Promise<import('./composition/jobs').Job>;
  getRenderDocument: (id:string)=>Promise<import('./types/project').ProjectFile>;
  openFile: (options?: Record<string, unknown>) => Promise<string | null>;
  openVideoFiles: () => Promise<string[]>;
  getPathForFile: (file: File) => string;
  forwardWorkspaceDrop: (paths: string[]) => void;
  onWorkspaceDrop: (callback: (paths: string[]) => void) => () => void;
  saveFile: (options?: Record<string, unknown>) => Promise<string | null>;
  openProject: () => Promise<string | null>;
  getBackendUrl: () => Promise<string>;
  encryptString: (data: string) => Promise<string>;
  decryptString: (encrypted: string) => Promise<string>;
  readFile: (path: string) => Promise<string>;
  writeFile: (path: string, content: string) => Promise<boolean>;
  listProjects: () => Promise<import('./types/project').ProjectSummary[]>;
  openManagedProject: (id: string) => Promise<import('./types/project').ProjectFile>;
  createPendingProject: (sourcePaths: string[], options: Record<string, unknown>) => Promise<import('./types/project').ProjectFile>;
  updateProjectProcessing: (id: string, patch: Record<string, unknown>) => Promise<import('./types/project').ProjectProcessing>;
  finishFirstProjectClip: (id: string, sourcePath: string) => Promise<import('./types/project').ProjectFile>;
  openWorkspaceView: (id: string,options?:{force?:boolean}) => Promise<boolean>;
  onWorkspaceVisibility:(callback:(visible:boolean)=>void)=>()=>void;
  onWorkspaceOpenProject:(callback:(id:string)=>void)=>()=>void;
  layoutWorkspaceViews: (panes: Array<{ id: string; x: number; y: number; width: number; height: number }>,intent?:{generation:number;activeIds:string[];suppressed:boolean}) => Promise<void>;
  closeWorkspaceView: (id: string) => Promise<void>;
  requestWorkspaceClose: () => Promise<void>;
  onWorkspaceCloseProject: (callback: (id: string) => void) => () => void;
  showProjectContextMenu: (id: string) => Promise<boolean>;
  createManagedProject: (sourcePath: string, initialState?: Partial<import('./types/project').ProjectFile>,
    onProgress?: (progress: { progress: number; copied: number; total: number }) => void) => Promise<import('./types/project').ProjectFile>;
  saveManagedProject: (id: string, snapshot: {revision:number;changes:Partial<import('./types/project').ProjectSnapshot>}) => Promise<{revision:number;document:import('./types/project').ProjectFile}>;
  getProjectDocument:(id:string)=>Promise<import('./types/project').ProjectFile>;
  commitProject:(transaction:import('./composition/types').EditTransaction)=>Promise<{revision:number;document:import('./types/project').ProjectFile}>;
  undoProject:(id:string)=>Promise<{revision:number;document:import('./types/project').ProjectFile}>;
  redoProject:(id:string)=>Promise<{revision:number;document:import('./types/project').ProjectFile}>;
  onProjectChanged:(callback:(ack:{revision:number;document:import('./types/project').ProjectFile})=>void)=>()=>void;
  startJob:(request:{kind:string;projectId:string;payload?:Record<string,unknown>;dependencies?:string[];requestId?:string;revision?:number})=>Promise<import('./composition/jobs').Job>;
  getJob:(id:string)=>Promise<import('./composition/jobs').Job>;
  listJobs:(projectId:string)=>Promise<import('./composition/jobs').Job[]>;
  cancelJob:(id:string)=>Promise<import('./composition/jobs').Job>;
  retryJob:(id:string)=>Promise<import('./composition/jobs').Job>;
  onJobChanged:(callback:(job:import('./composition/jobs').Job)=>void)=>()=>void;
  renameManagedProject: (id: string, title: string) => Promise<import('./types/project').ProjectFile>;
  duplicateManagedProject: (id: string) => Promise<import('./types/project').ProjectFile>;
  exportManagedProject: (id: string, destination: string) => Promise<string>;
  importManagedProject: (source: string) => Promise<import('./types/project').ProjectFile>;
  deleteManagedProject: (id: string) => Promise<{ pending: boolean }>;
  saveManagedProjectSync: (id: string, snapshot: {revision:number;changes:Partial<import('./types/project').ProjectSnapshot>}) => { ok: boolean; error?: string };
  copyProjectAsset: (id: string, sourcePath: string) => Promise<string>;
  addProjectClip: (id: string, sourcePath: string, displayName?: string,
    onProgress?: (progress: { progress: number; copied: number; total: number }) => void) => Promise<{
    project: import('./types/project').ProjectFile; clip: import('./types/project').ProjectClip }>;
  removeProjectClip: (id: string, clipId: string) => Promise<import('./composition/jobs').Job>;
  getProjectsDirectory: () => Promise<string>;
  openProjectsDirectory: () => Promise<string>;
}

interface Window {
  electronAPI?: ElectronAPI;
}
