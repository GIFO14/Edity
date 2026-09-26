import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import numpy as np

from services import sound_events


class _FakeDetector:
    def __init__(self, framewise):
        self.framewise = framewise

    def inference(self, _audio):
        return self.framewise


class SoundEventTests(unittest.TestCase):
    def test_probability_runs_use_hysteresis_and_keep_peak_confidence(self):
        probabilities = np.array([0.1, 0.3, 0.6, 0.5, 0.1, 0.0], dtype=np.float32)
        runs = sound_events._probability_runs(probabilities, 0.1, 0.25, 2.0, 0.6)
        self.assertEqual(len(runs), 1)
        self.assertAlmostEqual(runs[0][0], 2.1)
        self.assertAlmostEqual(runs[0][1], 2.4)
        self.assertAlmostEqual(runs[0][2], 0.6, places=5)

    def test_merge_events_combines_adjacent_instances_of_the_same_label(self):
        merged = sound_events._merge_events([
            {"label": "Cough", "start": 1.0, "end": 1.3, "confidence": 0.5},
            {"label": "Cough", "start": 1.4, "end": 1.8, "confidence": 0.8},
            {"label": "Sneeze", "start": 4.0, "end": 4.4, "confidence": 0.7},
        ])
        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["label"], "Cough")
        self.assertAlmostEqual(merged[0]["end"], 1.8)
        self.assertAlmostEqual(merged[0]["confidence"], 0.8)

    def test_high_confidence_event_is_only_auto_marked_without_speech_overlap(self):
        labels = ["Cough", "Burping, eructation"]
        framewise = np.zeros((1, 100, len(labels)), dtype=np.float32)
        framewise[0, 20:31, 0] = 0.9
        audio = np.zeros(sound_events.SAMPLE_RATE * 10, dtype=np.float32)
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "clip.mp4"
            source.write_bytes(b"placeholder")
            with patch.object(sound_events, "_get_model", return_value=(_FakeDetector(framewise), labels)), \
                    patch.object(sound_events, "_decode_audio", return_value=audio):
                clear = sound_events.detect_sound_events(str(source), [])
                overlap = sound_events.detect_sound_events(str(source), [{"start": 1.9, "end": 3.2}])

        self.assertEqual(len(clear["events"]), 1)
        self.assertTrue(clear["events"][0]["markedForRemoval"])
        self.assertFalse(clear["events"][0]["overlapsSpeech"])
        self.assertFalse(overlap["events"][0]["markedForRemoval"])
        self.assertTrue(overlap["events"][0]["overlapsSpeech"])


if __name__ == "__main__":
    unittest.main()
