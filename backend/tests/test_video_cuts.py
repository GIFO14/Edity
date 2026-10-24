import math
import shutil
import struct
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.video_editor import export_reencode, export_reencode_with_subs


@unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg required")
class VideoCutTests(unittest.TestCase):
    def test_hundreds_of_cuts_use_a_short_command_for_both_export_modes(self):
        segments = [{"start": index * 0.03, "end": index * 0.03 + 0.02}
                    for index in range(200)]
        for subtitles in (False, True):
            with self.subTest(subtitles=subtitles), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                source, output = root / "source.mp4", root / "output.mp4"
                caption_file = root / "captions.ass"
                source.touch()
                caption_file.touch()
                observed = []

                def inspect(command, _duration, _callback):
                    self.assertNotIn("-filter_complex", command)
                    self.assertIn("-/filter_complex", command)
                    self.assertLess(sum(map(len, command)), 1000)
                    script = Path(command[command.index("-/filter_complex") + 1])
                    graph = script.read_text(encoding="utf-8")
                    self.assertGreater(len(graph), 32767)
                    self.assertIn("concat=n=200", graph)
                    if subtitles:
                        self.assertIn("ass=", graph)
                    observed.append(script)
                    return subprocess.CompletedProcess(command, 0, "", "")

                with patch("services.video_editor._run_reencode_command", side_effect=inspect):
                    if subtitles:
                        export_reencode_with_subs(str(source), str(output), segments,
                                                  str(caption_file), resolution="original")
                    else:
                        export_reencode(str(source), str(output), segments,
                                        resolution="original")
                self.assertEqual(len(observed), 1)
                self.assertFalse(observed[0].exists())

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
            progress = []
            export_reencode(str(source), str(output),
                            [{"start": 0, "end": 0.87}, {"start": 2.13, "end": 3}],
                            resolution="original", on_progress=progress.append)
            self.assertEqual(progress[-1], 100)
            self.assertTrue(any(0 < value < 100 for value in progress))
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
