import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from services.playback_audio import prepare_playback_audio


class PlaybackAudioTests(unittest.TestCase):
    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_audio_sidecar_is_cached_and_keeps_source_duration(self):
        with tempfile.TemporaryDirectory(prefix="edity-audio-") as directory:
            source = Path(directory) / "source.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=2",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
                "-c:v", "libx264", "-c:a", "aac", str(source),
            ], check=True, capture_output=True)
            first = prepare_playback_audio(str(source))
            output = Path(first["path"])
            self.assertEqual(first["status"], "ready")
            self.assertLess(output.stat().st_size, source.stat().st_size)
            mtime = output.stat().st_mtime_ns
            again = prepare_playback_audio(str(source))
            self.assertEqual(again["path"], str(output))
            self.assertEqual(output.stat().st_mtime_ns, mtime)
            duration = subprocess.run([
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(output),
            ], capture_output=True, text=True, check=True)
            self.assertAlmostEqual(float(duration.stdout), 2, delta=0.1)
