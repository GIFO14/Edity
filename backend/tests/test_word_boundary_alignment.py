import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from services.word_boundary_alignment import _match_word, align_cut_boundaries


class WordBoundaryAlignmentTests(unittest.TestCase):
    def test_matches_repeated_word_nearest_its_original_position(self):
        words = [{"word": "smoke", "start": 0.1, "end": 0.3},
                 {"word": "Smoke.", "start": 1.5, "end": 1.7}]
        self.assertEqual(_match_word(words, {"word": "smoke", "start": 343.2,
                                             "end": 343.4}, 342),
                         {"word": "Smoke.", "start": 343.5, "end": 343.7})

    def test_disagreeing_windows_do_not_move_a_neighboring_word(self):
        with tempfile.TemporaryDirectory(prefix="edity-align-test-") as directory:
            source = Path(directory) / "video.mp4"
            source.write_bytes(b"video")
            previous = {"word": "So", "start": 342.34, "end": 342.42}
            following = {"word": "smoke", "start": 343.26, "end": 343.36}
            outputs = [
                ([{"word": "So", "start": 0.1, "end": 0.22}], 342.3),
                ([{"word": "So", "start": 0.11, "end": 0.23}], 342.3),
                ([{"word": "smoke", "start": 0.1, "end": 0.3}], 343.2),
                ([{"word": "smoke", "start": 0.26, "end": 0.46}], 343.2),
            ]
            with patch("services.word_boundary_alignment._local_words", side_effect=outputs):
                result = align_cut_boundaries(str(source), previous, following)
            self.assertAlmostEqual(result["cut_start"], 342.525)
            self.assertIsNone(result["cut_end"])


if __name__ == "__main__":
    unittest.main()
