import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from services.media import render_media


@unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg is required")
class MediaRenderTests(unittest.TestCase):
    def test_broll_source_start_uses_the_selected_part_of_clip(self):
        with tempfile.TemporaryDirectory(prefix="edity-media-render-") as directory:
            root = Path(directory)
            main = root / "main.mp4"
            broll = root / "broll.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                            "color=c=black:s=160x90:r=25:d=3", "-f", "lavfi", "-i",
                            "anullsrc=r=44100:cl=stereo", "-t", "3", "-c:v", "libx264",
                            "-c:a", "aac", str(main)], check=True, capture_output=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                            "color=c=red:s=160x90:r=25:d=2", "-f", "lavfi", "-i",
                            "color=c=blue:s=160x90:r=25:d=2", "-filter_complex",
                            "[0:v][1:v]concat=n=2:v=1:a=0[v]", "-map", "[v]", "-c:v", "libx264",
                            str(broll)], check=True, capture_output=True)
            render_media(str(main), [{"type": "broll", "path": str(broll), "start": 0,
                                      "end": 1, "sourceStart": 2, "volume": 0.3}])
            result = subprocess.run(["ffmpeg", "-v", "error", "-ss", "0.5", "-i", str(main),
                                     "-frames:v", "1", "-vf", "scale=1:1,format=rgb24",
                                     "-f", "rawvideo", "pipe:1"], check=True, capture_output=True)
            red, green, blue = result.stdout[:3]
            self.assertGreater(blue, red + 40, (red, green, blue))


if __name__ == "__main__":
    unittest.main()
