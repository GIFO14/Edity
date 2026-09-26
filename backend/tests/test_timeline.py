import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from services.timeline import compose_timeline


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
class TimelineTests(unittest.TestCase):
    def test_multiple_clips_become_one_continuous_timeline(self):
        with tempfile.TemporaryDirectory(prefix="edity-timeline-test-") as directory:
            root = Path(directory)
            clips_dir = root / "clips"
            clips_dir.mkdir()
            clips = []
            for index, color in enumerate(("red", "blue")):
                clip = clips_dir / f"clip-{index}.mp4"
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                                f"color=c={color}:s=320x180:r=30:d=1", "-f", "lavfi", "-i",
                                "anullsrc=r=48000:cl=stereo", "-t", "1", "-c:v", "libx264",
                                "-c:a", "aac", str(clip)], check=True, capture_output=True)
                clips.append(str(clip))
            output = root / "video.mp4"
            result = compose_timeline(clips, str(output))
            self.assertTrue(output.is_file())
            self.assertAlmostEqual(result["duration"], 2, delta=0.15)
            self.assertEqual(result["clips"][0]["start"], 0)
            self.assertAlmostEqual(result["clips"][1]["start"], 1, delta=0.1)
            frame = subprocess.run(["ffmpeg", "-v", "error", "-ss", "1.5", "-i", str(output),
                                    "-frames:v", "1", "-vf", "scale=1:1,format=rgb24",
                                    "-f", "rawvideo", "pipe:1"], check=True, capture_output=True).stdout
            self.assertGreater(frame[2], frame[0] + 40)

    def test_output_cannot_be_used_as_a_source_clip(self):
        with tempfile.TemporaryDirectory(prefix="edity-timeline-test-") as directory:
            output = Path(directory) / "video.mp4"
            output.write_bytes(b"not used")
            with self.assertRaisesRegex(ValueError, "cannot overwrite"):
                compose_timeline([str(output)], str(output))


if __name__ == "__main__":
    unittest.main()
