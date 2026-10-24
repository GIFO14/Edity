import math
import shutil
import struct
import subprocess
import tempfile
import unittest
import wave
from pathlib import Path

from services.silence import remove_silence


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
class SilenceIntegrationTests(unittest.TestCase):
    def test_vendored_auto_editor_removes_a_middle_pause(self):
        with tempfile.TemporaryDirectory(prefix="edity-silence-integration-") as directory:
            root = Path(directory)
            audio = root / "speech.wav"
            sample_rate = 16000
            with wave.open(str(audio), "wb") as file:
                file.setnchannels(1)
                file.setsampwidth(2)
                file.setframerate(sample_rate)
                for index in range(2 * sample_rate):
                    active = index < sample_rate // 2 or index >= 3 * sample_rate // 2
                    value = int(14000 * math.sin(2 * math.pi * 440 * index / sample_rate)) if active else 0
                    file.writeframesraw(struct.pack("<h", value))
            source = root / "recording.mp4"
            subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                            "-f", "lavfi", "-i", "color=c=black:s=64x64:r=15:d=2",
                            "-i", str(audio), "-c:v", "mpeg4", "-c:a", "aac", "-shortest",
                            str(source)], check=True)

            progress = []
            result = remove_silence(str(source), "personal", progress_callback=progress.append)
            output = Path(result["output_path"])
            self.assertTrue(source.is_file())
            self.assertTrue(output.is_file())
            self.assertNotEqual(output, source)
            self.assertEqual(progress[-1]["progress"], 100)
            duration = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                       "-of", "default=noprint_wrappers=1:nokey=1", str(output)],
                                      capture_output=True, text=True, check=True)
            self.assertLess(float(duration.stdout), 1.6)
            mapping=result['source_map']
            self.assertEqual(mapping['format'],'edity.silence_source_map.v1')
            self.assertEqual(len(mapping['segments']),2)
            first,last=mapping['segments']
            self.assertEqual(first['processedStartUs'],0)
            self.assertEqual(first['processedEndUs'],last['processedStartUs'])
            self.assertGreater(last['originalStartUs']-first['originalEndUs'],500000)


if __name__ == "__main__":
    unittest.main()
