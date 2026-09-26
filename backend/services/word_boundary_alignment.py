"""Re-time the kept words on either side of a cut using a short audio window."""

import hashlib
import json
import os
import re
import subprocess
import tempfile
import threading
from pathlib import Path

from services.verbatim_transcription import transcribe_verbatim

_lock = threading.Lock()
_cache: dict[str, dict] = {}


def _token(text: str) -> str:
    return re.sub(r"[^\w]", "", text.casefold(), flags=re.UNICODE).strip("_")


def _match_word(words: list[dict], target: dict, offset: float) -> dict | None:
    wanted = _token(target["word"])
    if not wanted:
        return None
    center = (float(target["start"]) + float(target["end"])) / 2
    candidates = [word for word in words if _token(word["word"]) == wanted
                  and abs((word["start"] + word["end"]) / 2 + offset - center) <= 0.8]
    if not candidates:
        return None
    matched = min(candidates, key=lambda word: abs(
        (word["start"] + word["end"]) / 2 + offset - center))
    return {"word": matched["word"], "start": round(matched["start"] + offset, 3),
            "end": round(matched["end"] + offset, 3)}


def _local_words(source: Path, target: dict, language: str,
                 model_size: str, lead: float) -> tuple[list[dict], float]:
    start = max(0.0, float(target["start"]) - lead)
    length = max(2.8, float(target["end"]) - start + 1.6)
    with tempfile.TemporaryDirectory(prefix="edity-align-") as directory:
        snippet = Path(directory) / "speech.wav"
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", str(start),
                        "-i", str(source), "-t", str(min(length, 5.0)), "-vn",
                        "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", str(snippet)],
                       check=True, capture_output=True,
                       creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0)
        result = transcribe_verbatim(str(snippet), model_size=model_size,
                                    language=language, use_cache=False)
        return result["words"], start


def align_cut_boundaries(video_path: str, previous_word: dict | None,
                         next_word: dict | None, language: str = "en",
                         model_size: str = "medium") -> dict:
    source = Path(video_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    if not previous_word and not next_word:
        raise ValueError("A neighboring kept word is required")
    stat = source.stat()
    key = hashlib.sha256(json.dumps([str(source), stat.st_size, stat.st_mtime_ns,
                                     previous_word, next_word, language, model_size],
                                    sort_keys=True).encode()).hexdigest()
    with _lock:
        if key in _cache:
            return _cache[key].copy()
        found: dict[str, dict | None] = {"previous": None, "next": None}
        for side, target in (("previous", previous_word), ("next", next_word)):
            if not target:
                continue
            first_words, first_offset = _local_words(source, target, language, model_size, 1.6)
            second_words, second_offset = _local_words(source, target, language, model_size, 0.9)
            first = _match_word(first_words, target, first_offset)
            second = _match_word(second_words, target, second_offset)
            if (first and second and abs(first["start"] - second["start"]) <= 0.07
                    and abs(first["end"] - second["end"]) <= 0.07):
                found[side] = {"word": target["word"],
                               "start": round((first["start"] + second["start"]) / 2, 3),
                               "end": round((first["end"] + second["end"]) / 2, 3)}
        previous = found["previous"]
        following = found["next"]
        if previous and following and previous["end"] >= following["start"]:
            # The short transcript could not distinguish these repeated words.
            return {"cut_start": None, "cut_end": None, "error": "Neighboring words overlap"}
        result = {"cut_start": previous["end"] if previous else None,
                  "cut_end": following["start"] if following else None,
                  "matched_previous": previous, "matched_next": following}
        _cache[key] = result
        if len(_cache) > 64:
            _cache.pop(next(iter(_cache)))
        return result.copy()
