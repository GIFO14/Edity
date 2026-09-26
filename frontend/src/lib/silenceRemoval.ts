type SilenceProgress = {
  message: string;
  progress: number;
  phase_progress: number;
};

export async function removeSilence(
  backendUrl: string,
  request: { file_path: string; preset: string; custom_margin?: number },
  onProgress?: (progress: SilenceProgress) => void,
): Promise<{ output_path: string; margin_seconds: number }> {
  const response = await fetch(`${backendUrl}/silence/remove/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!response.ok || !response.body) throw new Error(`Silence removal failed: ${response.statusText}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: { output_path: string; margin_seconds: number } | null = null;
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'progress') onProgress?.(event);
    if (event.type === 'error') throw new Error(event.detail || 'Silence removal failed');
    if (event.type === 'result') result = event.data;
  };
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split('\n');
    pending = lines.pop() || '';
    lines.forEach(handleLine);
    if (done) {
      handleLine(pending);
      break;
    }
  }
  if (!result) throw new Error('Silence removal ended without a result');
  return result;
}
