import type { TranscriptionResult, Word } from '../types/project';

export interface TranscriptCleanupResult extends TranscriptionResult {
  corrections: Array<{ index: number; text: string; reason: string }>;
  paragraphStarts: number[];
}

export async function cleanTranscript(
  backendUrl: string,
  words: Word[],
  language: string,
): Promise<TranscriptCleanupResult> {
  const response = await fetch(`${backendUrl}/ai/clean-transcript`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      language,
      words: words.map((word, index) => ({ ...word, index })),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(typeof data.detail === 'string' ? data.detail : 'Codex could not improve the transcript.');
  }
  const withoutTransportIndex = (word: Word & { index?: number }): Word => {
    const { index: _index, ...timedWord } = word;
    return timedWord;
  };
  return {
    ...data,
    language,
    words: (data.words || []).map(withoutTransportIndex),
    segments: (data.segments || []).map((segment: TranscriptionResult['segments'][number]) => ({
      ...segment,
      words: segment.words.map(withoutTransportIndex),
    })),
  } as TranscriptCleanupResult;
}
