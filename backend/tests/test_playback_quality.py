import hashlib
import json
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from services.preview import prepare_preview, preview_status, _paths
from services.asset_preparation import frames


class PlaybackQualityTests(unittest.TestCase):
    def test_real_resolution_variants_and_raw_frames(self):
        with tempfile.TemporaryDirectory(prefix='edity-quality-') as directory:
            source=Path(directory)/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=1920x1080:rate=30','-t','0.5','-c:v','libx264','-preset','ultrafast',str(source)],check=True,capture_output=True)
            original=hashlib.sha256(source.read_bytes()).hexdigest()
            paths=set()
            for height in (360,480,720,1080):
                prepare_preview(str(source),max_height=height)
                end=time.monotonic()+30
                while time.monotonic()<end:
                    result=preview_status(str(source),max_height=height)
                    if result['status']!='preparing':break
                    time.sleep(.05)
                self.assertEqual(result['status'],'ready',result)
                paths.add(result['path'])
                info=json.loads(subprocess.check_output(['ffprobe','-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',result['path']]))['streams'][0]
                self.assertEqual(info['height'],height)
                self.assertAlmostEqual(info['width']/height,16/9,delta=.005)
            self.assertEqual(len(paths),4)
            raw=frames(str(source),0,1920,1080,count=1)
            self.assertEqual(len(raw),1920*1080*4)
            self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(),original)

    def test_quality_paths_do_not_collide(self):
        paths=[p for h in (360,480,720,1080) for studio in (False,True) for p in _paths(Path('video.mp4'),studio,h)]
        self.assertEqual(len(paths),len(set(paths)))

if __name__=='__main__':unittest.main()
