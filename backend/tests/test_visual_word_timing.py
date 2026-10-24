import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import numpy as np
from services import visual_word_timing as timing
from services.cut_manifest import make_manifest


class VisualWordTimingTests(unittest.TestCase):
    def test_local_decode_and_persistent_fingerprint_cache(self):
        with tempfile.TemporaryDirectory() as root, patch.dict('os.environ', {'LOCALAPPDATA': root}):
            source = Path(root)/'base.mp4'; source.write_bytes(b'test')
            words = [{'id':'a','word':'more','start':34.98,'end':35.28}, {'id':'b','word':'trustworthy','start':35.28,'end':36.02}]
            # Window origin is 31.65, actual word end 36.163.
            actual = {1:{'start':35.499-31.65,'end':36.163-31.65,'score':.81}}
            with patch.object(timing.subprocess, 'run') as decode, patch.object(timing, 'align_words_near', return_value=actual) as align:
                decode.return_value.stdout = np.zeros(128000,dtype='<f4').tobytes()
                found = timing.visual_word_timings(source,words,['b'])
                self.assertEqual(found['b']['endUs'],36163000)
                self.assertAlmostEqual(float(decode.call_args.args[0][4]),31.65)
                timing._cache.clear()
                self.assertEqual(timing.visual_word_timings(source,words,['b']),found)
                self.assertEqual(align.call_count,1)
                source.write_bytes(b'changed source')
                timing.visual_word_timings(source,words,['b'])
                self.assertEqual(align.call_count,2)

    def test_unavailable_alignment_is_explicit_and_does_not_change_audio_cuts(self):
        with tempfile.TemporaryDirectory() as root:
            source=Path(root)/'base.mp4';source.write_bytes(b'test')
            words=[{'id':'a','word':'test','start':0,'end':1}]
            with patch('services.visual_word_timing.visual_word_timings',return_value={}):
                base=make_manifest(source,[{'start':0,'end':2}],words=words)
                visual=make_manifest(source,[{'start':0,'end':2}],words=words,visual_word_ids=['a'],visual_cut_points=[1000000])
            self.assertEqual(base['inputRevision'],visual['inputRevision'])
            self.assertEqual(base['keepSegments'],visual['keepSegments'])
            self.assertEqual(visual['visualTiming']['unavailableWordIds'],['a'])
            self.assertEqual(visual['visualCutPointsUs'],[1000000])
            self.assertNotIn('wordTimings',base)


if __name__=='__main__': unittest.main()
