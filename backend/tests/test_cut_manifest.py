import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from concurrent.futures import ThreadPoolExecutor
from services import cut_manifest

class CutManifestTests(unittest.TestCase):
    def setUp(self):
        self.directory=tempfile.TemporaryDirectory();self.addCleanup(self.directory.cleanup)
        self.video=Path(self.directory.name)/'video.mp4';self.video.write_bytes(b'fixture')
    def test_refinement_is_shared_immutable_and_splits_clip_boundaries(self):
        keep=[{'start':0,'end':1},{'start':2,'end':4}]
        clips=[{'id':'first','start':0,'duration':3},{'id':'second','start':3,'duration':1}]
        with patch.dict(cut_manifest._cache,{},clear=True),patch('services.cut_manifest.refine_keep_segments',return_value=keep) as refine:
            with ThreadPoolExecutor(max_workers=3) as executor:
                results=list(executor.map(lambda _:cut_manifest.make_manifest(str(self.video),keep,clips),range(3)))
            self.assertEqual(refine.call_count,1)
            self.assertEqual(results[0]['durationUs'],3_000_000)
            self.assertEqual(results[0]['segments'][-1]['sourceStartUs'],0)
            self.assertEqual(results[0]['segments'][-1]['editStartUs'],2_000_000)
            results[0]['segments'].clear()
            self.assertEqual(len(cut_manifest.make_manifest(str(self.video),keep,clips)['segments']),3)
    def test_words_locks_and_video_revision_invalidate_the_manifest(self):
        keep=[{'start':0,'end':1},{'start':2,'end':3}]
        with patch.dict(cut_manifest._cache,{},clear=True),patch('services.cut_manifest.refine_keep_segments',return_value=keep) as refine:
            first=cut_manifest.make_manifest(str(self.video),keep,words=[])
            second=cut_manifest.make_manifest(str(self.video),keep,words=[{'word':'before'}],locked_entrance_indices=[1])
            self.assertNotEqual(first['id'],second['id']);self.assertEqual(refine.call_count,2)
    def test_empty_edit_has_zero_duration(self):
        result=cut_manifest.make_manifest(str(self.video),[])
        self.assertEqual(result['durationUs'],0);self.assertEqual(result['segments'],[])

if __name__=='__main__':unittest.main()
