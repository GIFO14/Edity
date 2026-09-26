import { Fragment, useCallback, useRef, useEffect, useMemo, useState } from 'react';
import { useEditorStore } from '../store/editorStore';
import { Virtuoso } from 'react-virtuoso';
import { AudioLines, Trash2, RotateCcw } from 'lucide-react';
import { seekSourceTime, sourceTimeAt } from '../lib/playbackTime';

export default function TranscriptEditor() {
  const words = useEditorStore((s) => s.words);
  const segments = useEditorStore((s) => s.segments);
  const deletedRanges = useEditorStore((s) => s.deletedRanges);
  const selectedWordIndices = useEditorStore((s) => s.selectedWordIndices);
  const hoveredWordIndex = useEditorStore((s) => s.hoveredWordIndex);
  const setSelectedWordIndices = useEditorStore((s) => s.setSelectedWordIndices);
  const setHoveredWordIndex = useEditorStore((s) => s.setHoveredWordIndex);
  const deleteSelectedWords = useEditorStore((s) => s.deleteSelectedWords);
  const updateWordText = useEditorStore((s) => s.updateWordText);
  const restoreRange = useEditorStore((s) => s.restoreRange);
  const setCutBoundary = useEditorStore((s) => s.setCutBoundary);
  const videoPath = useEditorStore((s) => s.videoPath);
  const backendUrl = useEditorStore((s) => s.backendUrl);
  const language = useEditorStore((s) => s.language);
  const getWordAtTime = useEditorStore((s) => s.getWordAtTime);
  const clips = useEditorStore((s) => s.clips);
  const soundEvents = useEditorStore((s) => s.soundEvents);
  const markSoundEvents = useEditorStore((s) => s.markSoundEvents);

  const selectionStart = useRef<number | null>(null);
  const [aligningCut, setAligningCut] = useState(false);
  const [alignmentError, setAlignmentError] = useState('');
  const wasDragging = useRef(false);
  const virtuosoRef = useRef<any>(null);
  const lastVisibleSegment = useRef(-1);

  const deletedSet = useMemo(() => {
    const s = new Set<number>();
    for (const range of deletedRanges) {
      for (const idx of range.wordIndices) s.add(idx);
    }
    return s;
  }, [deletedRanges]);

  const selectedSet = useMemo(() => new Set(selectedWordIndices), [selectedWordIndices]);
  const selectedCut = useMemo(() => deletedRanges.find((range) =>
    selectedWordIndices.some((index) => range.wordIndices.includes(index))),
  [deletedRanges, selectedWordIndices]);
  const selectedCutDefaults = useMemo(() => {
    if (!selectedCut?.wordIndices.length) return null;
    const indices = [...selectedCut.wordIndices].sort((a, b) => a - b);
    let first = indices[0];
    while (first > 0 && deletedSet.has(first - 1)) first--;
    let last = indices[indices.length - 1];
    while (last + 1 < words.length && deletedSet.has(last + 1)) last++;
    const before = first - 1;
    const after = last + 1;
    return { start: before >= 0 ? words[before].end : 0,
      end: after < words.length ? words[after].start : useEditorStore.getState().duration,
      previousWord: before >= 0 ? words[before] : null,
      nextWord: after < words.length ? words[after] : null,
      startRange: deletedRanges.find((range) => range.wordIndices.includes(first)) || selectedCut,
      endRange: deletedRanges.find((range) => range.wordIndices.includes(last)) || selectedCut };
  }, [selectedCut, deletedSet, deletedRanges, words]);

  const soundEventsByWord = useMemo(() => {
    const positioned = new Map<number, typeof soundEvents>();
    for (const event of soundEvents) {
      let lo = 0;
      let hi = words.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (words[mid].end < event.start) lo = mid + 1;
        else hi = mid;
      }
      const current = positioned.get(lo) || [];
      current.push(event);
      positioned.set(lo, current);
    }
    return positioned;
  }, [soundEvents, words]);

  const [activeWordIndex, setActiveWordIndex] = useState(-1);

  useEffect(() => {
    if (words.length === 0) return;
    const interval = setInterval(() => {
      const video = document.querySelector('video') as HTMLVideoElement | null;
      if (!video) return;
      const idx = getWordAtTime(sourceTimeAt(video));
      setActiveWordIndex((prev) => (prev === idx ? prev : idx));
    }, 250);
    return () => clearInterval(interval);
  }, [words, getWordAtTime]);

  // Auto-scroll to active segment via Virtuoso
  useEffect(() => {
    if (activeWordIndex < 0 || segments.length === 0) return;
    const segIdx = segments.findIndex((seg) => {
      const start = seg.globalStartIndex ?? 0;
      return activeWordIndex >= start && activeWordIndex < start + seg.words.length;
    });
    if (segIdx >= 0 && virtuosoRef.current) {
      const nearby = Math.abs(segIdx - lastVisibleSegment.current) <= 2;
      virtuosoRef.current.scrollIntoView({ index: segIdx,
        behavior: nearby ? 'smooth' : 'auto', align: 'center' });
      lastVisibleSegment.current = segIdx;
    }
  }, [activeWordIndex, segments]);

  const handleWordMouseDown = useCallback(
    (index: number, e: React.MouseEvent) => {
      e.preventDefault();
      wasDragging.current = false;
      if (e.shiftKey && selectedWordIndices.length > 0) {
        const first = selectedWordIndices[0];
        const start = Math.min(first, index);
        const end = Math.max(first, index);
        const indices = [];
        for (let i = start; i <= end; i++) indices.push(i);
        setSelectedWordIndices(indices);
      } else {
        selectionStart.current = index;
        setSelectedWordIndices([index]);
      }
    },
    [selectedWordIndices, setSelectedWordIndices],
  );

  const handleWordMouseEnter = useCallback(
    (index: number) => {
      setHoveredWordIndex(index);
      if (selectionStart.current !== null) {
        wasDragging.current = true;
        const start = Math.min(selectionStart.current, index);
        const end = Math.max(selectionStart.current, index);
        const indices = [];
        for (let i = start; i <= end; i++) indices.push(i);
        setSelectedWordIndices(indices);
      }
    },
    [setHoveredWordIndex, setSelectedWordIndices],
  );

  const handleMouseUp = useCallback(() => {
    selectionStart.current = null;
  }, []);

  const handleWordClick = useCallback((index: number, start: number, e: React.MouseEvent) => {
    if (wasDragging.current || e.shiftKey || !Number.isFinite(start)) return;
    const video = document.querySelector('video') as HTMLVideoElement | null;
    if (!video) return;
    const time = Math.max(0, Math.min(start, useEditorStore.getState().duration || start));
    seekSourceTime(video, time);
    useEditorStore.getState().setCurrentTime(time);
    setActiveWordIndex(index);
  }, []);

  const handleClickOutside = useCallback(
    (e: React.MouseEvent) => {
      if (wasDragging.current) {
        wasDragging.current = false;
        return;
      }
      if ((e.target as HTMLElement).dataset.wordIndex === undefined) {
        setSelectedWordIndices([]);
      }
    },
    [setSelectedWordIndices],
  );

  const getRangeForWord = useCallback(
    (wordIndex: number) => deletedRanges.find((r) => r.wordIndices.includes(wordIndex)),
    [deletedRanges],
  );

  const renderSoundEvents = useCallback((wordIndex: number) => (soundEventsByWord.get(wordIndex) || []).map((event) => (
    <button key={event.id} type="button"
      title={`${event.label} (${Math.round(event.confidence * 100)}%). Click to seek; click the icon in Audio to review or restore it.`}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        const video = document.querySelector('video') as HTMLVideoElement | null;
        if (video) seekSourceTime(video, event.start);
        useEditorStore.getState().setCurrentTime(event.start);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        markSoundEvents([event.id], !event.markedForRemoval);
      }}
      className={`mx-1 inline-flex items-center gap-1 rounded border px-1.5 py-0.5 align-middle text-[10px] ${event.markedForRemoval
        ? 'border-editor-danger/60 bg-editor-danger/20 text-editor-text-muted line-through'
        : 'border-amber-400/50 bg-amber-400/10 text-amber-300'}`}>
      <AudioLines className="h-3 w-3" />[{event.label}]
    </button>
  )), [markSoundEvents, soundEventsByWord]);

  const renderSegment = useCallback(
    (index: number) => {
      const segment = segments[index];
      if (!segment) return null;
      const previous = index > 0 ? segments[index - 1] : null;
      const startsClip = !!segment.clipId && (!previous || previous.clipId !== segment.clipId);
      const clipIndex = clips.findIndex((clip) => clip.id === segment.clipId);
      const clip = clipIndex >= 0 ? clips[clipIndex] : null;
      return (
        <div className="mb-3 px-4">
          {startsClip && <div className="flex items-center gap-2 my-3 first:mt-1" data-clip-id={segment.clipId}>
            <span className="h-px flex-1 bg-editor-accent/50" />
            <span className="max-w-[70%] truncate rounded-full border border-editor-accent/50 bg-editor-accent/10 px-3 py-1 text-[11px] font-semibold text-editor-accent">
              Clip {clipIndex + 1}{clip?.name ? ` · ${clip.name}` : ''}
            </span>
            <span className="h-px flex-1 bg-editor-accent/50" />
          </div>}
          {segment.speaker && (
            <div className="text-xs text-editor-accent font-medium mb-1">
              {segment.speaker}
            </div>
          )}
          <p className="text-sm leading-relaxed flex flex-wrap">
            {segment.words.map((word, localIndex) => {
              const globalIndex = (segment.globalStartIndex ?? 0) + localIndex;
              const isDeleted = deletedSet.has(globalIndex);
              const isSelected = selectedSet.has(globalIndex);
              const isActive = globalIndex === activeWordIndex;
              const isHovered = globalIndex === hoveredWordIndex;
              const deletedRange = isDeleted ? getRangeForWord(globalIndex) : null;

              return (
                <Fragment key={globalIndex}>
                {renderSoundEvents(globalIndex)}
                <span
                  id={`word-${globalIndex}`}
                  data-word-index={globalIndex}
                  title={isDeleted ? 'Marked for removal in preview and export; click to seek' : 'Click to jump to this word; double-click to correct it'}
                  onMouseDown={(e) => handleWordMouseDown(globalIndex, e)}
                  onClick={(e) => handleWordClick(globalIndex, word.start, e)}
                  onDoubleClick={() => {
                    const corrected = window.prompt('Correct word (timing stays the same):', word.word);
                    if (corrected !== null) updateWordText(globalIndex, corrected);
                  }}
                  onMouseEnter={() => handleWordMouseEnter(globalIndex)}
                  onMouseLeave={() => setHoveredWordIndex(null)}
                  className={`
                    relative px-[2px] py-[1px] rounded cursor-pointer transition-colors
                    ${isDeleted ? 'line-through decoration-2 text-editor-text-muted bg-editor-word-deleted' : ''}
                    ${isSelected && !isDeleted ? 'bg-editor-word-selected text-white' : ''}
                    ${isActive && !isDeleted && !isSelected ? 'bg-editor-accent/20 text-editor-accent' : ''}
                    ${isHovered && !isDeleted && !isSelected && !isActive ? 'bg-editor-word-hover' : ''}
                  `}
                >
                  {word.word}{' '}
                  {isDeleted && isHovered && deletedRange && (
                    <button
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation();
                        restoreRange(deletedRange.id);
                      }}
                      className="absolute -top-5 left-1/2 -translate-x-1/2 flex items-center gap-0.5 px-1.5 py-0.5 bg-editor-surface border border-editor-border rounded text-[10px] text-editor-success whitespace-nowrap z-10"
                    >
                      <RotateCcw className="w-2.5 h-2.5" /> Restore
                    </button>
                  )}
                </span>
                </Fragment>
              );
            })}
            {index === segments.length - 1 && renderSoundEvents(words.length)}
          </p>
        </div>
      );
    },
    [segments, clips, deletedSet, selectedSet, activeWordIndex, hoveredWordIndex, handleWordMouseDown, handleWordClick, handleWordMouseEnter, setHoveredWordIndex, getRangeForWord, restoreRange, updateWordText, renderSoundEvents, words.length],
  );

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-editor-border shrink-0">
        <span className="text-xs text-editor-text-muted flex-1">
          {words.length} words &middot; {deletedSet.size} words and {soundEvents.filter((event) => event.markedForRemoval).length} sounds marked for removal
        </span>
        {selectedWordIndices.length > 0 && (
          <button
            onClick={deleteSelectedWords}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-editor-danger/20 text-editor-danger rounded hover:bg-editor-danger/30 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Mark {selectedWordIndices.length} words for removal
          </button>
        )}
      </div>
      {selectedCut && selectedCutDefaults && <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-editor-border text-xs shrink-0">
        <span className="text-editor-text-muted">Fine tune cut (seconds):</span>
        <CutTimeInput label="Start" time={selectedCutDefaults.startRange.cutStart ?? selectedCutDefaults.start}
          onCommit={(time) => setCutBoundary(selectedCutDefaults.startRange.id, 'start', time)} />
        <CutTimeInput label="End" time={selectedCutDefaults.endRange.cutEnd ?? selectedCutDefaults.end}
          onCommit={(time) => setCutBoundary(selectedCutDefaults.endRange.id, 'end', time)} />
        <button type="button" className="text-editor-accent hover:underline"
          onClick={() => {
            const video = document.querySelector('video') as HTMLVideoElement | null;
            if (!video) return;
            const start = Math.max(0, selectedCutDefaults.start - 0.6);
            seekSourceTime(video, start);
            useEditorStore.getState().setCurrentTime(start);
            void video.play();
          }}>Listen to cut</button>
        <button type="button" disabled={aligningCut || !videoPath}
          className="text-editor-accent hover:underline disabled:opacity-50"
          onClick={async () => {
            if (!videoPath) return;
            setAligningCut(true);
            setAlignmentError('');
            try {
              const response = await fetch(`${backendUrl}/preview/align-cut`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ video_path: videoPath,
                  previous_word: selectedCutDefaults.previousWord,
                  next_word: selectedCutDefaults.nextWord,
                  language: language || 'en', model_size: 'medium' }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.detail || 'Alignment failed');
              if (typeof result.cut_start === 'number') {
                setCutBoundary(selectedCutDefaults.startRange.id, 'start', result.cut_start);
              }
              if (typeof result.cut_end === 'number') {
                setCutBoundary(selectedCutDefaults.endRange.id, 'end', result.cut_end);
              }
              if (result.cut_start === null && result.cut_end === null) {
                throw new Error(result.error || 'Could not identify the neighboring words');
              }
            } catch (error) { setAlignmentError(String(error)); }
            finally { setAligningCut(false); }
          }}>{aligningCut ? 'Aligning speech…' : 'Align speech'}</button>
        <button type="button" className="text-editor-accent hover:underline"
          onClick={() => {
            setCutBoundary(selectedCutDefaults.startRange.id, 'start', null);
            setCutBoundary(selectedCutDefaults.endRange.id, 'end', null);
          }}>Reset</button>
        <span className="text-editor-text-muted">Move Start later to keep the previous word; move End later to remove more of the marked words.</span>
        {alignmentError && <span className="text-editor-danger">{alignmentError}</span>}
      </div>}

      <div
        className="flex-1 min-h-0 select-none"
        onMouseUp={handleMouseUp}
        onClick={handleClickOutside}
      >
        <Virtuoso
          ref={virtuosoRef}
          totalCount={segments.length}
          itemContent={renderSegment}
          overscan={200}
          className="h-full"
          style={{ height: '100%' }}
        />
      </div>
    </div>
  );
}

function CutTimeInput({ label, time, onCommit }: { label: string; time: number;
  onCommit: (time: number) => void }) {
  const [draft, setDraft] = useState(time.toFixed(3));
  useEffect(() => { setDraft(time.toFixed(3)); }, [time]);
  return <label className="flex items-center gap-1">{label}
    <button type="button" title={`${label} 20 ms earlier`}
      className="rounded border border-editor-border px-1 hover:bg-editor-word-hover"
      onClick={() => onCommit(Math.max(0, Math.round((time - 0.02) * 1000) / 1000))}>−</button>
    <input type="number" step="0.01" min="0" aria-label={`${label} cut time in seconds`}
      className="w-20 rounded border border-editor-border bg-editor-surface px-1 py-0.5"
      value={draft} onChange={(event) => setDraft(event.target.value)}
      onBlur={() => {
        const value = Number(draft);
        if (draft.trim() && Number.isFinite(value) && value >= 0) onCommit(value);
        else setDraft(time.toFixed(3));
      }} onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    <button type="button" title={`${label} 20 ms later`}
      className="rounded border border-editor-border px-1 hover:bg-editor-word-hover"
      onClick={() => onCommit(Math.round((time + 0.02) * 1000) / 1000)}>+</button>
  </label>;
}
