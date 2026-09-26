import { create } from 'zustand';
import { temporal } from 'zundo';
import type { Word, Segment, DeletedRange, TranscriptionResult, MediaItem, ChatMessage,
  ProjectClip, MediaFolders, SoundEvent } from '../types/project';
import { getEffectiveCutRanges } from '../lib/cutRanges';

interface EditorState {
  videoPath: string | null;
  videoUrl: string | null;
  words: Word[];
  segments: Segment[];
  deletedRanges: DeletedRange[];
  soundEvents: SoundEvent[];
  mediaItems: MediaItem[];
  chatMessages: ChatMessage[];
  language: string;
  clips: ProjectClip[];
  mediaFolders: MediaFolders;
  studioSoundEnabled: boolean;

  currentTime: number;
  duration: number;
  isPlaying: boolean;

  selectedWordIndices: number[];
  hoveredWordIndex: number | null;

  isTranscribing: boolean;
  transcriptionProgress: number;
  isExporting: boolean;
  exportProgress: number;

  backendUrl: string;
}

interface EditorActions {
  setBackendUrl: (url: string) => void;
  loadVideo: (path: string) => void;
  releaseVideo: () => void;
  refreshVideo: (path: string, duration?: number) => void;
  setTranscription: (result: TranscriptionResult) => void;
  applyTranscriptCleanup: (result: TranscriptionResult) => boolean;
  addClipTranscription: (clipId: string, result: TranscriptionResult) => void;
  updateClips: (clips: ProjectClip[]) => void;
  removeClipData: (clipId: string, clips: ProjectClip[]) => void;
  setMediaFolder: (type: keyof MediaFolders, path: string) => void;
  setStudioSoundEnabled: (enabled: boolean) => void;
  replaceSoundEvents: (events: SoundEvent[], clipId?: string) => void;
  markSoundEvents: (ids: string[], marked: boolean) => void;
  updateWordText: (index: number, text: string) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setIsPlaying: (playing: boolean) => void;
  setSelectedWordIndices: (indices: number[]) => void;
  setHoveredWordIndex: (index: number | null) => void;
  deleteSelectedWords: () => void;
  deleteWordRange: (startIndex: number, endIndex: number) => void;
  markWordRanges: (ranges: Array<{ startIndex: number; endIndex: number }>) => void;
  addChatMessage: (message: ChatMessage) => void;
  markChatPlanApplied: (id: string) => void;
  restoreRange: (rangeId: string) => void;
  setCutBoundary: (rangeId: string, side: 'start' | 'end', time: number | null) => void;
  addMediaItem: (item: MediaItem) => void;
  removeMediaItem: (id: string) => void;
  setTranscribing: (active: boolean, progress?: number) => void;
  setExporting: (active: boolean, progress?: number) => void;
  getKeepSegments: () => Array<{ start: number; end: number }>;
  getWordAtTime: (time: number) => number;
  loadProject: (projectData: any) => void;
  reset: () => void;
}

const initialState: EditorState = {
  videoPath: null,
  videoUrl: null,
  words: [],
  segments: [],
  deletedRanges: [],
  soundEvents: [],
  mediaItems: [],
  chatMessages: [],
  language: '',
  clips: [],
  mediaFolders: { image: '', broll: '', music: '' },
  studioSoundEnabled: false,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  selectedWordIndices: [],
  hoveredWordIndex: null,
  isTranscribing: false,
  transcriptionProgress: 0,
  isExporting: false,
  exportProgress: 0,
  backendUrl: 'http://localhost:8643',
};

export const useEditorStore = create<EditorState & EditorActions>()(
  temporal(
    (set, get) => ({
      ...initialState,

      setBackendUrl: (url) => set({ backendUrl: url }),

      loadVideo: (path) => {
        const backend = get().backendUrl;
        const url = `${backend}/file?path=${encodeURIComponent(path)}`;
        set({
          ...initialState,
          backendUrl: backend,
          videoPath: path,
          videoUrl: url,
        });
      },

      setTranscription: (result) => {
        const clipId = get().clips[0]?.id;
        let globalIdx = 0;
        const annotatedSegments = result.segments.map((seg) => {
          const segmentWords = seg.words.map((word) => ({ ...word, clipId }));
          const annotated = { ...seg, words: segmentWords, clipId, globalStartIndex: globalIdx };
          globalIdx += seg.words.length;
          return annotated;
        });
        set({
          words: result.words.map((word) => ({ ...word, clipId })),
          segments: annotatedSegments,
          language: result.language,
          deletedRanges: [],
          selectedWordIndices: [],
        });
      },

      applyTranscriptCleanup: (result) => {
        const state = get();
        if (result.words.length !== state.words.length) return false;
        const words = state.words.map((word, index) => ({ ...word, word: result.words[index].word }));
        const expectedWords = result.segments.reduce((total, segment) => total + segment.words.length, 0);
        if (expectedWords !== words.length) return false;
        let cursor = 0;
        const segments = result.segments.map((segment, id) => {
          const segmentWords = words.slice(cursor, cursor + segment.words.length);
          const globalStartIndex = cursor;
          cursor += segmentWords.length;
          return {
            ...segment,
            id,
            start: segmentWords[0]?.start ?? segment.start,
            end: segmentWords.at(-1)?.end ?? segment.end,
            text: segmentWords.map((word) => word.word).join(' '),
            words: segmentWords,
            clipId: segmentWords[0]?.clipId,
            globalStartIndex,
          };
        });
        set({ words, segments, language: result.language || state.language });
        return true;
      },

      releaseVideo: () => set({ videoUrl: null, isPlaying: false }),
      refreshVideo: (path, duration) => {
        const backend = get().backendUrl;
        set({ videoPath: path,
          videoUrl: `${backend}/file?path=${encodeURIComponent(path)}&v=${Date.now()}`,
          duration: duration ?? get().duration,
          currentTime: 0,
          isPlaying: false });
      },

      addClipTranscription: (clipId, result) => {
        const state = get();
        const clip = state.clips.find((item) => item.id === clipId);
        if (!clip) return;
        const offset = clip.start;
        const incomingWords = result.words.map((word) => ({ ...word, clipId,
          start: word.start + offset, end: word.end + offset }));
        const incomingSegments = result.segments.map((segment) => ({ ...segment, clipId,
          start: segment.start + offset, end: segment.end + offset,
          words: segment.words.map((word) => ({ ...word, clipId,
            start: word.start + offset, end: word.end + offset })) }));
        const words = [...state.words, ...incomingWords].sort((a, b) => a.start - b.start);
        let globalStartIndex = 0;
        const segments = [...state.segments, ...incomingSegments].sort((a, b) => a.start - b.start)
          .map((segment) => {
            const annotated = { ...segment, globalStartIndex };
            globalStartIndex += segment.words.length;
            return annotated;
          });
        set({ words, segments, language: state.language || result.language });
      },

      updateClips: (clips) => {
        const state = get();
        const starts = new Map(clips.map((clip) => [clip.id, clip.start]));
        const oldStarts = new Map(state.clips.map((clip) => [clip.id, clip.start]));
        const shiftWord = (word: Word) => {
          if (!word.clipId || !starts.has(word.clipId)) return word;
          const shift = starts.get(word.clipId)! - (oldStarts.get(word.clipId) || 0);
          return { ...word, start: word.start + shift, end: word.end + shift };
        };
        const words = state.words.map(shiftWord);
        const segments = state.segments.map((segment) => {
          if (!segment.clipId || !starts.has(segment.clipId)) return segment;
          const shift = starts.get(segment.clipId)! - (oldStarts.get(segment.clipId) || 0);
          return { ...segment, start: segment.start + shift, end: segment.end + shift,
            words: segment.words.map(shiftWord) };
        });
        const soundEvents = state.soundEvents.map((event) => {
          if (!event.clipId || !starts.has(event.clipId)) return event;
          const shift = starts.get(event.clipId)! - (oldStarts.get(event.clipId) || 0);
          return { ...event, start: event.start + shift, end: event.end + shift };
        });
        set({ clips, words, segments, soundEvents });
      },

      removeClipData: (clipId, clips) => {
        const state = get();
        const removedClip = state.clips.find((clip) => clip.id === clipId);
        const keptOldIndices: number[] = [];
        const oldStarts = new Map(state.clips.map((clip) => [clip.id, clip.start]));
        const newStarts = new Map(clips.map((clip) => [clip.id, clip.start]));
        const words = state.words.flatMap((word, index) => {
          if (word.clipId === clipId) return [];
          keptOldIndices.push(index);
          if (!word.clipId || !newStarts.has(word.clipId)) return [word];
          const shift = newStarts.get(word.clipId)! - (oldStarts.get(word.clipId) || 0);
          return [{ ...word, start: word.start + shift, end: word.end + shift }];
        });
        const indexMap = new Map(keptOldIndices.map((oldIndex, newIndex) => [oldIndex, newIndex]));
        let globalStartIndex = 0;
        const segments = state.segments.filter((segment) => segment.clipId !== clipId).map((segment) => {
          const shift = segment.clipId && newStarts.has(segment.clipId)
            ? newStarts.get(segment.clipId)! - (oldStarts.get(segment.clipId) || 0) : 0;
          const annotated = { ...segment, start: segment.start + shift, end: segment.end + shift,
            words: segment.words.map((word) => ({ ...word, start: word.start + shift, end: word.end + shift })),
            globalStartIndex };
          globalStartIndex += annotated.words.length;
          return annotated;
        });
        const deletedRanges = state.deletedRanges.flatMap((range) => {
          const wordIndices = range.wordIndices.flatMap((index) => indexMap.has(index) ? [indexMap.get(index)!] : []);
          if (!wordIndices.length) return [];
          return [{ ...range, wordIndices, start: words[wordIndices[0]].start,
            end: words[wordIndices[wordIndices.length - 1]].end }];
        });
        const removedStart = removedClip?.start ?? 0;
        const removedEnd = removedStart + (removedClip?.duration ?? 0);
        const mediaItems = state.mediaItems.flatMap((item) => {
          if (!removedClip || item.end <= removedStart) return [item];
          if (item.start >= removedEnd) return [{ ...item, start: item.start - removedClip.duration,
            end: item.end - removedClip.duration }];
          if (item.start < removedStart && item.end > removedEnd) {
            return [{ ...item, end: item.end - removedClip.duration }];
          }
          if (item.start < removedStart) return [{ ...item, end: removedStart }];
          if (item.end > removedEnd) return [{ ...item, start: removedStart,
            end: item.end - removedClip.duration }];
          return [];
        }).filter((item) => item.end > item.start);
        const soundEvents = state.soundEvents.flatMap((event) => {
          if (event.clipId === clipId) return [];
          if (!event.clipId || !newStarts.has(event.clipId)) return [event];
          const shift = newStarts.get(event.clipId)! - (oldStarts.get(event.clipId) || 0);
          return [{ ...event, start: event.start + shift, end: event.end + shift }];
        });
        set({ clips, words, segments, deletedRanges, mediaItems, soundEvents, selectedWordIndices: [] });
      },

      setMediaFolder: (type, path) => set((state) => ({
        mediaFolders: { ...state.mediaFolders, [type]: path },
      })),

      setStudioSoundEnabled: (enabled) => set({ studioSoundEnabled: enabled }),

      replaceSoundEvents: (events, clipId) => {
        const state = get();
        if (clipId) {
          const clip = state.clips.find((item) => item.id === clipId);
          if (!clip) return;
          const existing = new Map(state.soundEvents.map((event) => [event.id, event]));
          const incoming = events.map((event) => {
            const id = `${clipId}_${event.id}`;
            return { ...event, id, clipId, markedForRemoval: existing.get(id)?.markedForRemoval ?? event.markedForRemoval,
              start: event.start + clip.start, end: event.end + clip.start };
          });
          set({ soundEvents: [...state.soundEvents.filter((event) => event.clipId !== clipId), ...incoming]
            .sort((a, b) => a.start - b.start) });
          return;
        }
        const existing = new Map(state.soundEvents.map((event) => [event.id, event]));
        const annotated = events.map((event) => {
          const clip = state.clips.find((item, index) => event.start >= item.start
            && (event.start < item.start + item.duration || index === state.clips.length - 1));
          return { ...event, clipId: clip?.id,
            markedForRemoval: existing.get(event.id)?.markedForRemoval ?? event.markedForRemoval };
        });
        set({ soundEvents: annotated.sort((a, b) => a.start - b.start) });
      },

      markSoundEvents: (ids, marked) => {
        const selected = new Set(ids);
        set((state) => ({ soundEvents: state.soundEvents.map((event) => selected.has(event.id)
          ? { ...event, markedForRemoval: marked } : event) }));
      },

      setCurrentTime: (time) => set({ currentTime: time }),
      setDuration: (duration) => set((state) => ({ duration,
        clips: state.clips.length === 1 && state.clips[0].duration <= 0
          ? [{ ...state.clips[0], start: 0, duration }] : state.clips })),
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      setSelectedWordIndices: (indices) => set({ selectedWordIndices: indices }),
      setHoveredWordIndex: (index) => set({ hoveredWordIndex: index }),

      deleteSelectedWords: () => {
        const { selectedWordIndices } = get();
        if (selectedWordIndices.length === 0) return;
        const sorted = [...selectedWordIndices].sort((a, b) => a - b);
        get().markWordRanges([{ startIndex: sorted[0], endIndex: sorted[sorted.length - 1] }]);
        set({ selectedWordIndices: [] });
      },

      deleteWordRange: (startIndex, endIndex) => get().markWordRanges([{ startIndex, endIndex }]),

      markWordRanges: (ranges) => {
        const { words, deletedRanges } = get();
        const marked = new Set(deletedRanges.flatMap((range) => range.wordIndices));
        const additions: DeletedRange[] = [];
        for (const { startIndex, endIndex } of ranges) {
          if (!Number.isInteger(startIndex) || !Number.isInteger(endIndex)
            || startIndex < 0 || endIndex >= words.length || startIndex > endIndex) continue;
          let run: number[] = [];
          const flush = () => {
            if (!run.length) return;
            additions.push({ id: `dr_${crypto.randomUUID()}`, start: words[run[0]].start,
              end: words[run[run.length - 1]].end, wordIndices: run });
            run = [];
          };
          for (let i = startIndex; i <= endIndex; i++) {
            if (marked.has(i)) { flush(); continue; }
            marked.add(i);
            run.push(i);
          }
          flush();
        }
        if (additions.length) set({ deletedRanges: [...deletedRanges, ...additions] });
      },

      addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
      markChatPlanApplied: (id) => set((state) => ({ chatMessages: state.chatMessages.map((message) =>
        message.id === id && message.plan ? { ...message, plan: { ...message.plan, marked: true } } : message) })),

      restoreRange: (rangeId) => {
        const { deletedRanges } = get();
        set({ deletedRanges: deletedRanges.filter((r) => r.id !== rangeId) });
      },

      setCutBoundary: (rangeId, side, time) => {
        if (time !== null && (!Number.isFinite(time) || time < 0)) return;
        set((state) => ({ deletedRanges: state.deletedRanges.map((range) => {
          if (range.id !== rangeId) return range;
          const key = side === 'start' ? 'cutStart' : 'cutEnd';
          if (time === null) {
            const updated = { ...range };
            delete updated[key];
            return updated;
          }
          const other = side === 'start' ? range.cutEnd ?? range.end : range.cutStart ?? range.start;
          if (side === 'start' && time >= other || side === 'end' && time <= other) return range;
          return { ...range, [key]: Math.round(time * 1000) / 1000 };
        }) }));
      },

      updateWordText: (index, text) => {
        const replacement = text.trim();
        const state = get();
        if (!replacement || index < 0 || index >= state.words.length) return;
        const words = state.words.map((word, i) => i === index ? { ...word, word: replacement } : word);
        const segments = state.segments.map((segment) => {
          const segmentWords = words.slice(segment.globalStartIndex, segment.globalStartIndex + segment.words.length);
          return { ...segment, words: segmentWords, text: segmentWords.map((word) => word.word).join(' ') };
        });
        set({ words, segments });
      },

      addMediaItem: (item) => set((state) => ({ mediaItems: [...state.mediaItems, item] })),
      removeMediaItem: (id) => set((state) => ({ mediaItems: state.mediaItems.filter((item) => item.id !== id) })),

      setTranscribing: (active, progress) =>
        set({
          isTranscribing: active,
          transcriptionProgress: progress ?? (active ? 0 : 100),
        }),

      setExporting: (active, progress) =>
        set({
          isExporting: active,
          exportProgress: progress ?? (active ? 0 : 100),
        }),

      getKeepSegments: () => {
        const { words, deletedRanges, soundEvents, duration } = get();
        const videoEnd = Math.max(duration || 0, words[words.length - 1]?.end || 0);
        if (!deletedRanges.length && !soundEvents.some((event) => event.markedForRemoval)) {
          return [{ start: 0, end: videoEnd }];
        }
        const cuts = getEffectiveCutRanges(words, deletedRanges, videoEnd, soundEvents);
        const segments: Array<{ start: number; end: number }> = [];
        let cursor = 0;
        for (const cut of cuts) {
          if (cut.start > cursor) segments.push({ start: cursor, end: cut.start });
          cursor = Math.max(cursor, cut.end);
        }
        if (cursor < videoEnd) segments.push({ start: cursor, end: videoEnd });
        return segments;
      },

      getWordAtTime: (time) => {
        const { words } = get();
        let lo = 0;
        let hi = words.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (words[mid].end < time) lo = mid + 1;
          else if (words[mid].start > time) hi = mid - 1;
          else return mid;
        }
        return lo < words.length ? lo : words.length - 1;
      },

      loadProject: (data) => {
        const backend = get().backendUrl;
        const url = `${backend}/file?path=${encodeURIComponent(data.videoPath)}`;
        const clips: ProjectClip[] = data.clips || [];
        const legacyClipId = clips[0]?.id;

        let globalIdx = 0;
        const annotatedSegments = (data.segments || []).map((seg: Segment) => {
          const clipId = seg.clipId || legacyClipId;
          const annotated = { ...seg, clipId,
            words: seg.words.map((word) => ({ ...word, clipId: word.clipId || clipId })),
            globalStartIndex: globalIdx };
          globalIdx += seg.words.length;
          return annotated;
        });

        set({
          ...initialState,
          backendUrl: backend,
          videoPath: data.videoPath,
          videoUrl: url,
          words: (data.words || []).map((word: Word) => ({ ...word, clipId: word.clipId || legacyClipId })),
          segments: annotatedSegments,
          deletedRanges: data.deletedRanges || [],
          soundEvents: data.soundEvents || [],
          mediaItems: data.mediaItems || [],
          chatMessages: data.chatMessages || [],
          language: data.language || '',
          clips: clips.map((clip: ProjectClip) => ({ ...clip })),
          mediaFolders: data.mediaFolders || { image: '', broll: '', music: '' },
          studioSoundEnabled: data.studioSoundEnabled === true,
        });
      },

      reset: () => set(initialState),
    }),
    { limit: 100 },
  ),
);
