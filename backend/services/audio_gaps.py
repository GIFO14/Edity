"""Flag audible transcript gaps for review, without guessing speech or deleting it."""
import hashlib
import numpy as np

DETECTOR_VERSION = 2


def audible_gaps(audio: np.ndarray, rate: int, words: list[dict]) -> list[dict]:
    size = max(1, rate // 100)
    count = len(audio) // size
    if not count or not words:
        return []
    rms = np.sqrt(np.mean(audio[:count * size].reshape(count, size) ** 2, axis=1))
    threshold = max(0.008, float(np.percentile(rms, 15)) * 4)
    duration = len(audio) / rate
    intervals = []
    cursor = 0.0
    for word in sorted(words, key=lambda w: float(w['start'])):
        start, end = max(0, float(word['start'])), min(duration, float(word['end']))
        if start > cursor:
            intervals.append((cursor, start))
        cursor = max(cursor, end)
    if cursor < duration:
        intervals.append((cursor, duration))
    events = []
    for start, end in intervals:
        if end - start < 0.24:
            continue
        lo, hi = int(np.ceil(start * 100)), min(count, int(end * 100))
        active = np.flatnonzero(rms[lo:hi] > threshold)
        if len(active) < 10:
            continue
        # ASR timestamps often omit consonant tails and word onsets. Activity
        # touching an indexed word is not evidence of an additional sound.
        runs = np.split(active, np.flatnonzero(np.diff(active) > 7) + 1)
        candidates = []
        for run in runs:
            a, b = (lo + int(run[0])) / 100, (lo + int(run[-1]) + 1) / 100
            if len(run) >= 10 and b-a >= .12 and a-start >= .08 and end-b >= .08:
                candidates.append((a, b))
        # Retain long unexplained passages even if their ends touch a word.
        if not candidates and end-start >= 1.25 and len(active) >= 30:
            a, b = max(start+.12, (lo+int(active[0]))/100), min(end-.12, (lo+int(active[-1])+1)/100)
            if b-a >= .2:
                candidates.append((a, b))
        for a, b in candidates:
            key = hashlib.sha1(f'{a:.3f}:{b:.3f}'.encode()).hexdigest()[:16]
            events.append({'id': f'audio_gap_{key}', 'label': 'Possible untranscribed audio · review',
                           'start': round(a, 3), 'end': round(b, 3),
                           'source': 'acoustic', 'confidence': 0.0, 'detectorVersion': DETECTOR_VERSION,
                           'evidence': 'isolated acoustic activity; speech identity unverified',
                           'overlapsSpeech': False, 'markedForRemoval': False})
    return events


def review_audible_gaps(audio: np.ndarray, rate: int, words: list[dict],
                        language: str = 'en', job_id: str = '', aligner=None) -> list[dict]:
    """Suppress activity explained by confident alignment of EXISTING words.

    Alignment never changes the transcript, its clocks, or any cut. A failed
    alignment leaves the candidate visible for review, never auto-removes it.
    """
    from bisect import bisect_left
    from .asset_preparation import check
    from .speech_cut_alignment import align_words_near
    from scipy.signal import resample_poly
    from math import gcd
    candidates = audible_gaps(audio, rate, words)
    if not candidates:
        return []
    factor = gcd(rate, 16000)
    samples = audio if rate == 16000 else resample_poly(audio, 16000//factor, rate//factor)
    ordered = sorted(words, key=lambda word: float(word['start']))
    starts = [float(word['start']) for word in ordered]
    aligner = aligner or align_words_near
    cache = {}
    output = []
    for event in candidates:
        check(job_id)
        middle = (event['start']+event['end'])/2
        right = bisect_left(starts, middle)
        protected = []
        for index in (right-1, right):
            if not 0 <= index < len(ordered):
                continue
            if index not in cache:
                cache[index] = aligner(samples, ordered, index, language)
            for actual in cache[index].values():
                if actual.get('score', 0) >= .65:
                    protected.append((actual['start']-.04, actual['end']+.06))
        # Require remaining measured energy, not just an unaligned timestamp
        # gap. Check each span individually, never their bounding rectangle.
        lo, hi = int(event['start']*16000), int(event['end']*16000)
        remaining = samples[lo:hi].copy()
        for start, end in protected:
            a, b = max(0, int(start*16000)-lo), min(len(remaining), int(end*16000)-lo)
            if b > a:
                remaining[a:b] = 0
        n = len(remaining)//160
        active = np.count_nonzero(np.sqrt(np.mean(remaining[:n*160].reshape(n,160)**2,axis=1)) > .008) if n else 0
        if active >= 10:
            output.append(event)
    return output


def detect_audible_gaps(path: str, words: list[dict], language: str = 'en', job_id: str = '') -> list[dict]:
    from .asset_preparation import run, pin
    with pin([path]):
        raw = run(['ffmpeg', '-v', 'error', '-i', path, '-vn', '-ac', '1',
                   '-ar', '16000', '-f', 'f32le', 'pipe:1'], job_id)
        return review_audible_gaps(np.frombuffer(raw, dtype='<f4'), 16000, words, language, job_id)
