// Derive explicit cut provenance from persisted Auto-Editor source maps.
// Never guess cuts for older clips whose source map is unavailable.
export function editBoundaries(document, manifest = null) {
  const silenceRemovals = [], mapStatus = [];
  const occurrences = sourceUs => !manifest ? null : (manifest.segments || []).flatMap(s => {
    const end = s.globalSourceStartUs + s.sourceEndUs - s.sourceStartUs;
    return s.globalSourceStartUs <= sourceUs && sourceUs < end
      ? [s.editStartUs + sourceUs - s.globalSourceStartUs] : [];
  });
  for (const clip of document.clips || []) {
    const map = clip.sourceMap;
    mapStatus.push({clipId: clip.id, status: map?.kind === 'silence-processed' ? 'known'
      : map ? 'not-silence-processed' : 'unavailable'});
    if (map?.kind !== 'silence-processed') continue;
    const segments = [...map.segments].sort((a, b) => a.processedStartUs - b.processedStartUs);
    const cuts = segments.slice(1).map((right,i)=>({at:right.processedStartUs,start:segments[i].originalEndUs,end:right.originalStartUs}));
    if(segments[0]?.originalStartUs>0)cuts.unshift({at:segments[0].processedStartUs,start:0,end:segments[0].originalStartUs});
    if(segments.length&&map.originalDurationUs>segments.at(-1).originalEndUs)cuts.push({at:segments.at(-1).processedEndUs,start:segments.at(-1).originalEndUs,end:map.originalDurationUs});
    for (const cut of cuts) {
      const removedUs = cut.end - cut.start;
      if (removedUs <= 0) continue;
      const globalSourceUs = Math.round(clip.start * 1e6) + cut.at;
      const editTimesUs = occurrences(globalSourceUs);
      silenceRemovals.push({id: `silence:${clip.id}:${cut.at}`, kind: 'silence-removal',
        clipId: clip.id, processedSourceUs: cut.at, globalSourceUs,
        originalStartUs: cut.start, originalEndUs: cut.end,
        removedUs, marginSecondsPerSide: map.marginSeconds ?? null,
        editTimesUs, visible: editTimesUs === null ? null : editTimesUs.length > 0});
    }
  }
  const timelineCuts = [];
  for (let i = 1; i < (manifest?.segments?.length || 0); i++) {
    const a = manifest.segments[i - 1], b = manifest.segments[i];
    const fromSourceUs = a.globalSourceStartUs + a.sourceEndUs - a.sourceStartUs;
    if (a.clipId === b.clipId && fromSourceUs === b.globalSourceStartUs) continue;
    timelineCuts.push({id: `timeline:${i}`, kind: a.clipId !== b.clipId ? 'clip-boundary'
      : b.globalSourceStartUs < fromSourceUs ? 'narration-reorder' : 'edit-removal',
      editTimeUs: b.editStartUs, fromSourceUs, toSourceUs: b.globalSourceStartUs,
      fromClipId: a.clipId, toClipId: b.clipId});
  }
  return {version: 1, sourceClock: 'global-processed-source', playbackClock: 'edited-playback',
    policy: 'Inspect these cuts before ending B-roll or zooms: avoid exposing a camera jump; preserve deliberate pauses. Silence removals are already baked into the prepared source. Do not remove silence again.',
    mapStatus, silenceRemovals, timelineCuts};
}

// Display-only pieces. The base media remains one locked project element;
// these intervals never become movable composition clips or change playback.
export function baseTimelineSegments(manifest, boundaries, narration = null, clips = []) {
  if (!manifest || manifest.durationUs <= 0) return [];
  const points = new Map([[0, new Set()], [manifest.durationUs, new Set()]]);
  const add = (at, kind) => {
    if (!Number.isSafeInteger(at) || at <= 0 || at >= manifest.durationUs) return;
    if (!points.has(at)) points.set(at, new Set());
    points.get(at).add(kind);
  };
  for (const segment of manifest.segments) add(segment.editStartUs, 'source-boundary');
  for (const cut of boundaries.timelineCuts) add(cut.editTimeUs, cut.kind);
  for (const cut of boundaries.silenceRemovals) for (const at of cut.editTimesUs || []) add(at, 'silence-removal');
  for (const fragment of narration?.order || []) {
    const clip=clips.find(c=>c.id===fragment.clipId);if(!clip)continue;
    const source=Math.round(clip.start*1e6)+fragment.startUs;
    for(const s of manifest.segments)if(s.clipId===fragment.clipId&&source>=s.globalSourceStartUs&&source<s.globalSourceStartUs+s.sourceEndUs-s.sourceStartUs)add(s.editStartUs+source-s.globalSourceStartUs,'manual-split');
  }
  const ordered = [...points.keys()].sort((a, b) => a - b);
  let sourceIndex = 0;
  return ordered.slice(0, -1).map((startUs, i) => {
    while (sourceIndex + 1 < manifest.segments.length && manifest.segments[sourceIndex + 1].editStartUs <= startUs) sourceIndex++;
    return {id: `base:${startUs}`, startUs, endUs: ordered[i + 1],
      clipId: manifest.segments[sourceIndex]?.clipId || '', cutKinds: [...points.get(startUs)]};
  });
}
