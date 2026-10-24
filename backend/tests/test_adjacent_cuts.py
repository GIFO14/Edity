import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from services.adjacent_cuts import coalesce_quiet_cut_slivers
from services import cut_manifest


class AdjacentCutTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name) / 'source.mp4'
        self.source.write_bytes(b'fixture')
        self.ranges = [{'start': 14.03, 'end': 18.24}, {'start': 22.28, 'end': 27.638}]
        self.clips = [{'id': 'hook', 'start': 0, 'duration': 30,
            'sourceMap': {'kind': 'silence-processed', 'segments': [
                {'processedStartUs': 0, 'originalStartUs': 0, 'originalEndUs': 18166443},
                {'processedStartUs': 18166443, 'originalStartUs': 51282701, 'originalEndUs': 61049247},
                {'processedStartUs': 22283058, 'originalStartUs': 65249195, 'originalEndUs': 70582463}]}}]
        self.words = [{'word': 'thing', 'start': 17.78, 'end': 18.0},
                      {'word': 'and', 'start': 18.28, 'end': 18.39},
                      {'word': 'and', 'start': 22.38, 'end': 22.44}]
        self.samples = np.zeros(30 * 16000, dtype=np.float32)

    def run_cleanup(self, **options):
        with patch('services.cut_refinement._persistent_cache_file', return_value=Path(self.temp.name) / 'cache.json'), \
             patch.dict('services.cut_refinement._samples', {}, clear=True), \
             patch('services.cut_refinement._audio_samples', return_value=self.samples):
            return coalesce_quiet_cut_slivers(str(self.source), self.ranges, self.clips,
                words=self.words, deleted_indices=[1], **options)

    def test_actual_pair_collapses_to_one_join_without_changing_words(self):
        result = self.run_cleanup()
        self.assertEqual(result, [{'start': 14.03, 'end': 18.166443},
                                  {'start': 22.283058, 'end': 27.638}])
        self.assertEqual(self.ranges[0]['end'], 18.24)

    def test_short_consonant_and_louder_audio_are_preserved(self):
        # A 1 ms transient would disappear in a long-window RMS average.
        self.samples[round(18.20 * 16000):round(18.201 * 16000)] = .04
        result = self.run_cleanup()
        self.assertEqual(result[0], self.ranges[0])
        self.assertEqual(result[1]['start'], 22.283058)

    def test_retained_word_guard_and_manual_locks_are_preserved(self):
        self.words[0]['end'] = 18.19
        result = self.run_cleanup(locked_entrance_indices=[1])
        self.assertEqual(result, self.ranges)

    def test_no_provenance_or_long_fragment_is_not_guessed(self):
        self.clips[0].pop('sourceMap')
        self.assertEqual(self.run_cleanup(), self.ranges)

    def test_long_fragment_is_not_trimmed(self):
        self.ranges[0]['end'] = 18.4
        self.assertEqual(self.run_cleanup()[0], self.ranges[0])

    def test_low_energy_sustained_audio_is_not_silence(self):
        self.samples[round(18.18 * 16000):round(18.22 * 16000)] = .006
        self.assertEqual(self.run_cleanup()[0], self.ranges[0])

    def test_manual_exit_and_unknown_transcript_are_not_changed(self):
        self.assertEqual(self.run_cleanup(locked_exit_indices=[0])[0], self.ranges[0])
        self.words = []
        self.assertEqual(self.run_cleanup(), self.ranges)

    def test_manifest_uses_trimmed_clock_before_narration_and_cache(self):
        with patch('services.cut_manifest.refine_keep_segments', return_value=self.ranges), \
             patch('services.adjacent_cuts.coalesce_quiet_cut_slivers',
                   return_value=[{'start': 14.03, 'end': 18.166443},
                                 {'start': 22.283058, 'end': 27.638}]) as cleanup:
            result = cut_manifest.make_manifest(str(self.source), self.ranges, self.clips,
                                               words=self.words, deleted_indices=[1])
            self.assertEqual(result['segments'][1]['editStartUs'], 4136443)
            self.assertEqual(result['segments'][1]['globalSourceStartUs'], 22283058)
            self.assertEqual(result['durationUs'], 9491385)
            self.assertEqual(cleanup.call_args.kwargs['deleted_indices'], [1])


if __name__ == '__main__':
    unittest.main()
