"""Place transcript cuts in nearby quiet audio without trimming kept speech."""

import hashlib
import json
import math
import os
import subprocess
import tempfile
import threading
from pathlib import Path

import numpy as np

from services.speech_cut_alignment import (align_words_near, alignment_runtime_signature,
                                           begin_alignment_pass, alignment_degraded)

_cache: dict[str, list[dict[str, float]]] = {}
_envelopes: dict[str, np.ndarray] = {}
_samples: dict[str, np.ndarray] = {}
_lock = threading.Lock()
_FRAME_SECONDS = 0.01
_REFINEMENT_VERSION = 11


def _kept_edge_at_quiet(envelope: np.ndarray, edge: float, direction: int,
                        removed_limit: float) -> float:
    """Recover a kept consonant/decay before preserving adjacent room tone.

    CTC edges can fall inside speech. Only search towards a confidently aligned
    removed word, at most 120 ms, and require two quiet frames before moving.
    """
    frame = int(edge / _FRAME_SECONDS)
    if not 0 <= frame < len(envelope) or envelope[frame] <= 0.006:
        return edge
    limit = min(0.12, max(0.0, direction * (removed_limit - edge)))
    quiet = 0
    for step in range(1, int(limit / _FRAME_SECONDS) + 1):
        index = frame + direction * step
        if not 0 <= index < len(envelope):
            break
        quiet = quiet + 1 if envelope[index] <= 0.006 else 0
        if quiet >= 2:
            candidate = (index + 1) * _FRAME_SECONDS
            if direction * (candidate - removed_limit) <= 0:
                return round(candidate, 6)
    return edge


def _preserve_join_air(envelope: np.ndarray, exit: float, entrance: float,
                       left_start: float, right_end: float, target: float,
                       locked_exit: bool = False, locked_entrance: bool = False,
                       removed_start: float | None = None,
                       removed_end: float | None = None,
                       per_side: bool = False) -> tuple[float, float]:
    """Keep a small amount of adjacent room tone, without crossing speech.

    Count silence already retained on both sides before extending the ranges.
    Extensions stop at the first nonquiet frame or known removed word. Keeping
    source frames also keeps playback, video, overlays and exports in sync.
    """
    context = np.concatenate([
        envelope[max(0, int((edge - 0.2) / _FRAME_SECONDS)):
                 min(len(envelope), math.ceil((edge + 0.2) / _FRAME_SECONDS))]
        for edge in (exit, entrance)
    ])
    if not len(context):
        return exit, entrance
    # More conservative than word-boundary detection: low-energy consonants
    # must never be brought back merely to lengthen a pause.
    threshold = max(0.002, min(0.006, float(np.percentile(context, 85)) * 0.1))

    def quiet_span(edge: float, direction: int, limit: float) -> float:
        distance = 0.0
        while distance + _FRAME_SECONDS <= limit + 1e-8:
            next_distance = distance + _FRAME_SECONDS
            a, b = sorted((edge + direction * distance, edge + direction * next_distance))
            frames = envelope[max(0, math.floor(a / _FRAME_SECONDS + 1e-8)):
                              min(len(envelope), math.ceil(b / _FRAME_SECONDS - 1e-8))]
            if not len(frames) or float(np.max(frames)) > threshold:
                break
            distance = next_distance
        return distance

    existing_tail = quiet_span(exit, -1, min(target, exit - left_start))
    existing_lead = quiet_span(entrance, 1, min(target, right_end - entrance))
    # Auto-Editor's margin applies independently before and after speech.
    # Do not spend an unavailable side's allowance on the opposite side.
    tail_budget = max(0.0, target - existing_tail) if per_side else target
    lead_budget = max(0.0, target - existing_lead) if per_side else target
    missing = (tail_budget + lead_budget if per_side
               else max(0.0, target - existing_tail - existing_lead))
    budget = min(missing, max(0.0, entrance - exit - 0.01))
    if budget < _FRAME_SECONDS - 1e-8:
        return exit, entrance
    exit_room = min(budget, tail_budget, (removed_start - 0.01 if removed_start is not None
                             else entrance) - exit)
    entrance_room = min(budget, lead_budget, entrance - (removed_end + 0.01 if removed_end is not None
                                           else exit))
    tail = 0.0 if locked_exit else quiet_span(exit, 1, exit_room)
    lead = 0.0 if locked_entrance else quiet_span(entrance, -1, entrance_room)
    add_tail = min(tail, budget if per_side else budget / 2)
    add_lead = min(lead, budget - add_tail)
    if not per_side:
        add_tail = min(tail, budget - add_lead)
    return round(exit + add_tail, 6), round(entrance - add_lead, 6)


def _persistent_cache_file(key: str) -> Path:
    root = Path(os.environ.get("LOCALAPPDATA") or Path.home() / ".cache")
    return root / "Edity" / "cut-refinement" / f"{key}.json"


def _audio_samples(source: Path) -> np.ndarray:
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(source), "-vn", "-ac", "1",
         "-ar", "16000", "-f", "f32le", "pipe:1"],
        capture_output=True, check=True,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    return np.frombuffer(result.stdout, dtype="<f4").copy()


def _rms_envelope(samples: np.ndarray) -> np.ndarray:
    frame = 160
    complete = len(samples) // frame
    if not complete:
        return np.empty(0, dtype=np.float32)
    blocks = samples[:complete * frame].reshape(complete, frame)
    return np.sqrt(np.mean(blocks * blocks, axis=1))


def _word_cut_neighbors(words: list[dict], deleted_indices: list[int],
                        left_end: float, right_start: float) -> tuple[int, int, int, int] | None:
    """Match a timeline gap to the contiguous removed transcript words."""
    deleted = {index for index in deleted_indices if 0 <= index < len(words)}
    for first in sorted(deleted):
        if first - 1 in deleted or first == 0:
            continue
        last = first
        while last + 1 in deleted:
            last += 1
        if last + 1 >= len(words):
            continue
        if (abs(float(words[first - 1]["end"]) - left_end) <= 0.002
                and abs(float(words[last + 1]["start"]) - right_start) <= 0.002):
            return first - 1, first, last, last + 1
    return None


def _quiet_after_removed(envelope: np.ndarray, removed_end: float,
                         nominal: float) -> float | None:
    """Find the next speech onset after a confidently aligned removed tail."""
    first = max(0, int((removed_end + 0.01) / _FRAME_SECONDS))
    last = min(len(envelope), int((nominal + 0.75) / _FRAME_SECONDS))
    if last - first < 10:
        return None
    nearby = envelope[first:last]
    peak = float(np.percentile(nearby, 85))
    if peak < 0.015:
        return None
    quiet = nearby < max(0.008, peak * 0.18)
    edges = np.flatnonzero(np.diff(np.concatenate(([False], quiet, [False]))))
    for local_start, local_end in zip(edges[::2], edges[1::2]):
        run_start, run_end = first + int(local_start), first + int(local_end)
        if run_start * _FRAME_SECONDS > removed_end + 0.22 or run_end - run_start < 8:
            continue
        before = envelope[max(0, run_start - 16):run_start]
        after = envelope[run_end:min(len(envelope), run_end + 16)]
        if (len(before) and len(after) and float(np.max(before)) > peak * 0.45
                and float(np.max(after)) > peak * 0.3):
            return round((run_end - 1) * _FRAME_SECONDS, 3)
    return None


def _start_after_internal_pause(envelope: np.ndarray, aligned_start: float,
                                aligned_end: float) -> float | None:
    """Split an aligned 'word' that actually contains a stray deleted syllable.

    Only call for an unfinished repeated take whose removed tail could not be
    aligned. Quiet audio inside an ordinary word can be a weak syllable or
    consonant, so this heuristic must not override a normal word alignment.
    """
    first = max(0, int(aligned_start / _FRAME_SECONDS))
    last = min(len(envelope), int(min(aligned_end, aligned_start + 0.60) / _FRAME_SECONDS))
    if last - first < 15:
        return None
    nearby = envelope[first:last]
    peak = float(np.percentile(nearby, 85))
    if peak < 0.015:
        return None
    quiet = nearby < max(0.008, peak * 0.18)
    edges = np.flatnonzero(np.diff(np.concatenate(([False], quiet, [False]))))
    for local_start, local_end in zip(edges[::2], edges[1::2]):
        run_start, run_end = first + int(local_start), first + int(local_end)
        if (run_end - run_start < 8 or run_start * _FRAME_SECONDS > aligned_start + 0.25
                or run_end * _FRAME_SECONDS >= aligned_end - 0.04):
            continue
        before = envelope[max(first, run_start - 14):run_start]
        after = envelope[run_end:min(len(envelope), run_end + 14)]
        if (len(before) and len(after) and float(np.max(before)) > peak * 0.4
                and float(np.max(after)) > peak * 0.35):
            return round((run_end - 1) * _FRAME_SECONDS, 3)
    return None


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
        if before_cut:
            # A low-energy syllable inside the preceding kept word can look
            # like silence. Keep a generous guard around its nominal ending.
            if end - start < 5:
                return nominal
            return round(max(start * _FRAME_SECONDS, nominal - 0.03), 3)
        return round((end - 1) * _FRAME_SECONDS, 3)
    if before_cut:
        later = [run for run in runs if nominal < run[0] * _FRAME_SECONDS <= nominal + 0.16]
        if later:
            start, end = min(later, key=lambda run: run[0])
            # Leave a little of the quiet onset so the last consonant of the
            # kept word survives small transcription errors.
            return round((start + min(2, (end - start) // 3)) * _FRAME_SECONDS, 3)
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


def _long_unfinished_word_entrance(envelope: np.ndarray, nominal: float) -> float:
    """Skip a delayed final attempt, then enter at the next sustained pause's end."""
    start = max(0, int((nominal + 0.04) / _FRAME_SECONDS))
    stop = min(len(envelope), int((nominal + 0.75) / _FRAME_SECONDS))
    if stop - start < 12:
        return nominal
    nearby = envelope[start:stop]
    peak = float(np.percentile(nearby, 80))
    if peak < 0.015:
        return nominal
    threshold = max(0.008, peak * 0.18)
    quiet = nearby < threshold
    edges = np.flatnonzero(np.diff(np.concatenate(([False], quiet, [False]))))
    for local_start, local_end in zip(edges[::2], edges[1::2]):
        run_start, run_end = start + int(local_start), start + int(local_end)
        if run_start * _FRAME_SECONDS < nominal + 0.12 or run_end - run_start < 5:
            continue
        before = envelope[max(start, run_start - 12):run_start]
        after = envelope[run_end:min(len(envelope), run_end + 12)]
        if (len(before) and len(after) and float(np.max(before)) > peak * 0.45
                and float(np.max(after)) > peak * 0.3):
            return round((run_end - 1) * _FRAME_SECONDS, 3)
    return nominal


def refine_keep_segments(video_path: str, keep_segments: list[dict],
                         locked_exit_indices: list[int] | None = None,
                         locked_entrance_indices: list[int] | None = None,
                         late_entrance_indices: list[int] | None = None,
                         long_late_entrance_indices: list[int] | None = None,
                         words: list[dict] | None = None,
                         deleted_indices: list[int] | None = None,
                         language: str = "en",
                         join_margin_seconds: float | None = None) -> list[dict[str, float]]:
    begin_alignment_pass()
    if (join_margin_seconds is not None
            and (not math.isfinite(join_margin_seconds) or not 0 <= join_margin_seconds <= 10)):
        raise ValueError("Join margin must be between 0 and 10 seconds")
    source = Path(video_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    original = [{"start": round(float(item["start"]), 6),
                 "end": round(float(item["end"]), 6)} for item in keep_segments]
    if not original:
        return original
    deleted = set(deleted_indices or [])
    first_kept = next((i for i in range(len(words or [])) if i not in deleted), None)
    leading_cut = (first_kept is not None and first_kept > 0 and original[0]['start'] > 0
                   and abs(original[0]['start'] - float(words[first_kept]['start'])) < 0.002)
    if len(original) < 2 and not leading_cut:
        return original
    stat = source.stat()
    locked_exits = frozenset(locked_exit_indices or [])
    locked_entrances = frozenset(locked_entrance_indices or [])
    late_entrances = frozenset(late_entrance_indices or [])
    long_late_entrances = frozenset(long_late_entrance_indices or [])
    cache_inputs = [str(source), stat.st_size, stat.st_mtime_ns,
                                     original, sorted(locked_exits),
                                     sorted(locked_entrances), sorted(late_entrances),
                                     sorted(long_late_entrances), words,
                                     sorted(deleted_indices or []), language,
                                     join_margin_seconds, alignment_runtime_signature()]
    key = hashlib.sha256(json.dumps([_REFINEMENT_VERSION, *cache_inputs]).encode()).hexdigest()
    envelope_key = hashlib.sha256(json.dumps([str(source), stat.st_size,
                                              stat.st_mtime_ns]).encode()).hexdigest()
    with _lock:
        if key in _cache:
            return [item.copy() for item in _cache[key]]
        cache_file = _persistent_cache_file(key)
        if cache_file.is_file():
            try:
                cached = json.loads(cache_file.read_text(encoding="utf-8"))
                if (isinstance(cached, list) and len(cached) == len(original)
                        and all(isinstance(item, dict) and "start" in item and "end" in item
                                for item in cached)):
                    _cache[key] = cached
                    return [item.copy() for item in cached]
            except (OSError, ValueError):
                pass
        envelope = _envelopes.get(envelope_key)
        if envelope is None:
            samples = _audio_samples(source)
            envelope = _rms_envelope(samples)
            _samples[envelope_key] = samples
            _envelopes[envelope_key] = envelope
            if len(_envelopes) > 4:
                stale = next(iter(_envelopes))
                _envelopes.pop(stale)
                _samples.pop(stale, None)
        else:
            samples = _samples[envelope_key]
        if not len(envelope):
            return original
        refined = [item.copy() for item in original]
        # A prefix retake has no left kept segment, so the interior-join loop
        # cannot align it. Protect its first kept word and exclude the removed
        # word's acoustic tail, with the same explicit-boundary lock as joins.
        if leading_cut and 0 not in locked_entrances:
            aligned = align_words_near(samples, words, first_kept, language)
            kept = aligned.get(first_kept)
            removed = aligned.get(first_kept - 1)
            if kept:
                start = kept['start'] - 0.02
                if removed and removed['end'] < kept['start']:
                    start = max(start, removed['end'] + 0.01)
                    start = _kept_edge_at_quiet(envelope, start, -1, removed['end'] + 0.01)
                refined[0]['start'] = round(max(0, min(start, kept['start'], refined[0]['end'] - 0.01)), 6)
        for index in range(len(refined) - 1):
            left, right = refined[index], refined[index + 1]
            if right["start"] <= left["end"]:
                continue
            old_end, old_start = left["end"], right["start"]
            neighbors = (_word_cut_neighbors(words, deleted_indices, old_end, old_start)
                         if words and deleted_indices else None)
            aligned_exit: dict[int, dict] = {}
            aligned_entrance: dict[int, dict] = {}
            if neighbors:
                previous, first_removed, last_removed, following = neighbors
                if index not in locked_exits:
                    aligned_exit = align_words_near(samples, words, previous, language)
                if index + 1 not in locked_entrances:
                    aligned_entrance = align_words_near(samples, words, following, language)
                    if following not in aligned_entrance:
                        # Short words are occasionally assigned no CTC score;
                        # a window centered on the false start can recover it.
                        alternate = align_words_near(samples, words, last_removed, language)
                        if following in alternate:
                            aligned_entrance = alternate
            new_end = old_end if index in locked_exits else _boundary(envelope, old_end, True)
            new_start = old_start if index + 1 in locked_entrances else _boundary(
                envelope, old_start, False)
            if neighbors and index not in locked_exits:
                kept_end = aligned_exit.get(previous)
                removed_start = aligned_exit.get(first_removed)
                if kept_end:
                    new_end = max(new_end, kept_end["end"] + 0.025)
                    if removed_start and removed_start["start"] > kept_end["end"]:
                        new_end = min(new_end, removed_start["start"] - 0.01)
            else:
                kept_end = None
            aligned_next = aligned_entrance.get(following) if neighbors else None
            if aligned_next:
                removed_end = aligned_entrance.get(last_removed)
                new_start = aligned_next["start"] - 0.02
                if index + 1 in long_late_entrances and not removed_end:
                    after_pause = _start_after_internal_pause(
                        envelope, aligned_next["start"], aligned_next["end"])
                    if after_pause is not None:
                        new_start = max(new_start, after_pause)
                if removed_end and removed_end["end"] < aligned_next["start"]:
                    new_start = max(new_start, removed_end["end"] + 0.01)
            elif neighbors and index + 1 not in locked_entrances:
                removed_end = aligned_entrance.get(last_removed)
                if removed_end:
                    onset = _quiet_after_removed(envelope, removed_end["end"], old_start)
                    if onset is not None:
                        new_start = max(new_start, onset)
            if (not aligned_next and index + 1 in late_entrances
                    and index + 1 not in locked_entrances):
                new_start = max(new_start, _unfinished_word_entrance(envelope, old_start))
            if (not aligned_next and index + 1 in long_late_entrances
                    and index + 1 not in locked_entrances):
                new_start = max(new_start, _long_unfinished_word_entrance(envelope, old_start))
            removed_head = aligned_exit.get(first_removed) if neighbors else None
            removed_tail = aligned_entrance.get(last_removed) if neighbors else None
            if kept_end and removed_head and index not in locked_exits:
                new_end = _kept_edge_at_quiet(envelope, new_end, 1, removed_head["start"] - 0.01)
            if aligned_next and removed_tail and index + 1 not in locked_entrances:
                new_start = _kept_edge_at_quiet(envelope, new_start, -1, removed_tail["end"] + 0.01)
            exit_limit = old_end + 0.16
            if kept_end:
                exit_limit = max(exit_limit, kept_end["end"] + 0.12)
            left["end"] = round(min(max(new_end, left["start"] + 0.01),
                                     exit_limit, right["start"]), 6)
            right["start"] = round(min(right["end"] - 0.01,
                                       max(new_start, left["end"])), 6)
            if left["end"] <= left["start"] or right["start"] >= right["end"]:
                left["end"], right["start"] = old_end, old_start
            # Word deletions inherit the project's import margin on each side.
            # Unrelated sound cuts and old projects without recorded settings
            # retain the existing policy. Manual boundaries remain locked.
            sentence_end = (neighbors and str(words[previous]["word"])
                            .rstrip('\"\'”’').endswith(('.', '?', '!')))
            profile_margin = join_margin_seconds is not None and neighbors is not None
            left["end"], right["start"] = _preserve_join_air(
                envelope, left["end"], right["start"], left["start"], right["end"],
                join_margin_seconds if profile_margin else (0.12 if sentence_end else 0.08),
                index in locked_exits, index + 1 in locked_entrances,
                removed_head["start"] if removed_head else None,
                removed_tail["end"] if removed_tail else None,
                per_side=profile_margin)
        # Missing packages/download failures are temporary. The energy-only
        # fallback is usable for preview, but must not become permanent timing.
        if alignment_degraded():
            return [item.copy() for item in refined]
        _cache[key] = refined
        if len(_cache) > 32:
            _cache.pop(next(iter(_cache)))
        try:
            cache_file.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", suffix=".json",
                                             dir=cache_file.parent, delete=False) as output:
                json.dump(refined, output)
                temporary = Path(output.name)
            os.replace(temporary, cache_file)
        except OSError:
            # A cache failure must never prevent editing or exporting.
            pass
        return [item.copy() for item in refined]
