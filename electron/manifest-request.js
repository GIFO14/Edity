const {getEffectiveCutRanges,getLockedCutBoundaries,narrationManifestClips,visualTimingRequest}=require('../shared/composition-runtime.cjs');
function manifestRequest(document){
  const words=document.words||[],deleted=document.deletedRanges||[],baseAsset=document.composition?.assets[document.composition?.elements.base?.assetId];
  // Prepared media is authoritative. Legacy clips can retain their duration
  // from before silence removal, longer than the media and its transcript.
  const duration=baseAsset?.status==='ready'&&baseAsset.durationUs>0?baseAsset.durationUs/1e6:Math.max(0,...(document.clips||[]).map(c=>c.start+c.duration),words.at(-1)?.end||0);
  const cuts=getEffectiveCutRanges(words,deleted,duration,document.soundEvents||[]),keep=[];let cursor=0;
  for(const cut of cuts){if(cut.start>cursor)keep.push({start:cursor,end:cut.start});cursor=Math.max(cursor,cut.end);}if(cursor<duration)keep.push({start:cursor,end:duration});
  const locks=getLockedCutBoundaries(words,deleted,keep);
  return {video_path:document.videoPath,keep_segments:keep,clips:narrationManifestClips(document.clips||[],document.narration),words,narration_order:document.narration||null,deleted_indices:[...new Set(deleted.flatMap(r=>r.wordIndices))],language:document.language||'en',locked_exit_indices:locks.lockedExitIndices,locked_entrance_indices:locks.lockedEntranceIndices,late_entrance_indices:locks.lateEntranceIndices,long_late_entrance_indices:locks.longLateEntranceIndices,
    ...visualTimingRequest({...document,words}),...(document.processing?{join_silence_preset:document.processing.preset,join_custom_margin:document.processing.customMargin}:{})};
}
module.exports={manifestRequest};
