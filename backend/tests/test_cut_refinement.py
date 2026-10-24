import math
import struct
import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch

import numpy as np

from services.cut_refinement import (
    _boundary, _kept_edge_at_quiet, _preserve_join_air, _start_after_internal_pause,
    refine_keep_segments,
)


class CutRefinementTests(unittest.TestCase):
    def test_prefix_retake_is_aligned_even_with_a_single_keep_segment(self):
        samples = np.zeros(16000 * 3, dtype=np.float32)
        words = [{'word':'No', 'start':.1, 'end':1}, {'word':'So', 'start':1, 'end':1.02}]
        alignment = {0:{'start':.8,'end':1.04,'score':.9},1:{'start':1.26,'end':1.46,'score':.99}}
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'prefix.wav';source.write_bytes(b'fixture')
            with patch('services.cut_refinement._audio_samples',return_value=samples), patch('services.cut_refinement.align_words_near',return_value=alignment):
                refined=refine_keep_segments(str(source),[{'start':1,'end':3}],words=words,deleted_indices=[0])
                self.assertAlmostEqual(refined[0]['start'],1.24)
                locked=refine_keep_segments(str(source),[{'start':1,'end':3}],words=words,deleted_indices=[0],locked_entrance_indices=[0])
                self.assertEqual(locked[0]['start'],1)

    def test_import_margin_is_kept_independently_on_each_side(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[80:110] = 0.001
        envelope[150:180] = 0.001
        for margin in (0.05, 0.1, 0.17, 0):
            with self.subTest(margin=margin):
                end, start = _preserve_join_air(envelope, 0.8, 1.8, 0, 3,
                                                margin, per_side=True)
                self.assertAlmostEqual(end, 0.8 + margin)
                self.assertAlmostEqual(start, 1.8 - margin)
                self.assertEqual(_preserve_join_air(envelope, end, start, 0, 3,
                                                    margin, per_side=True), (end, start))

    def test_margin_does_not_duplicate_existing_air_or_transfer_locked_allowance(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[80:110] = 0.001
        envelope[150:180] = 0.001
        end, start = _preserve_join_air(envelope, 0.86, 1.78, 0, 3, 0.1, per_side=True)
        self.assertAlmostEqual(end, 0.9)
        self.assertAlmostEqual(start, 1.7)
        end, start = _preserve_join_air(envelope, 0.8, 1.8, 0, 3, 0.1,
                                       locked_exit=True, per_side=True)
        self.assertEqual(end, 0.8)
        self.assertAlmostEqual(start, 1.7)

    def test_profile_margin_stops_before_removed_speech(self):
        envelope = np.full(300, 0.001, dtype=np.float32)
        end, start = _preserve_join_air(envelope, 0.8, 1.8, 0, 3, 0.1,
                                       removed_start=0.84, removed_end=1.76, per_side=True)
        self.assertLessEqual(end, 0.83)
        self.assertGreaterEqual(start, 1.77)

    def test_word_deletions_use_profile_margin_and_invalidate_refinement_cache(self):
        samples = np.full(3 * 16000, 0.08, dtype=np.float32)
        samples[int(0.8 * 16000):int(1.0 * 16000)] = 0.001
        samples[int(1.3 * 16000):int(1.7 * 16000)] = 0.001
        words = [{'word':'okay.', 'start':0.4, 'end':0.7},
                 {'word':'wrong', 'start':1.0, 'end':1.3},
                 {'word':'then', 'start':1.45, 'end':1.9}]
        aligned = {0:{'start':0.45,'end':0.8,'score':0.9},
                   1:{'start':1.0,'end':1.3,'score':0.9},
                   2:{'start':1.7,'end':1.9,'score':0.9}}
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / 'speech.wav'
            source.touch()
            with patch('services.cut_refinement._audio_samples', return_value=samples), \
                    patch('services.cut_refinement.align_words_near', return_value=aligned):
                for margin in (0.05, 0.1, 0.17):
                    result = refine_keep_segments(str(source),
                        [{'start':0,'end':0.7},{'start':1.45,'end':3}],
                        words=words, deleted_indices=[1], join_margin_seconds=margin)
                    # The aligned kept speech ends at .8 and starts at 1.7.
                    self.assertAlmostEqual(result[0]['end'], 0.8 + margin, delta=0.01)
                    self.assertAlmostEqual(result[1]['start'], 1.7 - margin, delta=0.01)

    def test_confirmed_late_kept_word_is_not_clamped_to_old_transcript_end(self):
        words = [{"word": "software", "start": 0.9, "end": 1.3},
                 {"word": "that", "start": 2.26, "end": 2.7},
                 {"word": "that", "start": 3.66, "end": 3.67}]
        aligned = {0: {"start": 1.873, "end": 2.536, "score": 0.76},
                   1: {"start": 2.599, "end": 2.812, "score": 0.94},
                   2: {"start": 3.876, "end": 4.017, "score": 0.81}}
        with tempfile.TemporaryDirectory(prefix="edity-late-word-") as directory:
            source = Path(directory) / "speech.wav"
            source.touch()
            with patch("services.cut_refinement._audio_samples",
                       return_value=np.full(5 * 16000, 0.08, dtype=np.float32)), \
                    patch("services.cut_refinement.align_words_near", return_value=aligned):
                result = refine_keep_segments(str(source),
                    [{"start": 0, "end": 1.3}, {"start": 3.66, "end": 5}],
                    words=words, deleted_indices=[1])
        self.assertGreaterEqual(result[0]["end"], aligned[0]["end"])
        self.assertLess(result[0]["end"], aligned[1]["start"])

    def test_aligned_edge_inside_speech_recovers_consonant_before_adding_air(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[160:166] = 0.001
        edge = _kept_edge_at_quiet(envelope, 1.728, -1, 1.5)
        self.assertAlmostEqual(edge, 1.65)
        self.assertEqual(_kept_edge_at_quiet(envelope, 1.728, -1, 1.7), 1.728)

    def test_kept_decay_extends_only_to_quiet_before_aligned_removed_word(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[84:94] = 0.001
        self.assertAlmostEqual(_kept_edge_at_quiet(envelope, 0.74, 1, 0.93), 0.86)
        self.assertEqual(_kept_edge_at_quiet(envelope, 0.74, 1, 0.8), 0.74)

    def test_join_keeps_short_room_tone_without_reintroducing_removed_speech(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[80:95] = 0.001
        envelope[160:180] = 0.001
        end, start = _preserve_join_air(envelope, 0.81, 1.79, 0, 3, 0.08)
        self.assertAlmostEqual((end - 0.8) + (1.8 - start), 0.08)
        self.assertLess(end, 0.95)
        self.assertGreater(start, 1.6)
        # Repeated refinement cannot accumulate extra pause.
        self.assertEqual(_preserve_join_air(envelope, end, start, 0, 3, 0.08), (end, start))

    def test_join_air_respects_removed_words_even_when_they_are_quiet(self):
        envelope = np.full(300, 0.001, dtype=np.float32)
        envelope[:80] = 0.08
        envelope[180:] = 0.08
        end, start = _preserve_join_air(envelope, 0.8, 1.8, 0, 3, 0.12,
                                       removed_start=0.83, removed_end=1.77)
        self.assertLessEqual(end, 0.82)
        self.assertGreaterEqual(start, 1.78)

    def test_join_air_uses_other_side_when_one_boundary_is_locked(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[80:95] = 0.001
        envelope[160:180] = 0.001
        end, start = _preserve_join_air(envelope, 0.8, 1.8, 0, 3, 0.08, locked_exit=True)
        self.assertEqual(end, 0.8)
        self.assertAlmostEqual(start, 1.72)
        self.assertEqual(_preserve_join_air(envelope, 0.8, 1.8, 0, 3, 0.08,
                                          locked_exit=True, locked_entrance=True), (0.8, 1.8))

    def test_join_air_does_not_cross_audible_removed_tail_or_weak_consonant(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[80:95] = 0.007
        envelope[160:180] = 0.007
        self.assertEqual(_preserve_join_air(envelope, 0.8, 1.8, 0, 3, 0.08), (0.8, 1.8))

    def _refine_word_with_internal_quiet(self, *, retake=False, aligned_tail=True):
        # The weak consonant between syllables looks just like the quiet gap
        # after a stray false start. Transcript/alignment evidence must decide.
        samples = np.full(3 * 16000, 0.08, dtype=np.float32)
        samples[int(1.8 * 16000):int(1.9 * 16000)] = 0
        words = [{"word": "okay", "start": 0.4, "end": 0.7},
                 {"word": "do—" if retake else "[UH]", "start": 1.0, "end": 1.3},
                 {"word": "then" if retake else "before", "start": 1.45, "end": 1.6}]
        aligned = {0: {"start": 0.45, "end": 0.8, "score": 0.9},
                   2: {"start": 1.7, "end": 2.1, "score": 0.9}}
        if aligned_tail:
            aligned[1] = {"start": 1.0, "end": 1.3, "score": 0.9}
        with tempfile.TemporaryDirectory(prefix="edity-syllable-") as directory:
            source = Path(directory) / "speech.wav"
            source.touch()
            with patch("services.cut_refinement._audio_samples", return_value=samples), \
                    patch("services.cut_refinement.align_words_near", return_value=aligned):
                return refine_keep_segments(str(source),
                    [{"start": 0, "end": 0.7}, {"start": 1.45, "end": 3}],
                    late_entrance_indices=[1], long_late_entrance_indices=[1] if retake else [],
                    words=words, deleted_indices=[1])

    def test_filler_removal_preserves_first_syllable_of_aligned_kept_word(self):
        for aligned_tail in (True, False):
            with self.subTest(aligned_tail=aligned_tail):
                result = self._refine_word_with_internal_quiet(aligned_tail=aligned_tail)
                self.assertAlmostEqual(result[1]["start"], 1.68)

    def test_ambiguous_unfinished_retake_still_removes_stray_syllable(self):
        result = self._refine_word_with_internal_quiet(retake=True, aligned_tail=False)
        # Retain 80 ms of the gap after the stray syllable (which ends at 1.8).
        self.assertAlmostEqual(result[1]["start"], 1.82)

    def test_aligned_removed_tail_does_not_override_kept_word_in_retake(self):
        result = self._refine_word_with_internal_quiet(retake=True)
        self.assertAlmostEqual(result[1]["start"], 1.68)

    def test_internal_pause_separates_a_false_start_from_the_kept_word(self):
        envelope = np.full(300, 0.08, dtype=np.float32)
        envelope[112:132] = 0
        self.assertAlmostEqual(_start_after_internal_pause(envelope, 1.0, 1.55), 1.31)

    def test_confident_word_alignment_corrects_both_sides_of_every_word_cut(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = [int(8000 * math.sin(2 * math.pi * 440 * index / rate))
                      for index in range(rate * 3)]
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            words = [{"word": "okay", "start": 0.4, "end": 0.7},
                     {"word": "wrong", "start": 1.0, "end": 1.3},
                     {"word": "then", "start": 1.45, "end": 1.6}]
            aligned = {0: {0: {"start": 0.45, "end": 0.8, "score": 0.9},
                           1: {"start": 1.0, "end": 1.3, "score": 0.9}},
                       2: {1: {"start": 1.0, "end": 1.3, "score": 0.9},
                           2: {"start": 1.7, "end": 1.9, "score": 0.9}}}
            with patch("services.cut_refinement.align_words_near",
                       side_effect=lambda _samples, _words, index, _language: aligned[index]):
                result = refine_keep_segments(str(source),
                                              [{"start": 0, "end": 0.7},
                                               {"start": 1.45, "end": 3}],
                                              words=words, deleted_indices=[1])
            self.assertAlmostEqual(result[0]["end"], 0.825)
            self.assertAlmostEqual(result[1]["start"], 1.68)

    def test_short_quiet_syllable_does_not_shorten_kept_word(self):
        envelope = np.full(200, 0.1, dtype=np.float32)
        envelope[98:101] = 0
        self.assertEqual(_boundary(envelope, 1.0, True), 1.0)

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

    def test_delayed_unfinished_word_is_removed_before_next_kept_word(self):
        with tempfile.TemporaryDirectory(prefix="edity-refine-") as directory:
            source = Path(directory) / "speech.wav"
            rate = 16000
            values = []
            for index in range(rate * 3):
                time = index / rate
                speech = time < 0.8 or 1.7 <= time < 2.1 or time >= 2.3
                values.append(int(8000 * math.sin(2 * math.pi * 440 * time)) if speech else 0)
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(rate)
                output.writeframes(struct.pack(f"<{len(values)}h", *values))
            kept = [{"start": 0, "end": 0.8}, {"start": 1.72, "end": 3}]
            short = refine_keep_segments(str(source), kept, [], [], [1])
            long = refine_keep_segments(str(source), kept, [], [], [1], [1])
            self.assertLess(short[1]["start"], 1.9)
            self.assertGreater(long[1]["start"], 2.1)
            self.assertLess(long[1]["start"], 2.29)
            self.assertAlmostEqual((long[0]["end"] - 0.8) + (2.3 - long[1]["start"]), 0.08)

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
            self.assertAlmostEqual(refined[0]["end"], 1.07, delta=0.01)
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
