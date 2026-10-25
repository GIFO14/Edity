import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Columns2, Film, FolderOpen, Plus, X, Loader2, AlertCircle } from 'lucide-react';
import type { ProjectSummary } from './types/project';
import {useAIStore} from './store/aiStore';
import {initializeProjectDefaults,type ProjectDefaults} from './lib/projectDefaults';

const api = window.electronAPI!;
const tabsKey = 'edity-workspace-tabs';
const videoExtensions = /\.(mp4|mov|mkv|avi|webm|m4a)$/i;

export default function WorkspaceShell() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [tabs, setTabs] = useState<string[]>(() => JSON.parse(localStorage.getItem(tabsKey) || '[]'));
  const [selection, setSelection] = useState<{primary:string|null;secondary:string|null}>({primary:null,secondary:null});
  const {primary,secondary}=selection;
  const [dropped, setDropped] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState(localStorage.getItem('edity-silence-preset') || 'personal');
  const [customMargin, setCustomMargin] = useState(localStorage.getItem('edity-custom-margin') || '0.1');
  const [engine, setEngine] = useState<'crisper' | 'whisperx'>('crisper');
  const [model, setModel] = useState('medium');
  const [language, setLanguage] = useState('ca');
  const [interpolate60,setInterpolate60]=useState(true);
  const [cadences,setCadences]=useState<Array<{path:string;eligible:boolean;width:number;height:number;fps:{num:number;den:number};cadence:string}>>([]);
  const [cadenceBusy,setCadenceBusy]=useState(false);
  useEffect(()=>{setCadences([]);if(!dropped.length)return;const controller=new AbortController();setCadenceBusy(true);void api.getBackendUrl().then(backend=>fetch(backend+'/media/interpolation-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({paths:dropped}),signal:controller.signal})).then(r=>{if(!r.ok)throw Error('Could not inspect source frame rates');return r.json();}).then(data=>{if(!controller.signal.aborted)setCadences(data.sources);}).catch(e=>{if(!controller.signal.aborted)setError(String(e));}).finally(()=>{if(!controller.signal.aborted)setCadenceBusy(false);});return()=>controller.abort();},[dropped]);
  const firstPane = useRef<HTMLDivElement>(null);
  const secondPane = useRef<HTMLDivElement>(null);
  const openedViews = useRef(new Set<string>());
  const openingViews = useRef(new Map<string, Promise<boolean>>());
  const closedViews=useRef(new Set<string>()),openIntent=useRef({primary:0,secondary:0});
  const [layoutEpoch,setLayoutEpoch]=useState(0);
  const layoutGeneration=useRef(0),currentLayout=useRef<()=>void>(()=>{});
  const layout=useCallback(()=>currentLayout.current(),[]);
  const [viewStates,setViewStates]=useState<Record<string,{status:string;message:string}>>({});
  const projectActions = useRef(new Set<string>());
  const scheduling = useRef(false);
  const initialized = useRef(false);
  const [defaultsReady,setDefaultsReady]=useState(false);
  useEffect(()=>{
    const apply=(defaults:ProjectDefaults)=>{setInterpolate60(defaults.processing.interpolate60!==false);setPreset(defaults.processing.preset);setCustomMargin(String(defaults.processing.customMargin));setEngine(defaults.processing.engine);setModel(defaults.processing.model);setLanguage(defaults.processing.language);useAIStore.setState({...defaults.aiSettings,mediaFolders:defaults.mediaFolders,editingInstructionsMigrated:true});setDefaultsReady(true);};
    const remove=api.onProjectDefaultsChanged(apply);void initializeProjectDefaults().then(apply).catch(e=>setError(String(e)));return remove;
  },[]);
  const saveProcessing=(changes:Partial<ProjectDefaults['processing']>)=>{void api.updateProjectDefaults({processing:changes}).catch(e=>setError(String(e)));};

  const refresh = useCallback(async () => {
    const available = await api.listProjects();
    setProjects(available);
    return available;
  }, []);

  const ensureView = useCallback(async (id: string,force=false) => {
    const pending = openingViews.current.get(id);
    if (pending&&!force) return pending;
    const opening = api.openWorkspaceView(id,force?{force:true}:undefined);
    openingViews.current.set(id, opening);
    try { const ready=await opening;if(ready&&!closedViews.current.has(id))openedViews.current.add(id);return ready; }
    finally { if(openingViews.current.get(id)===opening)openingViews.current.delete(id); }
  }, []);

  const showProject = useCallback(async (id: string, beside = false,force=false) => {
    const slot=beside?'secondary':'primary',intent=++openIntent.current[slot];
    closedViews.current.delete(id);
    setError('');
    setTabs((current) => current.includes(id) ? current : [...current, id]);
    setSelection(current=>beside
      ? !current.primary?{primary:id,secondary:null}:id===current.primary?current:{...current,secondary:id}
      : {primary:id,secondary:current.secondary===id?null:current.secondary});
    if(force)setViewStates(current=>({...current,[id]:{status:'loading',message:'Recovering editor…'}}));
    try {
      const ready=await ensureView(id,force);
      if(!ready||closedViews.current.has(id)||intent!==openIntent.current[slot])return;
      // Re-selecting the same tab must reattach its view as well.
      setLayoutEpoch(epoch=>epoch+1);
    } catch (cause) { setError(String(cause)); }
  }, [ensureView]);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void refresh().then(async (available) => {
        const existing = tabs.filter((id) => available.some((project) => project.id === id));
        setTabs(existing);
        if(new URLSearchParams(location.search).get('agentSession')==='1')return;
        const first = existing[0] || available.find((project) => !project.missingVideo)?.id;
        if (first) await showProject(first);
        if (existing[1]) await showProject(existing[1], true);
      }).catch((cause) => setError(String(cause)));
    }
    const timer = window.setInterval(() => { void refresh(); }, 1800);
    return () => window.clearInterval(timer);
  }, [refresh, showProject]);

  useEffect(() => { localStorage.setItem(tabsKey, JSON.stringify(tabs)); }, [tabs]);
  useEffect(()=>api.onWorkspaceOpenProject(id=>{void showProject(id);}),[showProject]);
  useEffect(()=>api.onWorkspaceViewState(state=>{setViewStates(current=>({...current,[state.id]:state}));if(state.status==='error')openedViews.current.delete(state.id);}),[]);

  useEffect(() => {
    for (const id of openedViews.current) {
      if (tabs.includes(id)) continue;
      const project = projects.find((item) => item.id === id);

      openedViews.current.delete(id);
      void api.closeWorkspaceView(id);
    }
  }, [projects, tabs]);

  useEffect(() => {
    const receive = (paths: string[]) => setDropped(paths.filter((path) => videoExtensions.test(path)));
    const remove = api.onWorkspaceDrop(receive);
    return remove;
  }, []);

  useLayoutEffect(() => {
    let live=true;
    const generation=++layoutGeneration.current;
    const update=()=>{
      // Resize/focus callbacks can outlive the selection that installed them.
      // Never publish bounds (or an empty layout) for that obsolete selection.
      if(!live)return;
      const activeIds=[primary,secondary].filter((id):id is string=>!!id);
      const suppressed=!!(dropped.length||dragging);
      const panes=([[primary,firstPane.current],[secondary,secondPane.current]] as const).flatMap(([id,element])=>{
        if(!id||!element)return [];
        const rect=element.getBoundingClientRect();
        return [{id,x:rect.x,y:rect.y,width:rect.width,height:rect.height}];
      });
      // A temporary missing/zero-sized DOM node is not a request to hide an editor.
      if(!suppressed&&(panes.length!==activeIds.length||panes.some(p=>p.width<100||p.height<100)))return;
      void api.layoutWorkspaceViews(suppressed?[]:panes,{generation,activeIds,suppressed}).catch(cause=>setError(String(cause)));
    };
    currentLayout.current=update;
    update();
    const observer = new ResizeObserver(update);
    if (firstPane.current) observer.observe(firstPane.current);
    if (secondPane.current) observer.observe(secondPane.current);
    window.addEventListener('resize',update);window.addEventListener('focus',update);
    return () => { live=false;observer.disconnect();window.removeEventListener('resize',update);window.removeEventListener('focus',update);if(currentLayout.current===update)currentLayout.current=()=>{}; };
  }, [primary,secondary,dropped.length,dragging,tabs,layoutEpoch]);

  const closeTab = useCallback((id: string) => {
    closedViews.current.add(id);openingViews.current.delete(id);
    const remaining = tabs.filter((tab) => tab !== id);
    setTabs(remaining);
    setSelection(current=>current.primary===id?{primary:current.secondary||remaining[0]||null,secondary:null}:current.secondary===id?{...current,secondary:null}:current);
    {
      openedViews.current.delete(id);
      void api.closeWorkspaceView(id);
    }
  }, [tabs, primary, secondary]);

  useEffect(() => api.onWorkspaceCloseProject(closeTab), [closeTab]);

  const chooseVideos = async () => {
    const paths = await api.openVideoFiles();
    if (paths.length) setDropped(paths);
  };

  const projectContextMenu = async (event: React.MouseEvent, id: string) => {
    event.preventDefault();
    if (projectActions.current.has(id)) return;
    projectActions.current.add(id);
    setError('');
    try {
      if (!await api.showProjectContextMenu(id)) return;
      openedViews.current.delete(id);
      const remaining = tabs.filter((tab) => tab !== id);
      setTabs((current) => current.filter((tab) => tab !== id));
      setSelection(current=>current.primary===id?{primary:current.secondary||remaining[0]||null,secondary:null}:current.secondary===id?{...current,secondary:null}:current);
      await refresh();
    } catch (cause) {
      // The editor may have closed before a filesystem error. Restore its tab.
      openedViews.current.delete(id);
      if (tabs.includes(id)) { await ensureView(id).catch(() => {}); layout(); }
      setError(String(cause));
    } finally { projectActions.current.delete(id); }
  };

  const createProjects = async (mode: 'combined' | 'separate') => {
    const paths = dropped;
    setDropped([]);
    setBusy(true);
    setError('');
    try {
      const groups = mode === 'combined' ? [paths] : paths.map((path) => [path]);
      let firstId: string | null = null;
      for (const group of groups) {
        await initializeProjectDefaults();
        const project = await api.createPendingProject(group, {interpolate60});
        if (!firstId) firstId = project.id!;
        setTabs((current) => [...current, project.id!]);
      }
      await refresh();
      if (firstId) await showProject(firstId);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  };

  const handleDrop = (event: React.DragEvent) => {
    event.preventDefault(); setDragging(false);
    const paths = Array.from(event.dataTransfer.files).map((file) => api.getPathForFile(file))
      .filter((path) => videoExtensions.test(path));
    if (paths.length) setDropped(paths);
  };

  const status = (project: ProjectSummary) => {
    const processing = project.processing;
    if (!processing || processing.status === 'done') return null;
    if (processing.status === 'error') return <AlertCircle size={13} className="text-red-400 shrink-0" />;
    return <Loader2 size={13} className={`text-sky-400 shrink-0 ${processing.status === 'running' ? 'animate-spin' : ''}`} />;
  };

  const paneStatus=(id:string)=><div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-sm text-editor-text-muted" data-workspace-placeholder={id}>
    {viewStates[id]?.status==='error'?<AlertCircle size={22}/>:<Loader2 size={22} className="animate-spin"/>}
    <p>{viewStates[id]?.status==='error'?'Could not display the editor.':viewStates[id]?.status==='ready'?'Editor is not visible. Reopen it to recover.':'Opening editor…'}</p>
    {viewStates[id]?.message&&<p className="max-w-md px-4 text-xs">{viewStates[id].message}</p>}
    <button className="rounded bg-editor-surface px-3 py-2 text-editor-text" onClick={()=>void showProject(id,id===secondary,true)}>Reopen editor</button>
  </div>;
  return <div className="h-screen flex flex-col bg-editor-bg text-editor-text" onDragOver={(event) => {if(!Array.from(event.dataTransfer.types).includes('Files'))return;event.preventDefault(); setDragging(true); }}
    onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={handleDrop}>
    <header className="h-11 flex items-center gap-3 px-3 border-b border-editor-border shrink-0">
      <Film size={19} className="text-editor-accent" /><strong className="text-sm">Edity</strong>
      <div className="flex-1 flex items-center gap-1 overflow-x-auto min-w-0">
        {tabs.map((id) => { const project = projects.find((item) => item.id === id); if (!project) return null;
          return <div key={id} onContextMenu={(event) => void projectContextMenu(event, id)} className={`flex items-center gap-1.5 rounded px-2 py-1 text-xs min-w-0 ${primary === id || secondary === id ? 'bg-editor-surface' : 'text-editor-text-muted'}`}>
            {status(project)}
            <button className="truncate max-w-40 hover:text-editor-accent" title={project.title} onClick={() => void showProject(id)}>{project.title}</button>
            <button title="Show beside" aria-label={`Show ${project.title} beside`} onClick={() => void showProject(id, true)}><Columns2 size={13} /></button>
            <button title="Close tab" aria-label={`Close ${project.title}`} onClick={() => closeTab(id)}><X size={13} /></button>
          </div>; })}
      </div>
      <button onClick={() => void chooseVideos()} title="Add videos" className="p-1.5 rounded hover:bg-editor-surface"><Plus size={17} /></button>
    </header>
    <div className="flex flex-1 min-h-0">
      <aside className="w-48 shrink-0 border-r border-editor-border flex flex-col bg-editor-surface/30">
        <div className="px-3 pt-4 pb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-editor-text-muted">
          <span>Projects</span><button onClick={() => setSelection({primary:null,secondary:null})} title="Project home"><FolderOpen size={15} /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-1.5 space-y-0.5">
          {projects.map((project) => <div key={project.id} onContextMenu={(event) => void projectContextMenu(event, project.id)} className={`group flex items-center rounded ${primary === project.id || secondary === project.id ? 'bg-editor-surface' : 'hover:bg-editor-surface/60'}`}>
            <button disabled={project.missingVideo} onClick={() => void showProject(project.id)} className="flex-1 flex items-center gap-2 min-w-0 px-2 py-2 text-left text-xs disabled:opacity-40">
              {status(project)}<span className="truncate" title={project.title}>{project.title}</span>
            </button>
            <button title="Show beside" aria-label={`Show ${project.title} beside`} onClick={() => void showProject(project.id, true)} className="p-1.5 opacity-0 group-hover:opacity-100 focus:opacity-100"><Columns2 size={13} /></button>
          </div>)}
        </div>
        <button onClick={() => void chooseVideos()} className="m-2 flex items-center justify-center gap-1.5 rounded bg-editor-accent px-2 py-2 text-xs text-white"><Plus size={14} /> Add videos</button>
      </aside>
      <main className="flex-1 min-w-0 flex">
        {primary ? <div ref={firstPane} className="relative flex-1 min-w-0">{paneStatus(primary)}</div> : <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
          <Film size={44} className="text-editor-accent" /><h1 className="text-xl font-semibold">Open or create a project</h1>
          <p className="text-sm text-editor-text-muted">Drop videos here to create projects. You can edit several at once.</p>
          <button onClick={() => void chooseVideos()} className="rounded bg-editor-accent px-4 py-2 text-sm text-white">Choose videos</button>
        </div>}
        {secondary && primary && <div ref={secondPane} className="relative flex-1 min-w-0 border-l border-editor-border">{paneStatus(secondary)}</div>}
      </main>
    </div>
    {error && <div className="absolute bottom-3 left-52 right-3 rounded bg-red-950 p-3 text-xs text-red-200">{error}</div>}
    {dragging && <div className="pointer-events-none absolute inset-0 z-40 border-4 border-editor-accent bg-editor-bg/70 flex items-center justify-center text-lg">Drop videos to create projects</div>}
    {dropped.length > 0 && <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-xl border border-editor-border bg-editor-surface p-5 space-y-4 shadow-2xl">
        <h2 className="text-lg font-semibold">Import {dropped.length} video{dropped.length === 1 ? '' : 's'}</h2>
        <div className="max-h-28 overflow-y-auto text-xs text-editor-text-muted space-y-1">{dropped.map((path) => <div key={path} className="truncate">{path.split(/[\\/]/).pop()}</div>)}</div>
        <div className="text-xs space-y-1">
          {cadences.map(info=><div key={info.path} className="text-editor-text-muted">{info.path.split(/[\\/]/).pop()} · {info.width}×{info.height} · {(info.fps.num/info.fps.den).toFixed(2)} FPS · {info.cadence.toUpperCase()}</div>)}
          <label className="flex gap-2 items-center"><input aria-label="Millorar fluïdesa a 60 FPS" type="checkbox" checked={interpolate60} disabled={cadenceBusy||!!cadences.length&&!cadences.some(c=>c.eligible)} onChange={e=>{setInterpolate60(e.target.checked);saveProcessing({interpolate60:e.target.checked});}}/> Millorar fluïdesa a 60 FPS</label>
          <p className="text-editor-text-muted">{cadenceBusy?'Checking video cadence…':'GPU motion interpolation for 29.97/30 FPS sources when available. CPU fallback can take longer than the recording. Originals and existing 60+ FPS recordings are preserved.'}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <label>Silence margin<select value={preset} onChange={(event) => { setPreset(event.target.value); localStorage.setItem('edity-silence-preset', event.target.value); saveProcessing({preset:event.target.value}); }} className="block w-full mt-1 bg-editor-bg rounded p-2"><option value="personal">Personal · 0.1 s</option><option value="gaming">Gaming · 0.05 s</option><option value="custom">Custom</option></select></label>
          {preset === 'custom' && <label>Seconds<input type="number" min="0" max="10" step="0.01" value={customMargin} onChange={(event) => { setCustomMargin(event.target.value); localStorage.setItem('edity-custom-margin', event.target.value); if(event.target.value!=='')saveProcessing({customMargin:Number(event.target.value)}); }} className="block w-full mt-1 bg-editor-bg rounded p-2" /></label>}
          <label>Transcription<select value={engine} onChange={(event) => { const value = event.target.value as 'crisper' | 'whisperx'; setEngine(value); setModel(value === 'crisper' ? 'medium' : 'large'); saveProcessing({engine:value,model:value==='crisper'?'medium':'large'}); }} className="block w-full mt-1 bg-editor-bg rounded p-2"><option value="crisper">CrisperWhisper</option><option value="whisperx">WhisperX</option></select></label>
          <label>Model<select value={model} onChange={(event) => {setModel(event.target.value);saveProcessing({model:event.target.value});}} className="block w-full mt-1 bg-editor-bg rounded p-2">{(engine === 'crisper' ? ['small', 'medium', 'turbo', 'large'] : ['tiny', 'base', 'small', 'medium', 'large']).map((value) => <option key={value}>{value}</option>)}</select></label>
          <label>Language<select value={language} onChange={(event) => {setLanguage(event.target.value);saveProcessing({language:event.target.value});}} className="block w-full mt-1 bg-editor-bg rounded p-2"><option value="ca">Català</option><option value="es">Español</option><option value="en">English</option></select></label>
        </div>
        <div className="flex gap-2 justify-end text-xs">
          <button onClick={() => setDropped([])} className="rounded px-3 py-2 bg-editor-bg">Cancel</button>
          {dropped.length > 1 && <button disabled={busy||!defaultsReady||cadenceBusy} onClick={() => void createProjects('combined')} className="rounded px-3 py-2 bg-editor-border">One project with all</button>}
          <button disabled={busy||!defaultsReady||cadenceBusy} onClick={() => void createProjects('separate')} className="rounded px-3 py-2 bg-editor-accent text-white">{dropped.length > 1 ? 'One project per video' : 'Create project'}</button>
        </div>
      </div>
    </div>}
  </div>;
}

