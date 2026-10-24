import unittest
import numpy as np
from services.audio_gaps import audible_gaps
from services.audio_gaps import review_audible_gaps


class AudioGapTests(unittest.TestCase):
    def test_flags_audible_untranscribed_audio_without_removing_or_overlapping_words(self):
        samples = np.zeros(48000, dtype=np.float32)
        samples[16000:19200] = .1
        events = audible_gaps(samples, 16000, [{'start': 0, 'end': .8}, {'start': 1.4, 'end': 3}])
        self.assertEqual(len(events), 1)
        event = events[0]
        self.assertEqual(event['source'], 'acoustic')
        self.assertFalse(event['markedForRemoval'])
        self.assertEqual((event['start'], event['end']), (1, 1.2))

    def test_silence_and_noise_floor_are_not_new_sound_marks(self):
        self.assertEqual(audible_gaps(np.full(32000, .001), 16000, [{'start': 0, 'end': .5}, {'start': 1.5, 'end': 2}]), [])

    def test_indexed_words_and_very_short_gaps_are_preserved(self):
        samples = np.full(32000, .1)
        self.assertEqual(audible_gaps(samples, 16000, [{'start': 0, 'end': .9}, {'start': 1, 'end': 2}]), [])

    def test_word_tail_activity_is_not_an_additional_sound(self):
        samples = np.zeros(32000, dtype=np.float32)
        samples[8000:17280] = .1
        words = [{'start': .4, 'end': .8}, {'start': 1.2, 'end': 1.8}]
        self.assertEqual(audible_gaps(samples, 16000, words), [])

    def test_long_unexplained_passage_remains_reviewable(self):
        samples = np.zeros(64000, dtype=np.float32)
        samples[16000:48000] = .1
        self.assertTrue(audible_gaps(samples,16000,[{'start':0,'end':1},{'start':3,'end':4}]))

    def test_confident_known_word_alignment_suppresses_false_gap_without_changing_words(self):
        samples = np.zeros(48000, dtype=np.float32)
        samples[16000:19200] = .1
        words = [{'word':'a','start':0,'end':.8}, {'word':'b','start':1.4,'end':3}]
        align = lambda *args: {1:{'start':1,'end':1.2,'score':.9}}
        self.assertEqual(review_audible_gaps(samples,16000,words,aligner=align), [])
        self.assertEqual(words[1]['start'],1.4)
        for score in (0, .6):
            align = lambda *args: {1:{'start':1,'end':1.2,'score':score}}
            self.assertEqual(len(review_audible_gaps(samples,16000,words,aligner=align)),1)

    def test_disjoint_aligned_words_do_not_hide_sound_between_them(self):
        samples = np.zeros(48000, dtype=np.float32)
        samples[16000:19200] = .1
        words = [{'start':0,'end':.8},{'start':1.4,'end':3}]
        align = lambda *args: {0:{'start':0,'end':.8,'score':.9},1:{'start':1.4,'end':3,'score':.9}}
        self.assertEqual(len(review_audible_gaps(samples,16000,words,aligner=align)),1)
