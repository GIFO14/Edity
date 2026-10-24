import tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from services.cut_manifest import make_manifest
class NarrationManifest(unittest.TestCase):
    def test_narration_reorders_kept_source_after_chronological_acoustic_refinement(self):
        with tempfile.TemporaryDirectory() as temporary:
            file=Path(temporary)/'source.mp4';file.write_bytes(b'fixture');clips=[{'id':'clip','start':0,'duration':3}]
            order={'version':1,'order':[{'id':'b','clipId':'clip','startUs':1000000,'endUs':2000000,'memberWordIds':['b']},{'id':'a','clipId':'clip','startUs':0,'endUs':1000000,'memberWordIds':['a']},{'id':'c','clipId':'clip','startUs':2000000,'endUs':3000000,'memberWordIds':['c']}],'parked':[],'cutClipboard':[]}
            keep=[{'start':0,'end':1.5},{'start':1.8,'end':3}]
            with patch('services.cut_manifest.refine_keep_segments',return_value=keep) as refine:
                m=make_manifest(str(file),keep,clips,narration_order=order)
                self.assertEqual(refine.call_args.args[1],keep)
            self.assertEqual(m['keepSegments'],[{'start':1.,'end':1.5},{'start':1.8,'end':2.},{'start':0.,'end':1.},{'start':2.,'end':3.}]);self.assertEqual(m['durationUs'],2700000)
            self.assertEqual(m['segments'][2]['globalSourceStartUs'],0);self.assertEqual(m['segments'][2]['narrationFragmentId'],'a')
