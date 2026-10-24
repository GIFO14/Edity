"""Immutable, content-addressed edit timing shared by every consumer."""
import copy
import hashlib
import json
import threading
from collections import OrderedDict
from pathlib import Path
from services.cut_refinement import refine_keep_segments
from services.audio_join import JOIN_FADE_SECONDS

ALGORITHM_VERSION = 'edity-cut-manifest-5'
_cache = OrderedDict()
_lock = threading.RLock()
_inflight = {}

def make_manifest(video_path, keep_segments, clips=None, narration_order=None, visual_word_ids=None, visual_cut_points=None, **refinement):
    result = _make_cut_manifest(video_path, keep_segments, clips, narration_order, **refinement)
    if visual_word_ids or visual_cut_points:
        from services.visual_word_timing import visual_word_timings
        requested = list(dict.fromkeys(visual_word_ids or []))
        timings = visual_word_timings(video_path, refinement.get('words') or [], requested, refinement.get('language') or 'en')
        result['wordTimings'] = timings
        result['visualTiming'] = {'clock': 'processed-global-source', 'requestedWordIds': requested,
                                  'unavailableWordIds': [w for w in requested if w not in timings]}
        result['visualCutPointsUs'] = sorted({s['editStartUs']+point-s['globalSourceStartUs']
            for point in visual_cut_points or [] for s in result['segments']
            if s['globalSourceStartUs'] <= point < s['globalSourceStartUs']+s['sourceEndUs']-s['sourceStartUs']})
        result['id'] = hashlib.sha256(json.dumps([result['id'], requested, timings, result['visualCutPointsUs']], sort_keys=True).encode()).hexdigest()
    return result


def _make_cut_manifest(video_path, keep_segments, clips=None, narration_order=None, **refinement):
    path = Path(video_path)
    stat = path.stat()
    payload = {'algorithm': ALGORITHM_VERSION, 'video': str(path.resolve()), 'size': stat.st_size,
               'mtime': stat.st_mtime_ns, 'keep': keep_segments, 'clips': clips or [],'narration':narration_order,'refinement': refinement}
    key = hashlib.sha256(json.dumps(payload, sort_keys=True, ensure_ascii=False, allow_nan=False).encode()).hexdigest()
    with _lock:
        if key in _cache:
            _cache.move_to_end(key)
            return copy.deepcopy(_cache[key])
        event = _inflight.get(key)
        owner = event is None
        if owner:
            event = threading.Event()
            _inflight[key] = event
    if not owner:
        event.wait()
        with _lock:
            if key in _cache:
                return copy.deepcopy(_cache[key])
        return _make_cut_manifest(video_path, keep_segments, clips, narration_order, **refinement)
    try:
        refined = refine_keep_segments(video_path, keep_segments, **refinement) if len(keep_segments)>1 else keep_segments
        from services.adjacent_cuts import coalesce_quiet_cut_slivers
        refined = coalesce_quiet_cut_slivers(video_path, refined, clips,
            **{k: refinement.get(k) for k in ('words', 'deleted_indices',
                 'locked_exit_indices', 'locked_entrance_indices')})
        arranged=[]
        if narration_order:
            clip_map={c['id']:c for c in clips or []}
            ids=set()
            for fragment in narration_order.get('order',[])+narration_order.get('parked',[]):
                if fragment['id'] in ids or fragment['clipId'] not in clip_map or fragment['endUs']<=fragment['startUs']:raise ValueError('Invalid or duplicate narration fragment')
                ids.add(fragment['id'])
            for clip_id,clip in clip_map.items():
                cursor_source=0
                for fragment in sorted([f for f in narration_order.get('order',[])+narration_order.get('parked',[]) if f['clipId']==clip_id],key=lambda f:f['startUs']):
                    if fragment['startUs']!=cursor_source:raise ValueError('Narration coverage duplicates or loses source voice')
                    cursor_source=fragment['endUs']
                if cursor_source!=round(clip.get('duration',0)*1e6):raise ValueError('Narration must cover or park the entire source')
            for fragment in narration_order.get('order',[]):
                clip=clip_map.get(fragment['clipId'])
                if not clip:raise ValueError('Narration source clip is missing')
                origin=round(clip.get('start',0)*1e6);a=origin+fragment['startUs'];b=origin+fragment['endUs']
                for interval in refined:
                    start=max(a,round(interval['start']*1e6));end=min(b,round(interval['end']*1e6))
                    if end>start:arranged.append({'start':start/1e6,'end':end/1e6,'fragmentId':fragment['id']})
        else:arranged=refined
        segments = []
        cursor = 0
        for interval_index, interval in enumerate(arranged):
            start = round(interval['start']*1e6)
            end = round(interval['end']*1e6)
            if end <= start:
                continue
            parts = []
            for clip in clips or []:
                clip_start = round(clip.get('start',0)*1e6)
                clip_end = clip_start+round(clip.get('duration',0)*1e6)
                a,b = max(start,clip_start),min(end,clip_end)
                if b>a:
                    parts.append((clip['id'],a,b,clip_start))
            if not parts:
                parts = [(clips[0]['id'] if clips else 'base',start,end,0)]
            for clip_id,a,b,offset in parts:
                fade = min(round(JOIN_FADE_SECONDS*1e6),(b-a)//3)
                segments.append({'clipId':clip_id,'sourceStartUs':a-offset,'sourceEndUs':b-offset,
                                 'globalSourceStartUs':a,'editStartUs':cursor,'editEndUs':cursor+b-a,
                                 'joinInUs':fade if interval_index else 0,
                                 'joinOutUs':fade if interval_index<len(arranged)-1 else 0,
                                 **({'narrationFragmentId':interval['fragmentId']} if interval.get('fragmentId') else {})})
                cursor += b-a
        words=refinement.get('words') or []
        removed=[words[i]['id'] for i in refinement.get('deleted_indices',[]) if 0<=i<len(words) and words[i].get('id')]
        result = {'id':key,'inputRevision':key,'durationUs':cursor,'segments':segments,'keepSegments':[{'start':i['start'],'end':i['end']} for i in arranged],'removedWordIds':removed}
        with _lock:
            _cache[key] = result
            while len(_cache)>64:
                _cache.popitem(last=False)
        return copy.deepcopy(result)
    finally:
        with _lock:
            _inflight.pop(key,None)
            event.set()
