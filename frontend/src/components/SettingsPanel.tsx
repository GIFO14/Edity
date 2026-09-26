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

export default function SettingsPanel() {
  const { backendUrl } = useEditorStore();
  const [status, setStatus] = useState<CodexStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const checkStatus = useCallback(async (testConnection = false) => {
    if (testConnection) setTesting(true); else setChecking(true);
    setError('');
    try {
      const response = await fetch(`${backendUrl}/ai/codex-status${testConnection ? '/test' : ''}`,
        { method: testConnection ? 'POST' : 'GET' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Could not check Codex CLI');
      setStatus(data);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setChecking(false);
      setTesting(false);
    }
  }, [backendUrl]);

  useEffect(() => { void checkStatus(); }, [checkStatus]);

  const installed = status?.installed === true;
  const authenticated = status?.authenticated === true;
  const connected = status?.connection_ok === true;

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
      <button type="button" onClick={() => void checkStatus()} disabled={checking || testing}
        className="flex items-center justify-center gap-2 rounded-lg border border-editor-border bg-editor-surface p-2 hover:border-editor-accent disabled:opacity-50">
        {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
        Check again
      </button>
      <button type="button" onClick={() => void checkStatus(true)} disabled={!authenticated || checking || testing}
        className="flex items-center justify-center gap-2 rounded-lg bg-editor-accent p-2 text-white hover:bg-editor-accent-hover disabled:opacity-50">
        {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wifi className="w-4 h-4" />}
        {testing ? 'Testing…' : 'Test connection'}
      </button>
    </div>

    <p className="text-[11px] text-editor-text-muted">
      The connection test sends a minimal request through your local Codex CLI. The CLI chooses the model available to your ChatGPT account.
    </p>
  </div>;
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
