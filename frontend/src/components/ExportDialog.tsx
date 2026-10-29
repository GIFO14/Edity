import { useState, useCallback, useEffect } from 'react';
import { useEditorStore } from '../store/editorStore';
import { requestCurrentManifest,requestDocumentManifest } from '../composition/manifestClient';
import { Download, Loader2, Zap, Cog, Info } from 'lucide-react';
import type { ExportOptions } from '../types/project';
import { getLockedCutBoundaries } from '../lib/cutRanges';
import {useCompositionStore} from '../store/compositionStore';
import {saveCurrentProject} from '../lib/projectPersistence';
import {waitForJob} from '../composition/jobs';

export default function ExportDialog() {
  const { videoPath, words, deletedRanges, soundEvents, mediaItems, isExporting, exportProgress, backendUrl, setExporting, getKeepSegments,
    studioSoundEnabled, setStudioSoundEnabled, language } =
    useEditorStore();

  const hasCuts = deletedRanges.length > 0 || soundEvents.some((event) => event.markedForRemoval);
  const [exportError, setExportError] = useState('');
  const [exportedPath, setExportedPath] = useState('');
  const [exportStage, setExportStage] = useState('');
  const [jobId,setJobId]=useState<string|null>(null);
  const [exportTarget,setExportTarget]=useState<'video'|'resolve'>('video');
  const [copyMedia,setCopyMedia]=useState(true);
  const projectId=useCompositionStore(s=>s.projectId);

  useEffect(()=>{let live=true;const update=(job:import('../composition/jobs').Job)=>{if(!live||job.projectId!==projectId||!['export','resolve-export'].includes(job.kind))return;setJobId(job.id);setExportStage(job.stage);setExportTarget(job.kind==='resolve-export'?'resolve':'video');if(['queued','waiting','running'].includes(job.status))setExporting(true,Math.min(99,job.progress));else{setExporting(false,job.status==='complete'?100:undefined);setJobId(null);setExportStage('');if(job.status==='complete')setExportedPath(String(job.result?.outputPath||''));else setExportError(job.error||job.stage);}};
    const unsubscribe=window.electronAPI?.onJobChanged(update);if(projectId)void window.electronAPI?.listJobs(projectId).then(jobs=>{const job=jobs.filter(j=>['export','resolve-export'].includes(j.kind)).sort((a,b)=>(a.createdAt||'').localeCompare(b.createdAt||'')).at(-1);if(job)update(job);});return()=>{live=false;unsubscribe?.();};},[projectId,setExporting]);

  const [options, setOptions] = useState<Omit<ExportOptions, 'outputPath' | 'enhanceAudio'>>({
    mode: 'fast',
    resolution: '1080p',
    format: 'mp4',
    captions: 'none',
  });

  const handleExport = useCallback(async () => {
    if (!videoPath) return;

    const outputPath = await window.electronAPI?.saveFile({
      defaultPath: videoPath.replace(/\.[^.]+$/, exportTarget==='resolve'?'_edited.fcpxml':`_edited.${options.format}`),
      filters: exportTarget==='resolve'?[{name:'DaVinci Resolve timeline',extensions:['fcpxml']}]:[
        { name: 'MP4', extensions: ['mp4'] },
        { name: 'MOV', extensions: ['mov'] },
        { name: 'WebM', extensions: ['webm'] },
      ],
    });
    if (!outputPath) return;

    setExporting(true, 1);
    setExportStage('Preparing cuts');
    setExportError('');
    setExportedPath('');
    try {
      if(exportTarget==='resolve'){
        if(!projectId||!window.electronAPI)throw new Error('Open a project to export a DaVinci Resolve timeline');
        await saveCurrentProject();const document=await window.electronAPI.getProjectDocument(projectId),manifest=await requestDocumentManifest(document,backendUrl);
        const job=await window.electronAPI.startJob({kind:'resolve-export',projectId,revision:document.revision,payload:{document,manifest,outputPath,copyMedia}});setJobId(job.id);
        const completed=await waitForJob(job.id,status=>{setExporting(true,Math.min(99,status.progress));setExportStage(status.stage);});
        setExportedPath(String(completed.result?.outputPath||outputPath));setExportStage('');setExporting(false,100);setJobId(null);return;
      }
      const manifest=await requestCurrentManifest();
      const keepSegments=manifest.keepSegments;
      if(projectId&&window.electronAPI){
        await saveCurrentProject();const document=await window.electronAPI.getProjectDocument(projectId),manifest=await requestDocumentManifest(document,backendUrl);
        const height=options.resolution==='4k'?2160:options.resolution==='720p'?720:1080,width=Math.round(height*document.composition!.canvas.width/document.composition!.canvas.height/2)*2;
        const job=await window.electronAPI.startJob({kind:'export',projectId,revision:document.revision,payload:{document,manifest,outputPath,width,height,format:options.format,captions:options.captions,studioSound:studioSoundEnabled}});setJobId(job.id);
        const completed=await waitForJob(job.id,status=>{setExporting(true,Math.min(99,status.progress));setExportStage(status.stage);});setExportedPath(String(completed.result?.outputPath||outputPath));setExportStage('');setExporting(false,100);setJobId(null);return;
      }
      setExporting(true, 2);
      setExportStage('Starting export');

      const deletedSet = new Set<number>();
      for (const range of deletedRanges) {
        for (const idx of range.wordIndices) deletedSet.add(idx);
      }

      const res = await fetch(`${backendUrl}/export/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input_path: videoPath,
          output_path: outputPath,
          keep_segments: keepSegments,
          words: options.captions !== 'none' ? words : undefined,
          deleted_indices: [...deletedSet],
          media_items: mediaItems,
          enhanceAudio: studioSoundEnabled,
          ...options,
        }),
      });
      const started = await res.json();
      if (!res.ok) throw new Error(started.detail || `Export failed: ${res.statusText}`);
      let outputPathResult = '';
      for (;;) {
        const statusResponse = await fetch(`${backendUrl}/export/status/${started.job_id}`);
        const status = await statusResponse.json() as {
          status: 'running' | 'complete' | 'error'; progress: number;
          stage: string; output_path?: string; error?: string; detail?: string;
        };
        if (!statusResponse.ok) throw new Error(status.detail || 'Could not read export progress');
        setExporting(true, Math.min(99, status.progress));
        setExportStage(status.stage);
        if (status.status === 'error') throw new Error(status.error || 'Export failed');
        if (status.status === 'complete') {
          outputPathResult = status.output_path || '';
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      setExportedPath(outputPathResult);
      setExportStage('');
      setExporting(false, 100);
    } catch (err) {
      console.error('Export error:', err);
      setExportError(String(err));
      setExportStage('');
      setExporting(false);
    }
  }, [videoPath, options, backendUrl, setExporting, getKeepSegments, mediaItems, deletedRanges, words, studioSoundEnabled, language,projectId,exportTarget,copyMedia]);

  return (
    <div className="p-4 space-y-5">
      <h3 className="text-sm font-semibold">Export</h3>
      <SelectField label="Export as" value={exportTarget} onChange={v=>{setExportTarget(v as 'video'|'resolve');setExportError('');setExportedPath('');}} options={[{value:'video',label:'Video file'},...(projectId?[{value:'resolve',label:'DaVinci Resolve (.fcpxml)'}]:[])]}/>
      {exportError && <p className="text-xs text-editor-danger">{exportError}</p>}
      {exportedPath && <p className="text-xs text-editor-success break-all">Exported: {exportedPath}</p>}

      {exportTarget==='resolve'&&<div className="space-y-3">
        <p className="text-xs text-editor-text-muted">Includes base cuts, music, sounds, B-roll, images and editable titles, with timing, volume and fades. Exact text styling, animations and Edity transitions use rendered appearance clips above the editable layers. Disable the overlapping appearance clip to change its underlying picture in Resolve.</p>
        <label className="flex items-center gap-2 text-xs cursor-pointer"><input type="checkbox" checked={copyMedia} onChange={e=>setCopyMedia(e.target.checked)} className="accent-editor-accent"/>Copy source clips next to the timeline</label>
        <p className="text-[11px] text-editor-text-muted">In DaVinci Resolve: File → Import → Timeline, then choose the .fcpxml file.</p>
      </div>}
      {exportTarget==='video'&&<>
      {/* Mode */}
      {!projectId&&<fieldset className="space-y-2">
        <legend className="text-xs text-editor-text-muted font-medium">Export Mode</legend>
        <div className="grid grid-cols-2 gap-2">
          <ModeCard
            active={options.mode === 'fast'}
            onClick={() => setOptions((o) => ({ ...o, mode: 'fast' }))}
            icon={<Zap className="w-4 h-4" />}
            title="Fast"
            desc="Stream copy, seconds"
          />
          <ModeCard
            active={options.mode === 'reencode'}
            onClick={() => setOptions((o) => ({ ...o, mode: 'reencode' }))}
            icon={<Cog className="w-4 h-4" />}
            title="Re-encode"
            desc="Custom quality, slower"
          />
        </div>
      </fieldset>}

      {/* Resolution (only for re-encode) */}
      {(projectId||options.mode === 'reencode') && (
        <SelectField
          label="Resolution"
          value={options.resolution}
          onChange={(v) => setOptions((o) => ({ ...o, resolution: v as ExportOptions['resolution'] }))}
          options={[
            { value: '720p', label: '720p (HD)' },
            { value: '1080p', label: '1080p (Full HD)' },
            { value: '4k', label: '4K (Ultra HD)' },
          ]}
        />
      )}

      {/* Format */}
      <SelectField
        label="Format"
        value={options.format}
        onChange={(v) => setOptions((o) => ({ ...o, format: v as ExportOptions['format'] }))}
        options={[
          { value: 'mp4', label: 'MP4 (H.264)' },
          { value: 'mov', label: 'MOV (QuickTime)' },
          { value: 'webm', label: 'WebM (VP9)' },
        ]}
      />

      {/* Audio enhancement */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={studioSoundEnabled}
          onChange={(e) => setStudioSoundEnabled(e.target.checked)}
          className="w-4 h-4 rounded bg-editor-surface border-editor-border accent-editor-accent"
        />
        <span className="text-xs">Enhance audio (Studio Sound)</span>
      </label>

      {/* Captions */}
      <SelectField
        label="Captions"
        value={options.captions}
        onChange={(v) => {setOptions((o) => ({ ...o, captions: v as ExportOptions['captions'] }));useCompositionStore.setState({captionsPreview:v==='burn-in'});}}
        options={[
          { value: 'none', label: 'No captions' },
          { value: 'burn-in', label: 'Burn-in (permanent)' },
          { value: 'sidecar', label: 'Sidecar SRT file' },
        ]}
      />
      </>}

      {/* Export button */}
      <button
        onClick={handleExport}
        disabled={isExporting || !videoPath}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-editor-accent hover:bg-editor-accent-hover disabled:opacity-50 rounded-lg text-sm font-semibold transition-colors"
      >
        {isExporting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {exportStage || 'Exporting'}... {Math.round(exportProgress)}%
          </>
        ) : (
          <>
            <Download className="w-4 h-4" />
            {exportTarget==='resolve'?'Export for DaVinci Resolve':'Export video'}
          </>
        )}
      </button>
      {isExporting&&jobId&&<button className="w-full text-xs text-editor-text-muted" onClick={()=>void window.electronAPI?.cancelJob(jobId)}>Cancel export</button>}

      {exportTarget==='video'&&!projectId&&options.mode === 'fast' && !hasCuts && (
        <p className="text-[10px] text-editor-text-muted text-center">
          Fast mode uses stream copy &mdash; no quality loss, exports in seconds.
        </p>
      )}
      {exportTarget==='video'&&!projectId&&options.mode === 'fast' && hasCuts && (
        <div className="flex items-start gap-1.5 p-2 bg-editor-accent/10 rounded text-[10px] text-editor-accent">
          <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>
            Word-level cuts require re-encoding for frame-accurate output. Export will
            automatically use re-encode mode. This takes longer but ensures your cuts are precise.
          </span>
        </div>
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors ${
        active
          ? 'border-editor-accent bg-editor-accent/10'
          : 'border-editor-border hover:border-editor-text-muted'
      }`}
    >
      {icon}
      <span className="text-xs font-medium">{title}</span>
      <span className="text-[10px] text-editor-text-muted">{desc}</span>
    </button>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-editor-text-muted font-medium">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-editor-surface border border-editor-border rounded-lg text-xs text-editor-text focus:outline-none focus:border-editor-accent"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}
