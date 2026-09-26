import math
import json
import os
import shutil
import struct
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from services.edited_preview import _prune_old_previews, _render, _segments, edited_preview


class EditedPreviewTests(unittest.TestCase):
    def test_prune_keeps_plain_and_studio_variants(self):
        with tempfile.TemporaryDirectory(prefix="edity-edit-cache-") as directory:
            root = Path(directory)
            original = root / "video.mp4"
            original.touch()
            variants = [
                ("plain-old", "video.edity-preview.mp4"),
                ("studio", "video.edity-preview-studio.mp4"),
                ("plain-new", "video.edity-preview.mp4"),
            ]
            for index, (name, source) in enumerate(variants):
                file = root / f"video.edity-edit-{name}.mp4"
                file.write_bytes(b"preview")
                file.with_suffix(".json").write_text(
                    json.dumps({"source": source}), encoding="utf-8")
                file.touch()
                os.utime(file, (index + 1, index + 1))
            latest = root / "video.edity-edit-plain-new.mp4"
            _prune_old_previews(original, latest)
            self.assertFalse((root / "video.edity-edit-plain-old.mp4").exists())
            self.assertTrue((root / "video.edity-edit-studio.mp4").exists())
            self.assertTrue(latest.exists())

    def test_invalid_segments_are_rejected(self):
        with self.assertRaises(ValueError):
            _segments([{"start": 2, "end": 3}, {"start": 1, "end": 2}], 4)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_cut_preview_has_continuous_audio_at_join(self):
        with tempfile.TemporaryDirectory(prefix="edity-edit-test-") as directory:
            source = Path(directory) / "source.mp4"
            output = Path(directory) / "edited.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=3",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                "-c:v", "libx264", "-c:a", "aac", str(source),
            ], check=True, capture_output=True)
            job = {"source": str(source), "cancelled": False, "progress": 0,
                   "process": None, "fingerprint": {}}
            _render(source, output, [(0, 0.87), (2.13, 3)], job)
            self.assertEqual(job.get("status"), "ready", job.get("error"))
            pcm = subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output),
                "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1",
            ], check=True, capture_output=True).stdout
            samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
            self.assertAlmostEqual(len(samples) / 16000, 1.74, delta=0.1)
            for center in (0.85, 0.87, 0.89):
                window = samples[int((center - 0.01) * 16000):int((center + 0.01) * 16000)]
                rms = math.sqrt(sum(sample * sample for sample in window) / len(window))
                self.assertGreater(rms, 100, f"Silent audio near cut at {center}s")

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_ready_preview_is_reused_instead_of_rendered_again(self):
        with tempfile.TemporaryDirectory(prefix="edity-edit-cache-") as directory:
            source = Path(directory) / "source.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=3",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                "-c:v", "libx264", "-c:a", "aac", str(source),
            ], check=True, capture_output=True)
            segments = [{"start": 0, "end": 0.87}, {"start": 2.13, "end": 3}]
            with mock.patch("services.edited_preview._cached", return_value=source):
                deadline = time.monotonic() + 15
                while time.monotonic() < deadline:
                    result = edited_preview(str(source), False, segments)
                    if result["status"] != "preparing":
                        break
                    time.sleep(0.05)
                self.assertEqual(result["status"], "ready", result.get("error"))
                output = Path(result["path"])
                mtime = output.stat().st_mtime_ns
                repeated = edited_preview(str(source), False, segments)
            self.assertEqual(repeated["status"], "ready")
            self.assertEqual(output.stat().st_mtime_ns, mtime)


if __name__ == "__main__":
    unittest.main()
