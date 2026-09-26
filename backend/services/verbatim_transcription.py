"""CrisperWhisper 2 transcription in literal mode with source word times."""

import logging
import re
import threading
from pathlib import Path
from typing import Callable

from utils.audio_processing import extract_audio
from utils.cache import load_from_cache, save_to_cache

_models: dict[tuple[str, str], object] = {}
_chunk_pattern = re.compile(r"Chunk (\d+)/(\d+)")


class _ChunkProgressHandler(logging.Handler):
    """Forward completed CrisperWhisper chunks from the current worker."""

    def __init__(self, callback: Callable[[dict], None]):
        super().__init__()
        self.callback = callback
        self.worker_thread = threading.get_ident()

    def emit(self, record: logging.LogRecord) -> None:
        if record.thread != self.worker_thread:
            return
        match = _chunk_pattern.search(record.getMessage())
        if match:
            current, total = map(int, match.groups())
            self.callback({
                "type": "progress", "current": current, "total": total,
                "progress": min(99, round(100 * current / total)),
            })


def transcribe_verbatim(
    file_path: str,
    model_size: str = "medium",
    language: str = "ca",
    use_cache: bool = True,
    progress_callback: Callable[[dict], None] | None = None,
) -> dict:
    if model_size not in {"small", "medium", "turbo", "large"}:
        raise ValueError("Invalid CrisperWhisper model size")
    source = Path(file_path)
    if not source.is_file():
        raise FileNotFoundError(source)
    cache_key = f"crisper2.0.3_{model_size}_{language}_verbatim"
    if use_cache:
        cached = load_from_cache(source, cache_key, "transcribe")
        if cached is not None:
            if progress_callback:
                progress_callback({"type": "progress", "message": "Using cached transcription",
                                   "current": 1, "total": 1, "progress": 100})
            return cached

    try:
        from crisperwhisper import CrisperWhisperModel
        import torch
    except ImportError as exc:
        raise RuntimeError("Install backend requirements to enable CrisperWhisper") from exc

    device = "cuda" if torch.cuda.is_available() else "cpu"
    if progress_callback:
        progress_callback({"type": "status", "message": f"Loading {model_size} model on {device.upper()}"})
    model_key = (model_size, device)
    if model_key not in _models:
        _models[model_key] = CrisperWhisperModel(
            model_size, backend="transformers", device=device,
            compute_type="float16" if device == "cuda" else "float32",
        )
    if progress_callback:
        progress_callback({"type": "status", "message": "Preparing audio"})
    audio = extract_audio(source) if source.suffix.lower() in {".mp4", ".avi", ".mov", ".mkv", ".webm"} else source
    handler = _ChunkProgressHandler(progress_callback) if progress_callback else None
    progress_logger = logging.getLogger("crisperwhisper.longform.continuation")
    if handler:
        progress_logger.addHandler(handler)
        progress_callback({"type": "status", "message": f"Transcribing on {device.upper()}"})
    try:
        result = _models[model_key].transcribe(str(audio), language=language, mode="verbatim", word_timestamps=True)
    finally:
        if handler:
            progress_logger.removeHandler(handler)

    words = [
        {"word": w.word, "start": round(w.start, 3),
         "end": round(max(w.end, w.start + 0.01), 3), "confidence": 0.0}
        for w in (result.words or []) if w.word
    ]
    segments = []
    for start in range(0, len(words), 35):
        chunk = words[start:start + 35]
        segments.append({
            "id": len(segments), "start": chunk[0]["start"], "end": chunk[-1]["end"],
            "text": " ".join(w["word"] for w in chunk), "words": chunk,
        })
    output = {"words": words, "segments": segments, "language": result.language}
    if use_cache:
        save_to_cache(source, output, cache_key, "transcribe")
    if progress_callback:
        progress_callback({"type": "progress", "message": "Transcription complete",
                           "current": 1, "total": 1, "progress": 100})
    return output
