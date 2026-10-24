"""Cached local acoustic evidence for visual anchors, in processed source time.

Only requested endpoints are aligned. Decoding a short window avoids loading a
second full recording, and the fingerprint/context cache survives app restarts.
Failure leaves the original transcript available, never fabricated certainty.
"""
import hashlib
import json
import logging
import os
from pathlib import Path
import subprocess
import threading
import time

import numpy as np
from services.speech_cut_alignment import align_words_near

_lock = threading.RLock()
_cache = {}
_log = logging.getLogger(__name__)


def visual_word_timings(video_path, words, word_ids, language='en'):
    if not word_ids:
        return {}
    path = Path(video_path)
    stat = path.stat()
    evidence = {}
    lookup = {w.get('id'): i for i, w in enumerate(words)}
    # Serialize inference and cache writes across concurrent UI/agent/export calls.
    with _lock:
        for word_id in dict.fromkeys(word_ids):
            index = lookup.get(word_id)
            if index is None:
                continue
            target = words[index]
            center = (target['start'] + target['end']) / 2
            origin = max(0, center - 4)
            selected = [w for w in words if w['end'] >= origin and w['start'] <= origin + 8]
            local_index = next((i for i, w in enumerate(selected) if w.get('id') == word_id), None)
            signature = [1, str(path.resolve()), stat.st_size, stat.st_mtime_ns, language, word_id, selected]
            key = hashlib.sha256(json.dumps(signature, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
            cache_file = Path(os.environ.get('LOCALAPPDATA') or Path.home()/'.cache')/'Edity'/'visual-word-timing'/f'{key}.json'
            cached = _cache.get(key)
            if cached and (cached[1] or time.monotonic() - cached[0] < 300):
                if cached[1]: evidence[word_id] = cached[1]
                continue
            try:
                if cache_file.exists():
                    value = json.loads(cache_file.read_text(encoding='utf8'))
                else:
                    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(origin), '-i', str(path),
                                              '-t', '8', '-vn', '-ac', '1', '-ar', '16000', '-f', 'f32le', 'pipe:1'],
                                             capture_output=True, check=True,
                                             creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
                    local_words = [{**w, 'start': w['start']-origin, 'end': w['end']-origin} for w in selected]
                    actual = align_words_near(np.frombuffer(decoded.stdout, dtype='<f4').copy(), local_words, local_index, language).get(local_index)
                    value = None
                    if actual and actual['score'] >= .5 and actual['end'] > actual['start']:
                        value = {'startUs': round((origin + actual['start'])*1e6),
                                 'endUs': round((origin + actual['end'])*1e6),
                                 'score': actual['score'], 'method': 'local-forced-alignment'}
                        cache_file.parent.mkdir(parents=True, exist_ok=True)
                        temporary = cache_file.with_suffix('.tmp')
                        temporary.write_text(json.dumps(value), encoding='utf8')
                        temporary.replace(cache_file)
                if value: evidence[word_id] = value
                _cache[key] = (time.monotonic(), value)
            except Exception as error:
                _log.warning('Visual speech alignment unavailable for %s: %s', word_id, error)
                _cache[key] = (time.monotonic(), None)
        while len(_cache) > 2048:
            _cache.pop(next(iter(_cache)))
    return evidence
