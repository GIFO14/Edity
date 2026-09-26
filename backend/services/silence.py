"""Import-time silence removal using the vendored Auto-Editor source."""

import os
import re
import subprocess
import sys
from pathlib import Path
from typing import Callable


PRESET_MARGINS = {"personal": 0.1, "gaming": 0.05}
VENDOR_ROOT = Path(__file__).resolve().parents[1] / "vendor"
_MACHINE_PROGRESS = re.compile(r"^([^~]+)~([0-9.]+)~([0-9.]+)~")
_PHASE_RANGES = {
    "Analyzing audio volume": (0, 25),
    "Creating new audio": (25, 25),
    "Creating new video": (50, 40),
}


def resolve_margin(preset: str, custom_margin: float | None) -> float:
    if preset in PRESET_MARGINS:
        return PRESET_MARGINS[preset]
    if preset != "custom" or custom_margin is None:
        raise ValueError("Choose a valid silence preset and, for custom, a margin in seconds")
    if not 0 <= custom_margin <= 10:
        raise ValueError("Custom silence margin must be between 0 and 10 seconds")
    return custom_margin


def _progress_event(line: str) -> dict | None:
    match = _MACHINE_PROGRESS.match(line.strip())
    if not match:
        return None
    title, current_text, total_text = match.groups()
    try:
        current, total = float(current_text), float(total_text)
    except ValueError:
        return None
    phase_progress = 100 if total <= 0 else max(0, min(100, round(100 * current / total)))
    base, span = _PHASE_RANGES.get(title, (0, 90))
    overall = min(90, base + round(span * phase_progress / 100))
    return {"type": "progress", "message": title, "progress": overall,
            "phase_progress": phase_progress}


def remove_silence(file_path: str, preset: str, custom_margin: float | None = None,
                   progress_callback: Callable[[dict], None] | None = None) -> dict:
    source = Path(file_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    margin = resolve_margin(preset, custom_margin)

    # Never overwrite either the recording or an earlier processed import.
    candidate = source.with_name(f"{source.stem}_edity_silence{source.suffix}")
    counter = 2
    while candidate.exists():
        candidate = source.with_name(f"{source.stem}_edity_silence_{counter}{source.suffix}")
        counter += 1

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(filter(None, [str(VENDOR_ROOT), env.get("PYTHONPATH")]))
    command = [sys.executable, "-m", "auto_editor", str(source), "--margin", f"{margin:g}sec",
               "--progress", "machine", "--no-open", "--output", str(candidate)]
    if progress_callback:
        progress_callback({"type": "progress", "message": "Starting silence removal",
                           "progress": 0, "phase_progress": 0})
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        env=env,
        creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
    )
    diagnostics: list[str] = []
    pending = ""
    last_key: tuple[str, int] | None = None
    assert process.stdout is not None
    while True:
        chunk = process.stdout.read1(4096)
        if not chunk:
            break
        pending += chunk.decode("utf-8", "replace")
        parts = re.split(r"[\r\n]", pending)
        pending = parts.pop()
        for part in parts:
            event = _progress_event(part)
            if event:
                key = (event["message"], event["phase_progress"])
                if progress_callback and key != last_key:
                    progress_callback(event)
                    last_key = key
                if event["phase_progress"] >= 95 and event["message"] == "Creating new video":
                    final = {"type": "progress", "message": "Finalizing the edited video",
                             "progress": 95, "phase_progress": 95}
                    if progress_callback:
                        progress_callback(final)
                    last_key = (final["message"], 95)
            elif part.strip():
                diagnostics.append(part.strip())
                diagnostics = diagnostics[-30:]
    if pending.strip():
        diagnostics.append(pending.strip())
    try:
        return_code = process.wait(timeout=60 * 60 * 4)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()
        raise
    if return_code != 0 or not candidate.is_file():
        raise RuntimeError(("\n".join(diagnostics) or "Auto-Editor failed")[-3000:])
    if progress_callback:
        progress_callback({"type": "progress", "message": "Silence removal complete",
                           "progress": 100, "phase_progress": 100})
    return {"output_path": str(candidate), "margin_seconds": margin}
