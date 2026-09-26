"""Place transcript cuts in nearby quiet audio without trimming kept speech."""

import hashlib
import json
import os
import subprocess
import threading
from pathlib import Path

import numpy as np

_cache: dict[str, list[dict[str, float]]] = {}
_envelopes: dict[str, np.ndarray] = {}
_lock = threading.Lock()
_FRAME_SECONDS = 0.01


def _rms_envelope(source: Path) -> np.ndarray:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(source), "-vn", "-ac", "1",
         "-ar", "16000", "-f", "f32le", "pipe:1"],
        capture_output=True, check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    samples = np.frombuffer(result.stdout, dtype="<f4")
    frame = 160
    complete = len(samples) // frame
    if not complete:
        return np.empty(0, dtype=np.float32)
    blocks = samples[:complete * frame].reshape(complete, frame)
    return np.sqrt(np.mean(blocks * blocks, axis=1))


def _quiet_runs(envelope: np.ndarray, boundary: float) -> list[tuple[int, int]]:
    lo = max(0, int((boundary - 0.24) / _FRAME_SECONDS))
    hi = min(len(envelope), int((boundary + 0.20) / _FRAME_SECONDS))
    if hi <= lo:
        return []
    nearby = envelope[lo:hi]
    threshold = max(0.008, float(np.percentile(nearby, 80)) * 0.18)
    quiet = nearby < threshold
    padded = np.concatenate(([False], quiet, [False]))
    edges = np.flatnonzero(padded[1:] != padded[:-1])
    return [(lo + int(start), lo + int(end)) for start, end in zip(edges[::2], edges[1::2])
            if end - start >= 3]


def _boundary(envelope: np.ndarray, nominal: float, before_cut: bool) -> float:
    runs = _quiet_runs(envelope, nominal)
    if not runs:
        return nominal
    # If nominal falls in quiet audio, remove that pause. Otherwise, the exit
    # may move *later* to preserve a kept word whose timestamp ended early.
    # Never jump to a distant silence on the entrance: that can erase the
    # following kept word in its entirety.
    touching = [run for run in runs if run[0] * _FRAME_SECONDS <= nominal
                <= run[1] * _FRAME_SECONDS]
    if touching:
        start, end = max(touching, key=lambda run: run[1] - run[0])
        return round((start if before_cut else end - 1) * _FRAME_SECONDS, 3)
    if before_cut:
        later = [run for run in runs if nominal < run[0] * _FRAME_SECONDS <= nominal + 0.16]
        if later:
            return round(min(later, key=lambda run: run[0])[0] * _FRAME_SECONDS, 3)
    return nominal


def _unfinished_word_entrance(envelope: np.ndarray, nominal: float) -> float:
    """Find the trough after an unfinished removed token, without a broad seek."""
    first = max(0, int((nominal + 0.04) / _FRAME_SECONDS))
    last = min(len(envelope), int((nominal + 0.18) / _FRAME_SECONDS))
    if last - first < 5:
        return nominal
    smoothed = np.convolve(envelope[max(0, first - 8):min(len(envelope), last + 9)],
                           np.ones(3) / 3, mode="same")
    origin = max(0, first - 8)
    trough = first + int(np.argmin(smoothed[first - origin:last - origin]))
    previous = envelope[max(0, trough - 7):trough]
    following = envelope[trough + 2:min(len(envelope), trough + 10)]
    nearby = envelope[max(0, int(nominal / _FRAME_SECONDS)):min(len(envelope), last + 8)]
    peak = float(np.percentile(nearby, 85)) if len(nearby) else 0
    if (peak < 0.015 or not len(previous) or not len(following)
            or smoothed[trough - origin] > peak * 0.4
            or float(np.max(previous)) < peak * 0.55
            or float(np.max(following)) < peak * 0.25):
        return nominal
    return round((trough - 1) * _FRAME_SECONDS, 3)


def refine_keep_segments(video_path: str, keep_segments: list[dict],
                         locked_exit_indices: list[int] | None = None,
                         locked_entrance_indices: list[int] | None = None,
                         late_entrance_indices: list[int] | None = None) -> list[dict[str, float]]:
    source = Path(video_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    original = [{"start": round(float(item["start"]), 6),
                 "end": round(float(item["end"]), 6)} for item in keep_segments]
    if len(original) < 2:
        return original
    stat = source.stat()
    locked_exits = frozenset(locked_exit_indices or [])
    locked_entrances = frozenset(locked_entrance_indices or [])
    late_entrances = frozenset(late_entrance_indices or [])
    key = hashlib.sha256(json.dumps([str(source), stat.st_size, stat.st_mtime_ns,
                                     original, sorted(locked_exits),
                                     sorted(locked_entrances), sorted(late_entrances)]).encode()).hexdigest()
    envelope_key = hashlib.sha256(json.dumps([str(source), stat.st_size,
                                              stat.st_mtime_ns]).encode()).hexdigest()
    with _lock:
        if key in _cache:
            return [item.copy() for item in _cache[key]]
        envelope = _envelopes.get(envelope_key)
        if envelope is None:
            envelope = _rms_envelope(source)
            _envelopes[envelope_key] = envelope
            if len(_envelopes) > 4:
                _envelopes.pop(next(iter(_envelopes)))
        if not len(envelope):
            return original
        refined = [item.copy() for item in original]
        for index in range(len(refined) - 1):
            left, right = refined[index], refined[index + 1]
            if right["start"] <= left["end"]:
                continue
            old_end, old_start = left["end"], right["start"]
            new_end = old_end if index in locked_exits else _boundary(envelope, old_end, True)
            new_start = old_start if index + 1 in locked_entrances else _boundary(
                envelope, old_start, False)
            if index + 1 in late_entrances and index + 1 not in locked_entrances:
                new_start = max(new_start, _unfinished_word_entrance(envelope, old_start))
            left["end"] = round(min(max(new_end, left["start"] + 0.01),
                                     old_end + 0.16, right["start"]), 6)
            right["start"] = round(min(right["end"] - 0.01,
                                       max(new_start, old_start, left["end"])), 6)
            if left["end"] <= left["start"] or right["start"] >= right["end"]:
                left["end"], right["start"] = old_end, old_start
        _cache[key] = refined
        if len(_cache) > 32:
            _cache.pop(next(iter(_cache)))
        return [item.copy() for item in refined]
