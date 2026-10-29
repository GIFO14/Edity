"""Scan every decoded frame of the isolated v52 transition exports."""
import json
import subprocess
import sys
from pathlib import Path

import numpy as np


def scan(path):
    probe = json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)
    ]))
    video = next(s for s in probe["streams"] if s["codec_type"] == "video")
    assert (video["width"], video["height"], video["avg_frame_rate"]) == (1920, 1080, "60/1")
    assert abs(float(probe["format"]["duration"]) - 8) < .04
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-an", "-vf", "scale=64:36",
        "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"
    ])
    frames = np.frombuffer(raw, np.uint8).reshape(-1, 36, 64, 3)
    assert len(frames) == 480
    colors = frames.mean(axis=(1, 2))
    black = np.flatnonzero(colors.sum(axis=1) < 15)
    assert len(black) == 0, black.tolist()
    # The deliberately removed middle includes the red-to-cyan source change.
    assert colors[60, 0] > 180 and colors[60, 1] < 60
    assert colors[180, 0] < 60 and colors[180, 1] > 180
    transition = colors[105:135]
    assert ((transition[:, 0] > 65) & (transition[:, 1] > 65)).any()
    assert len({f.tobytes() for f in frames[105:135]}) >= 12
    return {"frames": len(frames), "fps": 60, "durationSeconds": float(probe["format"]["duration"]),
            "blackFrames": len(black), "transitionFrames": len(transition),
            "distinctTransitionPictures": len({f.tobytes() for f in frames[105:135]}),
            "minimumColorSum": float(colors.sum(axis=1).min())}, frames


if __name__ == "__main__":
    root = Path(sys.argv[1])
    results, pictures = {}, {}
    for name in ("native", "compatible"):
        results[name], pictures[name] = scan(root / (name + ".mp4"))
    difference = np.abs(pictures["native"].astype(float) - pictures["compatible"].astype(float)).mean(axis=(1, 2, 3))
    # Allow lossy encoder differences, while detecting divergent clocks/pictures.
    assert difference.max() < 15, difference.max()
    results["maxEncoderFrameMeanDifference"] = float(difference.max())
    results["passed"] = True
    (root / "export-frame-scan.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results))
