import unittest
from unittest.mock import patch

import numpy as np

from services.speech_cut_alignment import align_words_near


class SpeechCutAlignmentTests(unittest.TestCase):
    def setUp(self):
        self.samples = np.zeros(5 * 16000, dtype=np.float32)
        self.words = [{"word": "software", "start": 1.0, "end": 1.4},
                      {"word": "that", "start": 2.6, "end": 2.8}]
        self.delayed = {0: {"start": 2.0, "end": 2.55, "score": 0.76},
                        1: {"start": 2.65, "end": 2.85, "score": 0.9}}

    def test_large_timestamp_error_requires_two_agreeing_windows(self):
        second = {0: {"start": 2.01, "end": 2.57, "score": 0.78}}
        with patch("services.speech_cut_alignment._align_window",
                   side_effect=[self.delayed, second]) as align:
            result = align_words_near(self.samples, self.words, 0)
        self.assertEqual(result[0], {"start": 2.0, "end": 2.57, "score": 0.76})
        self.assertEqual(result[1], self.delayed[1])
        self.assertEqual(align.call_args_list[0].kwargs["radius"], 1.7)
        self.assertEqual(align.call_args_list[1].kwargs["radius"], 2.5)

    def test_disagreement_or_missing_confirmation_does_not_move_cut(self):
        for second in ({}, {0: {"start": 2.2, "end": 2.6, "score": 0.9}},
                       {0: {"start": 2.0, "end": 2.55, "score": 0.6}}):
            with self.subTest(second=second), patch(
                    "services.speech_cut_alignment._align_window",
                    side_effect=[self.delayed, second]):
                self.assertNotIn(0, align_words_near(self.samples, self.words, 0))

    def test_ordinary_alignment_does_not_need_extra_inference(self):
        with patch("services.speech_cut_alignment._align_window",
                   return_value=self.delayed) as align:
            result = align_words_near(self.samples, self.words, 1)
        self.assertEqual(result, {1: self.delayed[1]})
        align.assert_called_once()

    def test_weak_or_distant_candidate_is_not_recovered(self):
        for candidate in ({"start": 2.0, "end": 2.55, "score": 0.6},
                          {"start": 3.0, "end": 3.5, "score": 0.95}):
            with self.subTest(candidate=candidate), patch(
                    "services.speech_cut_alignment._align_window",
                    return_value={0: candidate}) as align:
                self.assertEqual(align_words_near(self.samples, self.words, 0), {})
                align.assert_called_once()


if __name__ == "__main__":
    unittest.main()
