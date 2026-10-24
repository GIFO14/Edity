"""Absorb only verified quiet slivers between baked and transcript cuts."""
import hashlib
import json
import math
from pathlib import Path

import numpy as np
from services import cut_refinement as audio


def coalesce_quiet_cut_slivers(video_path, ranges, clips, *, words=None,
                               deleted_indices=None, locked_exit_indices=None,
                               locked_entrance_indices=None):
    # Missing provenance or transcript is uncertainty, not permission to trim.
    if not words or len(ranges) < 2:
        return ranges
    cuts = []
    for clip in clips or []:
        mapping = clip.get('sourceMap') or {}
        if mapping.get('kind') != 'silence-processed':
            continue
        parts = sorted(mapping.get('segments', []), key=lambda s: s['processedStartUs'])
        origin = round(clip.get('start', 0) * 1e6)
        cuts.extend((origin + b['processedStartUs']) / 1e6
                    for a, b in zip(parts, parts[1:])
                    if b['originalStartUs'] > a['originalEndUs'])
    if not cuts:
        return ranges
    deleted = set(deleted_indices or [])
    protected = [(float(w['start']) - .04, float(w['end']) + .04)
                 for i, w in enumerate(words) if i not in deleted]
    exits, entrances = set(locked_exit_indices or []), set(locked_entrance_indices or [])
    candidates = []
    for i, (left, right) in enumerate(zip(ranges, ranges[1:])):
        if right['start'] <= left['end']:
            continue
        for index, edge, locked, direction in ((i, 'end', i in exits, -1),
                                               (i + 1, 'start', i + 1 in entrances, 1)):
            if locked:
                continue
            interval = ranges[index]
            nearby = [c for c in cuts if 0 < direction * (c - interval[edge]) <= .12
                      and interval['start'] < c < interval['end']]
            if not nearby:
                continue
            target = min(nearby, key=lambda c: abs(c - interval[edge]))
            a, b = sorted((target, interval[edge]))
            if any(start < b and end > a for start, end in protected):
                continue
            candidates.append((index, edge, target, a, b))
    if not candidates:
        return ranges
    source = Path(video_path).resolve()
    stat = source.stat()
    key = hashlib.sha256(json.dumps(['quiet-cut-slivers-1', str(source), stat.st_size,
        stat.st_mtime_ns, ranges, candidates]).encode()).hexdigest()
    cache = audio._persistent_cache_file(key)
    try:
        saved = json.loads(cache.read_text(encoding='utf8'))
        if len(saved) == len(ranges) and all(isinstance(s, dict) and set(s) == {'start', 'end'}
                                           for s in saved):
            return saved
    except (OSError, ValueError, TypeError):
        pass
    # Reuse the recording already decoded for acoustic refinement. This adds
    # no alignment/model requests; disk cache avoids decoding on later opens.
    envelope_key = hashlib.sha256(json.dumps([str(source), stat.st_size, stat.st_mtime_ns]).encode()).hexdigest()
    with audio._lock:
        samples = audio._samples.get(envelope_key)
        if samples is None:
            samples = audio._audio_samples(source)
    result = [dict(s) for s in ranges]
    for index, edge, target, a, b in candidates:
        section = samples[max(0, math.floor(a * 16000)):math.ceil(b * 16000)]
        if not len(section) or not np.all(np.isfinite(section)):
            continue
        # Absolute peak and 5 ms energy checks protect brief consonants/noises.
        if float(np.max(np.abs(section))) > .02:
            continue
        if any(float(np.sqrt(np.mean(part * part))) > .004
               for part in np.array_split(section, max(1, math.ceil(len(section) / 80)))):
            continue
        result[index][edge] = round(target, 6)
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache.with_suffix('.tmp')
        temporary.write_text(json.dumps(result), encoding='utf8')
        temporary.replace(cache)
    except OSError:
        pass
    return result
