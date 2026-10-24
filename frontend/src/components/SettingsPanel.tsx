import { useCallback, useEffect, useState } from 'react';
import { Bot, CheckCircle2, CircleAlert, Loader2, RefreshCw, Wifi } from 'lucide-react';
import { useEditorStore } from '../store/editorStore';

type CodexStatus = {
  installed: boolean;
  authenticated: boolean;
  connection_ok: boolean | null;
  version: string;
  message: string;
  connection_message?: string;
};

type AISettings = {
  model: string;
  reasoning_effort: string;
  last_used_model: string;
  models: Array<{ id: string; name: string; default_effort: string;
    effort_levels: Array<{ id: string; description: string }> }>;
  catalog_error: string;
};

export default function SettingsPanel() {
  const { backendUrl } = useEditorStore();
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [model, setModel] = useState('');
  const [modelChoice, setModelChoice] = useState('');
  const [effort, setEffort] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const checkStatus = useCallback(async (testConnection = false, refreshCatalog = false) => {
    if (testConnection) setTesting(true); else setChecking(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/ai/codex-status${testConnection ? '/test' : ''}`,
        { method: testConnection ? 'POST' : 'GET' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not check Codex CLI');
      setStatus(data);
      const settingsResponse = await fetch(`${backendUrl}/ai/settings${refreshCatalog ? '?refresh=true' : ''}`);
      const preferences = await settingsResponse.json() as AISettings & { detail?: string };
      if (!settingsResponse.ok) throw new Error(preferences.detail || 'Could not load AI settings');
      setSettings(preferences);
      setModel(preferences.model);
      setEffort(preferences.reasoning_effort);
      setModelChoice(!preferences.model || preferences.models.some((item) => item.id === preferences.model)
        ? preferences.model : '__custom__');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
      setTesting(false);
    }
  }, [backendUrl]);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  const savePreferences = async () => {
    setSaving(true);
    setSaved(false);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/ai/settings`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: model.trim(), reasoning_effort: effort }) });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === 'string' ? result.detail : 'Could not save AI settings');
      setSettings((previous) => previous ? { ...previous, ...result } : previous);
      setModel(result.model);
      setEffort(result.reasoning_effort);
      setStatus((previous) => previous ? { ...previous, connection_ok: null, connection_message: undefined } : previous);
      setSaved(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  };

  const installed = status?.installed === true;
  const authenticated = status?.authenticated === true;
  const connected = status?.connection_ok === true;
  const selectedModel = settings?.models.find((item) => item.id === model.trim());
  const catalogLevels = Array.from(new Map((settings?.models || []).flatMap((item) => item.effort_levels)
    .map((level) => [level.id, level])).values());
  const effortLevels = selectedModel?.effort_levels || catalogLevels;
  const chooseModel = (value: string) => {
    setModel(value);
    const levels = settings?.models.find((item) => item.id === value.trim())?.effort_levels || catalogLevels;
    if (effort && levels.length && !levels.some((level) => level.id === effort)) setEffort('');
    setSaved(false);
  };

  return <div className="p-4 space-y-5 text-xs">
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <Bot className="w-5 h-5 text-editor-accent" />
        <h3 className="text-sm font-semibold">Codex CLI</h3>
      </div>
      <p className="text-editor-text-muted">
        Edity uses the Codex CLI and your ChatGPT sign-in for every AI feature. No API key is needed.
      </p>
    </div>

    <div className="space-y-2">
      <label htmlFor="ai-model" className="block text-sm font-semibold">AI model</label>
      <select id="ai-model" value={modelChoice} disabled={!settings || checking || testing || saving}
        onChange={(event) => {
          setModelChoice(event.target.value);
          chooseModel(event.target.value === '__custom__' ? '' : event.target.value);
        }} className="w-full rounded-lg border border-editor-border bg-editor-surface p-2 text-editor-text">
        <option value="">Automatic (Codex CLI default)</option>
        {(settings?.models || []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
        <option value="__custom__">Custom model ID…</option>
      </select>
      {modelChoice === '__custom__' && <input aria-label="Custom model ID" value={model}
        maxLength={128} disabled={checking || testing || saving}
        onChange={(event) => chooseModel(event.target.value)}
        placeholder="Enter the exact model ID"
        className="w-full rounded-lg border border-editor-border bg-editor-surface p-2 text-editor-text" />}
      <p className="text-editor-text-muted">Applies to every project and AI feature, including media analysis. Changes apply to the next requests.</p>
      {settings?.last_used_model && <p className="text-editor-text-muted">Last used: <strong className="text-editor-text">{settings.last_used_model}</strong></p>}
      {settings?.catalog_error && <p className="text-editor-text-muted">{settings.catalog_error}</p>}
      <label htmlFor="ai-effort" className="block text-sm font-semibold pt-2">Effort level</label>
      <select id="ai-effort" value={effort} disabled={!settings || checking || testing || saving}
        onChange={(event) => { setEffort(event.target.value); setSaved(false); }}
        className="w-full rounded-lg border border-editor-border bg-editor-surface p-2 text-editor-text">
        <option value="">Automatic{selectedModel?.default_effort ? ` (${selectedModel.default_effort})` : ' (model default)'}</option>
        {effortLevels.map((level) => <option key={level.id} value={level.id}>{effortLabel(level.id)}</option>)}
        {effort && !effortLevels.some((level) => level.id === effort) && <option value={effort}>{effortLabel(effort)} (saved)</option>}
      </select>
      <p className="text-editor-text-muted">
        {effort ? effortLevels.find((level) => level.id === effort)?.description || `Use ${effortLabel(effort)} reasoning effort.`
          : 'Automatic uses the model’s default reasoning effort.'}
        {' '}Higher effort can take longer.
      </p>
      {!selectedModel && <p className="text-editor-text-muted">Levels come from the CLI catalog; availability depends on the model used.</p>}
      <button type="button" onClick={() => void savePreferences()}
        disabled={!settings || checking || testing || saving || (modelChoice === '__custom__' && !model.trim())}
        className="w-full rounded-lg bg-editor-accent p-2 text-white hover:bg-editor-accent-hover disabled:opacity-50">
        {saving ? 'Saving…' : saved ? 'Settings saved' : 'Apply settings'}
      </button>
    </div>

    <div className="rounded-lg border border-editor-border bg-editor-surface divide-y divide-editor-border">
      <StatusRow label="Codex CLI installed" ready={installed} pending={!status || checking}
        detail={status?.version || (installed ? 'Installed' : 'Codex CLI not found')} />
      <StatusRow label="ChatGPT session" ready={authenticated} pending={!status || checking}
        detail={authenticated ? status?.message || 'Signed in' : 'Not signed in'} />
      <StatusRow label="Live Codex connection" ready={connected} pending={testing}
        neutral={status?.connection_ok === null || status?.connection_ok === undefined}
        detail={status?.connection_message || (authenticated
          ? 'Press Test connection to verify that Codex can answer.' : 'Sign in before testing the connection.')} />
    </div>

    {error && <p className="rounded border border-editor-danger/40 bg-editor-danger/10 p-2 text-editor-danger">{error}</p>}

    {!authenticated && status && <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-3 space-y-1">
      <strong className="text-amber-300">Codex needs a ChatGPT session</strong>
      <p className="text-editor-text-muted">Open a terminal, run <code className="text-editor-text">codex login</code>, finish the sign-in, then press Check again.</p>
    </div>}

    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={() => void checkStatus(false, true)} disabled={checking || testing || saving}
        className="flex items-center justify-center gap-2 rounded-lg border border-editor-border bg-editor-surface p-2 hover:border-editor-accent disabled:opacity-50">
        {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Check again
      </button>
      <button type="button" onClick={() => void checkStatus(true)} disabled={!authenticated || checking || testing || saving || (!!settings && (model.trim() !== settings.model || effort !== settings.reasoning_effort))}
        className="flex items-center justify-center gap-2 rounded-lg bg-editor-accent p-2 text-white hover:bg-editor-accent-hover disabled:opacity-50">
        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
        {testing ? 'Testing…' : 'Test connection'}
      </button>
    </div>

    <p className="text-[11px] text-editor-text-muted">
      The connection test uses the saved model and effort. Check again refreshes the CLI catalog.
    </p>
  </div>;
}

function effortLabel(id: string) {
  return id === 'xhigh' ? 'Extra high' : id.charAt(0).toUpperCase() + id.slice(1);
}

function StatusRow({ label, ready, pending, neutral = false, detail }: {
  label: string;
  ready: boolean;
  pending: boolean;
  neutral?: boolean;
  detail: string;
}) {
  return <div className="flex items-start gap-3 p-3">
    {pending ? <Loader2 className="mt-0.5 w-4 h-4 shrink-0 animate-spin text-editor-accent" />
      : ready ? <CheckCircle2 className="mt-0.5 w-4 h-4 shrink-0 text-editor-success" />
        : <CircleAlert className={`mt-0.5 w-4 h-4 shrink-0 ${neutral ? 'text-editor-text-muted' : 'text-editor-danger'}`} />}
    <span className="min-w-0"><strong className="block">{label}</strong>
      <span className="block break-words text-editor-text-muted">{detail}</span></span>
  </div>;
}
