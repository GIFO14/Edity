"""Unavailable speech models must not turn approximate cuts into permanent ones."""
import sys
import io
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import numpy as np
from services import speech_cut_alignment as alignment, cut_refinement, cut_manifest


class AlignmentRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.source = Path(self.directory.name) / 'source.wav'
        self.source.touch()
        self.words = [dict(word='manual', start=.9, end=1.2),
                      dict(word='vale', start=1.8, end=2.0),
                      dict(word='Luego', start=2.3, end=2.7)]
        self.keep = [dict(start=0, end=1.2), dict(start=2.3, end=3)]
        self.actual = {0: dict(start=.9, end=1.65, score=.9),
                       1: dict(start=1.8, end=2.0, score=.9),
                       2: dict(start=2.3, end=2.7, score=.9)}
        alignment.begin_alignment_pass()

    def test_degraded_refinement_is_retried_without_a_document_change(self):
        calls = []
        def align(*args):
            calls.append(args)
            if len(calls) <= 3:
                alignment._status.degraded = True
                return {}
            return self.actual
        cache = Path(self.directory.name) / 'cache.json'
        with patch.dict(cut_refinement._cache, {}, clear=True), \
                patch.object(cut_refinement, '_persistent_cache_file', return_value=cache), \
                patch.object(cut_refinement, '_audio_samples', return_value=np.full(48000, .08)), \
                patch.object(cut_refinement, 'align_words_near', side_effect=align):
            before = cut_refinement.refine_keep_segments(str(self.source), self.keep,
                words=self.words, deleted_indices=[1])
            self.assertFalse(cache.exists())
            after = cut_refinement.refine_keep_segments(str(self.source), self.keep,
                words=self.words, deleted_indices=[1])
        self.assertEqual(before[0]['end'], 1.2)
        self.assertGreaterEqual(after[0]['end'], 1.65)
        self.assertLess(after[0]['end'], 1.8)
        self.assertTrue(cache.exists())

    def test_runtime_installation_invalidates_manifest_cache(self):
        with patch.dict(cut_manifest._cache, {}, clear=True), \
                patch.object(cut_manifest, 'alignment_runtime_signature', side_effect=[[None], ['installed']]), \
                patch.object(cut_manifest, 'refine_keep_segments', return_value=self.keep) as refine:
            first = cut_manifest.make_manifest(str(self.source), self.keep)
            second = cut_manifest.make_manifest(str(self.source), self.keep)
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(refine.call_count, 2)

    def test_manifest_does_not_hide_a_degraded_refinement(self):
        def refine(*args, **kwargs):
            alignment._status.degraded = True
            return self.keep
        with patch.dict(cut_manifest._cache, {}, clear=True), \
                patch.object(cut_manifest, 'refine_keep_segments', side_effect=refine) as call:
            for _ in range(2):
                cut_manifest.make_manifest(str(self.source), self.keep)
        self.assertEqual(call.call_count, 2)

    def test_failed_download_can_recover_in_the_same_process(self):
        loader = unittest.mock.Mock(side_effect=[RuntimeError('offline'), ('model', {})])
        module = SimpleNamespace(load_align_model=loader)
        with patch.dict(sys.modules, whisperx=module), \
                patch.dict(alignment._models, {}, clear=True), \
                patch.dict(alignment._unavailable_models, {}, clear=True), \
                patch.object(alignment.time, 'monotonic', side_effect=[0, 0, 30, 61]):
            with self.assertRaises(RuntimeError):
                alignment._model('es', 'cuda')
            with self.assertRaises(RuntimeError):
                alignment._model('es', 'cuda')
            self.assertEqual(alignment._model('es', 'cuda'), ('model', {}))
        self.assertEqual(loader.call_count, 2)

    def test_import_preflight_loads_the_requested_language(self):
        torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True))
        with patch.dict(sys.modules, torch=torch, whisperx=SimpleNamespace()), \
                patch.object(alignment, '_model', return_value=('model', {})) as load:
            result = alignment.require_alignment_runtime('es')
        load.assert_called_once_with('es', 'cuda')
        self.assertEqual(result['status'], 'ready')
        self.assertEqual(result['device'], 'cuda')

    def test_preflight_can_use_a_working_cpu_aligner(self):
        torch = SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True))
        with patch.dict(sys.modules, torch=torch, whisperx=SimpleNamespace()), \
                patch.object(alignment, '_model', side_effect=[RuntimeError('GPU unavailable'), ('cpu', {})]):
            self.assertEqual(alignment.require_alignment_runtime('es')['device'], 'cpu')

    def test_import_does_not_run_asr_with_a_missing_boundary_aligner(self):
        import job_worker
        request = {'kind':'transcribe','payload':{'path':'unused.wav','engine':'crisper','language':'es'}}
        with patch.object(sys, 'stdin', io.StringIO(json.dumps(request))), \
                patch.object(job_worker, 'emit'), \
                patch.object(alignment, 'require_alignment_runtime', side_effect=RuntimeError('aligner missing')), \
                patch('services.verbatim_transcription.transcribe_verbatim') as transcribe:
            with self.assertRaisesRegex(RuntimeError, 'aligner missing'):
                job_worker.main()
        transcribe.assert_not_called()


if __name__ == '__main__':
    unittest.main()
