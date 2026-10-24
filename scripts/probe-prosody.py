"""Local CREPE feasibility probe on a project's post-silence-removal audio.

This records measurements; it does not change a project or its edit decisions.
Install torchcrepe==0.0.24 and resampy==0.4.3 in the existing Python environment.
"""
import argparse
import json
import subprocess
import time
from pathlib import Path

import numpy as np
import torch
import torchcrepe


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--project", type=Path, required=True)
    parser.add_argument("--start", type=float, default=0)
    parser.add_argument("--duration", type=float, default=20)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if args.start < 0 or args.duration <= 0:
        parser.error("start must be nonnegative and duration positive")
    project = json.loads(args.project.read_text(encoding="utf-8"))
    source = project["videoPath"]
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", str(args.start),
                          "-i", source, "-t", str(args.duration), "-vn", "-ac", "1",
                          "-ar", "16000", "-f", "f32le", "pipe:1"],
                         check=True, capture_output=True).stdout
    samples = np.frombuffer(raw, dtype="<f4").copy()
    if not len(samples):
        raise ValueError("No audio in the requested interval")
    device = "cuda" if torch.cuda.is_available() else "cpu"
    begun = time.perf_counter()
    with torch.inference_mode():
        pitch, periodicity = torchcrepe.predict(
            torch.from_numpy(samples).unsqueeze(0).to(device), 16000, 160,
            50, 550, model="full", batch_size=512, device=device,
            return_periodicity=True)
    elapsed = time.perf_counter() - begun
    pitch = pitch[0].cpu().numpy()
    confidence = periodicity[0].cpu().numpy()
    times = np.arange(len(pitch)) * .01
    # CREPE was not trained on silence. Periodicity alone cannot reject it.
    padded = np.pad(samples, (320, 320))
    rms = np.array([np.sqrt(np.mean(padded[i * 160:i * 160 + 640] ** 2))
                    for i in range(len(pitch))])
    valid = (confidence >= .5) & (rms >= .006)
    frames = [{"time": round(float(t + args.start), 3),
               "pitchHz": round(float(f), 2) if ok else None,
               "periodicity": round(float(c), 4), "rms": round(float(e), 5)}
              for t, f, c, e, ok in zip(times, pitch, confidence, rms, valid)]
    notes = []
    for index, word in enumerate(project["words"]):
        a, b = float(word["start"]), float(word["end"])
        if a < args.start or b > args.start + len(samples) / 16000 or b <= a:
            continue
        mask = (times + args.start >= a) & (times + args.start < b)
        voiced = mask & valid
        note = {"wordIndex": index, "word": word["word"], "start": a, "end": b,
                "reliablePitchFraction": round(float(np.sum(voiced) / max(1, np.sum(mask))), 3)}
        indices = np.flatnonzero(voiced)
        if len(indices) >= 6:
            count = max(2, len(indices) // 3)
            first = float(np.median(pitch[indices[:count]]))
            last = float(np.median(pitch[indices[-count:]]))
            change = 12 * np.log2(last / first)
            note.update(medianPitchHz=round(float(np.median(pitch[voiced])), 2),
                        pitchChangeSemitones=round(float(change), 2),
                        measuredPitchTrend="rising" if change > 1 else "falling" if change < -1 else "level")
        else:
            note["measuredPitchTrend"] = "unknown"
        notes.append(note)
    report = {"model": "CREPE full", "implementation": "torchcrepe 0.0.24",
              "source": source, "analysisStage": "after-silence-removal",
              "start": args.start, "duration": len(samples) / 16000,
              "hopSeconds": .01, "device": device, "inferenceSeconds": elapsed,
              "limitations": ["Pitch trend is a measurement, not a sentence-boundary label.",
                              "Background music/game sounds can contaminate pitch.",
                              "Original word timestamps can be inaccurate."],
              "words": notes, "frames": frames}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(args.output), "words": len(notes),
                      "frames": len(frames), "device": device,
                      "inferenceSeconds": round(elapsed, 3)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
