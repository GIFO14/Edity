"""Local temporal detection of non-speech sounds using PANNs and AudioSet."""

import hashlib
import logging
import os
import subprocess
import threading
from pathlib import Path
from typing import Callable

import numpy as np
import requests

logger = logging.getLogger(__name__)

SAMPLE_RATE = 32000
CHUNK_SECONDS = 30
CACHE_DIR = Path.home() / "panns_data"
LABELS_PATH = CACHE_DIR / "class_labels_indices.csv"
CHECKPOINT_PATH = CACHE_DIR / "Cnn14_DecisionLevelMax.pth"
LABELS_URL = "https://storage.googleapis.com/us_audioset/youtube_corpus/v1/csv/class_labels_indices.csv"
CHECKPOINT_URL = "https://zenodo.org/records/3987831/files/Cnn14_DecisionLevelMax_mAP%3D0.385.pth?download=1"

# Low thresholds keep potential editing problems visible. Only the higher
# auto threshold creates a reversible removal mark without user interaction.
EVENT_RULES = {
    "Burping, eructation": (0.18, 0.55, True),
    "Fart": (0.18, 0.60, True),
    "Cough": (0.22, 0.65, True),
    "Sneeze": (0.22, 0.65, True),
    "Hiccup": (0.18, 0.55, True),
    "Throat clearing": (0.20, 0.60, True),
    "Sniff": (0.20, 0.65, True),
    "Snort": (0.20, 0.65, True),
    "Wheeze": (0.25, 1.01, False),
    "Gasp": (0.25, 1.01, False),
    "Sigh": (0.28, 1.01, False),
    "Breathing": (0.32, 1.01, False),
    "Laughter": (0.28, 1.01, False),
    "Giggle": (0.24, 1.01, False),
    "Belly laugh": (0.24, 1.01, False),
    "Chuckle, chortle": (0.24, 1.01, False),
    "Chewing, mastication": (0.24, 1.01, False),
    "Stomach rumble": (0.24, 0.65, True),
    "Groan": (0.28, 1.01, False),
    "Wail, moan": (0.28, 1.01, False),
    "Typing": (0.30, 1.01, False),
    "Computer keyboard": (0.30, 1.01, False),
    "Clicking": (0.35, 1.01, False),
    "Knock": (0.30, 1.01, False),
    "Door slam": (0.30, 1.01, False),
    "Ringtone": (0.30, 1.01, False),
}

_model = None
_labels: list[str] = []
_model_lock = threading.Lock()


def _notify(callback: Callable[[dict], None] | None, payload: dict) -> None:
    if callback:
        callback(payload)


def _download(url: str, destination: Path, callback: Callable[[dict], None] | None,
              progress_start: int, progress_end: int) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".part")
    try:
        with requests.get(url, stream=True, timeout=(15, 600)) as response:
            response.raise_for_status()
            total = int(response.headers.get("content-length") or 0)
            written = 0
            with temporary.open("wb") as file:
                for chunk in response.iter_content(chunk_size=1024 * 1024):
                    if not chunk:
                        continue
                    file.write(chunk)
                    written += len(chunk)
                    if total:
                        progress = progress_start + round((progress_end - progress_start) * written / total)
                        _notify(callback, {"type": "progress", "progress": min(progress_end, progress),
                                           "message": "Downloading sound detection model"})
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)


def _ensure_assets(callback: Callable[[dict], None] | None) -> None:
    if not LABELS_PATH.is_file() or LABELS_PATH.stat().st_size < 1000:
        _notify(callback, {"type": "status", "message": "Downloading AudioSet labels"})
        _download(LABELS_URL, LABELS_PATH, callback, 1, 2)
    if not CHECKPOINT_PATH.is_file() or CHECKPOINT_PATH.stat().st_size < 300_000_000:
        _notify(callback, {"type": "status", "message": "Downloading the PANNs sound model (first run only)"})
        _download(CHECKPOINT_URL, CHECKPOINT_PATH, callback, 2, 25)


def _get_model(callback: Callable[[dict], None] | None):
    global _model, _labels
    if _model is not None:
        return _model, _labels
    with _model_lock:
        if _model is not None:
            return _model, _labels
        _ensure_assets(callback)
        _notify(callback, {"type": "status", "message": "Loading PANNs on the GPU"})
        from panns_inference import SoundEventDetection, labels
        _model = SoundEventDetection(checkpoint_path=str(CHECKPOINT_PATH), device="cuda")
        _labels = list(labels)
    return _model, _labels


def _decode_audio(path: Path) -> np.ndarray:
    creationflags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    result = subprocess.run(
        ["ffmpeg", "-v", "error", "-i", str(path), "-vn", "-ac", "1", "-ar", str(SAMPLE_RATE),
         "-f", "f32le", "pipe:1"],
        capture_output=True,
        check=False,
        creationflags=creationflags,
    )
    if result.returncode:
        raise RuntimeError(result.stderr.decode(errors="replace")[-500:] or "Could not decode project audio")
    return np.frombuffer(result.stdout, dtype=np.float32).copy()


def _probability_runs(probabilities: np.ndarray, step: float, threshold: float,
                      offset: float, duration: float) -> list[tuple[float, float, float]]:
    runs = []
    start = None
    values = []
    release_threshold = threshold * 0.65
    for frame, value in enumerate(probabilities):
        score = float(value)
        if start is None and score >= threshold:
            start = frame
            values = [score]
        elif start is not None:
            values.append(score)
            if score < release_threshold:
                end_frame = frame
                event_start = offset + start * step
                event_end = min(offset + duration, offset + max(start + 1, end_frame) * step)
                if event_end - event_start >= 0.08:
                    runs.append((event_start, event_end, max(values)))
                start = None
                values = []
    if start is not None:
        event_start = offset + start * step
        event_end = offset + duration
        if event_end - event_start >= 0.08:
            runs.append((event_start, event_end, max(values)))
    return runs


def _merge_events(events: list[dict]) -> list[dict]:
    merged = []
    for event in sorted(events, key=lambda item: (item["label"], item["start"])):
        previous = merged[-1] if merged else None
        if previous and previous["label"] == event["label"] and event["start"] <= previous["end"] + 0.18:
            previous["end"] = max(previous["end"], event["end"])
            previous["confidence"] = max(previous["confidence"], event["confidence"])
        else:
            merged.append(dict(event))
    return sorted(merged, key=lambda item: item["start"])


def _overlaps_speech(event: dict, words: list[dict]) -> bool:
    return any(float(word.get("start") or 0) < event["end"] - 0.03
               and float(word.get("end") or 0) > event["start"] + 0.03 for word in words)


def detect_sound_events(file_path: str, words: list[dict] | None = None,
                        progress_callback: Callable[[dict], None] | None = None) -> dict:
    source = Path(file_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    model, labels = _get_model(progress_callback)
    label_indices = {label: labels.index(label) for label in EVENT_RULES if label in labels}
    if not label_indices:
        raise RuntimeError("The PANNs AudioSet labels could not be loaded")
    _notify(progress_callback, {"type": "status", "message": "Decoding audio for sound detection"})
    audio = _decode_audio(source)
    if not len(audio):
        return {"events": [], "engine": "PANNs Cnn14 DecisionLevelMax"}
    chunk_samples = CHUNK_SECONDS * SAMPLE_RATE
    chunks = (len(audio) + chunk_samples - 1) // chunk_samples
    detected: list[dict] = []
    for chunk_index in range(chunks):
        start_sample = chunk_index * chunk_samples
        chunk = audio[start_sample:start_sample + chunk_samples]
        if not len(chunk):
            continue
        framewise = model.inference(chunk[np.newaxis, :])[0]
        chunk_duration = len(chunk) / SAMPLE_RATE
        frame_step = chunk_duration / max(1, framewise.shape[0])
        offset = start_sample / SAMPLE_RATE
        for label, index in label_indices.items():
            detection_threshold, _auto_threshold, _undesired = EVENT_RULES[label]
            for start, end, confidence in _probability_runs(
                    framewise[:, index], frame_step, detection_threshold, offset, chunk_duration):
                if end - start <= 8:
                    detected.append({"label": label, "start": max(0, start - 0.06),
                                     "end": min(len(audio) / SAMPLE_RATE, end + 0.06),
                                     "confidence": confidence})
        _notify(progress_callback, {"type": "progress",
                                    "progress": 30 + round(70 * (chunk_index + 1) / chunks),
                                    "current": chunk_index + 1, "total": chunks,
                                    "message": "Scanning non-speech sounds"})
    output = []
    speech_words = words or []
    for event in _merge_events(detected):
        _detect_threshold, auto_threshold, undesired = EVENT_RULES[event["label"]]
        overlaps = _overlaps_speech(event, speech_words)
        start, end = round(event["start"], 3), round(event["end"], 3)
        identity = hashlib.sha1(f"{event['label']}:{start:.3f}:{end:.3f}".encode()).hexdigest()[:16]
        output.append({
            "id": f"sound_{identity}", "label": event["label"], "start": start, "end": end,
            "confidence": round(event["confidence"], 4), "source": "panns",
            "overlapsSpeech": overlaps,
            "markedForRemoval": bool(undesired and event["confidence"] >= auto_threshold and not overlaps),
        })
    return {"events": output, "engine": "PANNs Cnn14 DecisionLevelMax"}
