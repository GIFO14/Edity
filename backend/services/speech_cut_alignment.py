"""Align transcript words near edits against the source speech.

The transcript is useful for deciding *which* words survive, but its times can
be several hundred milliseconds wrong.  Forced alignment is local to each cut
so repeated words elsewhere in a long recording cannot attract an edit.
"""

from __future__ import annotations

import logging
import threading
import time
from importlib.metadata import PackageNotFoundError, version

import numpy as np

_models: dict[tuple[str, str], tuple[object, dict]] = {}
_unavailable_models: dict[tuple[str, str], float] = {}
_model_lock = threading.Lock()
_log = logging.getLogger(__name__)
_status = threading.local()


def alignment_runtime_signature() -> list[str | None]:
    """An installed/repaired aligner must not reuse an ASR-only cut cache."""
    result = []
    for package in ("whisperx", "torch", "torchaudio"):
        try:
            result.append(version(package))
        except PackageNotFoundError:
            result.append(None)
    return result


def begin_alignment_pass() -> None:
    _status.degraded = False


def alignment_degraded() -> bool:
    return getattr(_status, "degraded", False)


def require_alignment_runtime(language: str = "en") -> dict:
    """Normal imports may not become editable with a missing word-cut aligner.

    Model acquisition is a resumable preparation stage, never a reason to
    silently treat approximate recognizer timestamps as verified speech ends.
    """
    try:
        import torch
        import whisperx
    except Exception as exc:
        raise RuntimeError("Speech boundary alignment is unavailable. Repair the backend "
                           "transcription requirements (WhisperX), then retry processing.") from exc
    error = None
    for device in (["cuda", "cpu"] if torch.cuda.is_available() else ["cpu"]):
        try:
            _model(language or "en", device)
            return {"engine": "whisperx-local-forced-alignment", "language": language or "en",
                    "device": device, "status": "ready"}
        except Exception as exc:
            error = exc
    raise RuntimeError(f"Cannot prepare speech boundary alignment for {language}. "
                       "Check the model download/backend requirements and retry processing.") from error


def _model(language: str, device: str):
    import whisperx

    with _model_lock:
        key = (language, device)
        if time.monotonic() < _unavailable_models.get(key, 0):
            raise RuntimeError(f"Alignment unavailable for {language} on {device}")
        if key not in _models:
            try:
                _models[key] = whisperx.load_align_model(language_code=language, device=device)
            except Exception:
                _unavailable_models[key] = time.monotonic() + 60
                raise
            _unavailable_models.pop(key, None)
        return _models[key]


def align_words_near(samples: np.ndarray, words: list[dict], target_index: int,
                     language: str = "en") -> dict[int, dict]:
    """Return confident, locally aligned words around one transcript anchor.

    A failed model, unsupported language, or ambiguous word leaves the caller
    with the original acoustic boundary refinement.
    """
    if not 0 <= target_index < len(words):
        return {}
    first = _align_window(samples, words, target_index, language, radius=1.7)

    def displacement(index: int, actual: dict) -> float:
        original = words[index]
        return abs((actual["start"] + actual["end"]
                    - float(original["start"]) - float(original["end"])) / 2)

    found = {index: actual for index, actual in first.items()
             if displacement(index, actual) <= 0.8}
    candidate = first.get(target_index)
    if (target_index in found or not candidate or candidate["score"] < 0.65
            or displacement(target_index, candidate) > 1.5):
        return found
    # A bad transcript timestamp must not erase a retained word. Larger
    # corrections need agreement from a second window with more context,
    # rather than relaxing the drift limit for every repeated word.
    second = _align_window(samples, words, target_index, language, radius=2.5)
    confirmed = second.get(target_index)
    if (confirmed and confirmed["score"] >= 0.65
            and displacement(target_index, confirmed) <= 1.5
            and abs(candidate["start"] - confirmed["start"]) <= 0.08
            and abs(candidate["end"] - confirmed["end"]) <= 0.08):
        found[target_index] = {
            "start": min(candidate["start"], confirmed["start"]),
            "end": max(candidate["end"], confirmed["end"]),
            "score": min(candidate["score"], confirmed["score"]),
        }
    return found


def _align_window(samples: np.ndarray, words: list[dict], target_index: int,
                  language: str, radius: float) -> dict[int, dict]:
    """Align one local window; the caller validates displacement and consensus."""
    target = words[target_index]
    center = (float(target["start"]) + float(target["end"])) / 2
    start = max(0.0, center - radius)
    end = min(len(samples) / 16000, center + radius)
    selected = [(index, word) for index, word in enumerate(words)
                if float(word["start"]) >= start + 0.08
                and float(word["end"]) <= end - 0.08
                and str(word.get("word", "")).strip()]
    if target_index not in {index for index, _ in selected} or len(selected) < 2:
        return {}
    # Consecutive transcript words are important here: missing words can shift
    # every later alignment in the short window.
    indices = [index for index, _ in selected]
    if indices != list(range(indices[0], indices[-1] + 1)):
        return {}
    text = " ".join(str(word["word"]) for _, word in selected)
    try:
        import torch
        import whisperx
    except ImportError as exc:
        _status.degraded = True
        _log.warning("Local speech alignment unavailable: %s", exc)
        return {}
    clip = samples[int(start * 16000):int(end * 16000)]
    devices = ["cuda", "cpu"] if torch.cuda.is_available() else ["cpu"]
    aligned = None
    for device in devices:
        try:
            model, metadata = _model(language or "en", device)
            result = whisperx.align(
                [{"text": text, "start": 0.0, "end": len(clip) / 16000}],
                model, metadata, clip, device=device, return_char_alignments=False)
            aligned = result["word_segments"]
            break
        except Exception as exc:
            _log.warning("Local speech alignment unavailable on %s: %s", device, exc)
            if device == "cuda":
                torch.cuda.empty_cache()
    if aligned is None:
        _status.degraded = True
        return {}
    if len(aligned) != len(selected):
        return {}
    found: dict[int, dict] = {}
    for (index, original), actual in zip(selected, aligned):
        if (str(original["word"]).casefold() != str(actual.get("word", "")).casefold()
                or "start" not in actual or "end" not in actual):
            return {}
        aligned_start = float(actual["start"]) + start
        aligned_end = float(actual["end"]) + start
        score = float(actual.get("score", 0))
        if score >= 0.5 and aligned_end > aligned_start:
            found[index] = {"start": aligned_start, "end": aligned_end, "score": score}
    return found
