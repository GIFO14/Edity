"""Import-time silence removal using the vendored Auto-Editor source."""

import os
import re
import subprocess
import sys
import json
from fractions import Fraction
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
                   progress_callback: Callable[[dict], None] | None = None, output_path: str | None = None) -> dict:
    source = Path(file_path).expanduser().resolve()
    if not source.is_file():
        raise FileNotFoundError(source)
    margin = resolve_margin(preset, custom_margin)

    # Never overwrite either the recording or an earlier processed import.
    candidate = Path(output_path).resolve() if output_path else source.with_name(f"{source.stem}_edity_silence{source.suffix}")
    if candidate==source:raise ValueError('Silence output cannot overwrite the recording')
    candidate.parent.mkdir(parents=True,exist_ok=True)
    output_base = candidate
    counter = 2
    while candidate.exists():
        candidate = output_base.with_name(f"{output_base.stem}_{counter}{output_base.suffix}")
        counter += 1

    env = os.environ.copy()
    env["PYTHONPATH"] = os.pathsep.join(filter(None, [str(VENDOR_ROOT), env.get("PYTHONPATH")]))
    map_path=candidate.with_suffix(candidate.suffix+'.silence-map.json')
    env['EDITY_SILENCE_MAP_PATH']=str(map_path)
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
    process.stdout.close()
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
    source_map=None
    if map_path.is_file():
        timeline=json.loads(map_path.read_text(encoding='utf8'))
        tb=Fraction(timeline['timebase']);segments=[]
        layers=timeline.get('v') or timeline.get('a') or []
        for item in (layers[0] if layers else []):
            if item.get('name') not in ('video','audio') or item['dur']<=0:continue
            to_us=lambda frame:round(Fraction(str(frame))/tb*1000000)
            segments.append({'originalStartUs':to_us(item['offset']), 'originalEndUs':to_us(item['offset']+item['dur']*item.get('speed',1)),
                             'processedStartUs':to_us(item['start']), 'processedEndUs':to_us(item['start']+item['dur'])})
        source_map={'format':'edity.silence_source_map.v1','kind':'silence-processed','timebase':str(tb),'segments':segments,'marginSeconds':margin,
                    'processedContentDurationUs':max((s['processedEndUs'] for s in segments),default=0)}
        probe=subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','default=noprint_wrappers=1:nokey=1',str(source)],
                             capture_output=True,text=True,check=True,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
        source_map['originalDurationUs']=round(float(probe.stdout.strip())*1000000)
        map_path.write_text(json.dumps(source_map),encoding='utf8')
    return {"output_path": str(candidate), "margin_seconds": margin,'source_map':source_map}
