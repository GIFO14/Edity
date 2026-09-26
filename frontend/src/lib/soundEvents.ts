import type { SoundEvent, Word } from '../types/project';

type Progress = { progress?: number; message?: string; current?: number; total?: number };

export async function scanSoundEvents(
  backendUrl: string,
  filePath: string,
  words: Word[],
  onProgress?: (event: Progress) => void,
): Promise<SoundEvent[]> {
  const response = await fetch(`${backendUrl}/audio/events/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath, words: words.map(({ start, end }) => ({ start, end })) }),
  });
  if (!response.ok || !response.body) throw new Error(`Sound detection failed: ${response.statusText}`);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: SoundEvent[] | null = null;
  const handleLine = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (event.type === 'status' || event.type === 'progress') onProgress?.(event);
    if (event.type === 'error') throw new Error(event.detail || 'Sound event detection failed');
    if (event.type === 'result') result = event.data?.events || [];
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
  if (result === null) throw new Error('Sound detection ended without a result');
  return result;
}
