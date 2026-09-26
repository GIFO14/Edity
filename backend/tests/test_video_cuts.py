import math
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path

from services.video_editor import export_reencode


@unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg required")
class VideoCutTests(unittest.TestCase):
    def test_export_audio_does_not_pad_a_non_frame_aligned_cut(self):
        with tempfile.TemporaryDirectory(prefix="edity-export-join-") as directory:
            source = Path(directory) / "source.mp4"
            output = Path(directory) / "export.mp4"
            subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                "-f", "lavfi", "-i", "testsrc2=size=160x90:rate=30:duration=3",
                "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
                "-c:v", "libx264", "-c:a", "aac", str(source),
            ], check=True, capture_output=True)
            export_reencode(str(source), str(output),
                            [{"start": 0, "end": 0.87}, {"start": 2.13, "end": 3}],
                            resolution="original")
            pcm = subprocess.run([
                "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", str(output),
                "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1",
            ], check=True, capture_output=True).stdout
            samples = struct.unpack(f"<{len(pcm) // 2}h", pcm)
            for center in (0.85, 0.87, 0.89):
                window = samples[int((center - 0.01) * 16000):int((center + 0.01) * 16000)]
                rms = math.sqrt(sum(sample * sample for sample in window) / len(window))
                self.assertGreater(rms, 100, f"Silent audio near cut at {center}s")


if __name__ == "__main__":
    unittest.main()
