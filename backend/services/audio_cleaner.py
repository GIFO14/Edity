"""
Audio noise reduction using DeepFilterNet.
Falls back to a basic FFmpeg noise filter if DeepFilterNet is not installed.
"""

import logging
import subprocess
import tempfile
import threading
from pathlib import Path
from typing import Callable

logger = logging.getLogger(__name__)

try:
    from df.enhance import enhance, init_df, load_audio, save_audio
    DEEPFILTER_AVAILABLE = True
except ImportError:
    DEEPFILTER_AVAILABLE = False


_df_model = None
_df_state = None
_df_lock = threading.RLock()


def _init_deepfilter():
    global _df_model, _df_state
    if _df_model is None:
        logger.info("Initializing DeepFilterNet model")
        _df_model, _df_state, _ = init_df()
    return _df_model, _df_state


def clean_audio(
    input_path: str,
    output_path: str = "",
    on_progress: Callable[[int], None] | None = None,
) -> str:
    """
    Apply noise reduction to an audio file.

    If DeepFilterNet is available, uses it for high-quality results.
    Otherwise falls back to FFmpeg's anlmdn filter.

    Returns: path to the cleaned audio file.
    """
    input_path = Path(input_path)
    if not input_path.is_file():
        raise FileNotFoundError(f"Audio or video file not found: {input_path}")
    if not output_path:
        output_path = str(input_path.with_name(input_path.stem + "_clean.wav"))
    output = Path(output_path)
    if input_path.resolve() == output.resolve():
        raise ValueError("Studio Sound output must be different from the source file")
    output.parent.mkdir(parents=True, exist_ok=True)

    if DEEPFILTER_AVAILABLE:
        with _df_lock:
            return _clean_with_deepfilter(str(input_path), str(output), on_progress)
    else:
        return _clean_with_ffmpeg(str(input_path), str(output))


def _clean_with_deepfilter(input_path: str, output_path: str,
                           on_progress: Callable[[int], None] | None = None) -> str:
    model, state = _init_deepfilter()
    # libsndfile cannot read the AAC track inside an MP4. Decode through FFmpeg
    # first so Studio Sound works on the project video as well as audio files.
    with tempfile.TemporaryDirectory(prefix="edity_deepfilter_") as directory:
        decoded = Path(directory) / "speech.wav"
        result = subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-i", input_path, "-vn", "-ac", "1",
             "-ar", str(state.sr()), "-c:a", "pcm_s16le", str(decoded)],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Could not decode audio for Studio Sound: {result.stderr[-300:]}")
        audio, _info = load_audio(str(decoded), sr=state.sr())
        chunk_samples = state.sr() * 20
        if not hasattr(audio, "shape") or audio.shape[-1] <= chunk_samples:
            enhanced = enhance(model, state, audio)
            if on_progress:
                on_progress(100)
        else:
            import torch
            chunks = []
            total = audio.shape[-1]
            for start in range(0, total, chunk_samples):
                chunk = audio[..., start:min(start + chunk_samples, total)].contiguous()
                try:
                    cleaned = enhance(model, state, chunk)
                except RuntimeError as error:
                    if "CUDNN" not in str(error).upper() and "CUDA" not in str(error).upper():
                        raise
                    logger.warning("DeepFilterNet GPU failed; continuing on CPU: %s", error)
                    from df.config import config
                    config.set("DEVICE", "cpu", str, section="train")
                    model = model.to("cpu")
                    global _df_model
                    _df_model = model
                    cleaned = enhance(model, state, chunk)
                chunks.append(cleaned)
                if on_progress:
                    on_progress(min(99, round(100 * (start + chunk.shape[-1]) / total)))
            enhanced = torch.cat(chunks, dim=-1)
            if on_progress:
                on_progress(100)
        save_audio(output_path, enhanced, sr=state.sr())
    logger.info(f"DeepFilterNet cleaned audio saved to {output_path}")
    return output_path


def _clean_with_ffmpeg(input_path: str, output_path: str) -> str:
    """Fallback: basic noise reduction using FFmpeg's anlmdn filter."""
    cmd = [
        "ffmpeg", "-y",
        "-i", input_path,
        "-af", "anlmdn=s=7:p=0.002:r=0.002:m=15",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg audio cleaning failed: {result.stderr[-300:]}")
    logger.info(f"FFmpeg cleaned audio saved to {output_path}")
    return output_path


def is_deepfilter_available() -> bool:
    return DEEPFILTER_AVAILABLE
