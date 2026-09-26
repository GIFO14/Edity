import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path

from services.cut_refinement import refine_keep_segments


class CutRefinementTests(unittest.TestCase):
    def test_unfinished_word_tail_is_removed_after_short_kept_word(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = []
            for index in range(rate * 3):
                time = index / rate
                speech = time < 0.65 or 1.7 <= time < 1.85 or time >= 1.9
                values.append(int(8000 * math.sin(2 * math.pi * 440 * time)) if speech else 0)
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            kept = [{"start": 0, "end": 0.65}, {"start": 1.72, "end": 3}]
            refined = refine_keep_segments(str(source), kept, [], [], [1])
            self.assertGreaterEqual(refined[0]["end"], 0.65)
            self.assertGreater(refined[1]["start"], 1.82)
            self.assertLess(refined[1]["start"], 1.92)

    def test_entrance_never_moves_back_into_marked_word(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = [int(8000 * math.sin(2 * math.pi * 440 * index / rate))
                      if index / rate < 1.0 or index / rate >= 1.2 else 0
                      for index in range(rate * 3)]
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            kept = [{"start": 0, "end": 0.8}, {"start": 1.25, "end": 3}]
            refined = refine_keep_segments(str(source), kept)
            self.assertGreaterEqual(refined[1]["start"], kept[1]["start"])

    def test_moves_cut_to_quiet_edges_without_trimming_kept_speech(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = []
            for index in range(rate * 3):
                time = index / rate
                speech = time < 1 or 1.3 <= time < 2 or time >= 2.2
                values.append(int(8000 * math.sin(2 * math.pi * 440 * time)) if speech else 0)
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            kept = [{"start": 0, "end": 1.1}, {"start": 2.08, "end": 3}]
            refined = refine_keep_segments(str(source), kept)
            self.assertAlmostEqual(refined[0]["end"], 1, delta=0.03)
            self.assertAlmostEqual(refined[1]["start"], 2.19, delta=0.02)
            self.assertEqual(kept[0]["end"], 1.1)

    def test_distant_pause_does_not_cut_the_following_kept_word(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = [int(8000 * math.sin(2 * math.pi * 440 * index / rate))
                      if index / rate < 1.0 or 1.3 <= index / rate < 1.55 or index / rate >= 1.7
                      else 0 for index in range(rate * 3)]
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            kept = [{"start": 0, "end": 1.0}, {"start": 1.3, "end": 3}]
            refined = refine_keep_segments(str(source), kept)
            self.assertLessEqual(refined[1]["start"], 1.3)

    def test_manual_boundaries_are_not_refined(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = [0] * (rate * 3)
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            kept = [{"start": 0, "end": 1.0}, {"start": 2.0, "end": 3}]
            self.assertEqual(refine_keep_segments(str(source), kept, [0], [1]), kept)


if __name__ == "__main__":
    unittest.main()
