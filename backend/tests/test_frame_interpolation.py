import hashlib
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from services import frame_interpolation as motion

class FrameInterpolationTests(unittest.TestCase):
    def test_fallback_cache_source_safety_and_disabled_rate(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=0.5','-c:v','libx264','-preset','ultrafast',str(source)],check=True,capture_output=True)
            original=hashlib.sha256(source.read_bytes()).digest();popen=motion.subprocess.Popen
            def no_gpu(command,*args,**kwargs):
                if 'h264_nvenc' in command:command=[c if c!='h264_nvenc' else 'missing_encoder_for_test' for c in command]
                return popen(command,*args,**kwargs)
            with patch.object(motion.subprocess,'Popen',side_effect=no_gpu):result=motion.interpolate_video(source,root/'cache')
            self.assertEqual(result['encoder'],'libx264');self.assertEqual(result['output']['packetCount'],30)
            self.assertTrue(motion.interpolate_video(source,root/'cache')['cached'])
            self.assertFalse(motion.interpolate_video(source,root/'cache',enabled=False)['applied'])
            self.assertFalse(motion.interpolate_video(result['output_path'],root/'cache')['applied'])
            self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),original)
            self.assertFalse(list((root/'cache').glob('*.partial.mp4')))

    def test_failed_encoder_never_publishes_completed_video(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=size=160x90:rate=30:duration=0.5','-c:v','libx264',str(source)],check=True,capture_output=True)
            popen=motion.subprocess.Popen
            def failed(command,*args,**kwargs):
                if command[0]=='ffmpeg':command=[c if c not in ('h264_nvenc','libx264') else 'missing_encoder_for_test' for c in command]
                return popen(command,*args,**kwargs)
            with patch.object(motion.subprocess,'Popen',side_effect=failed):
                with self.assertRaisesRegex(RuntimeError,'Motion interpolation failed'):motion.interpolate_video(source,root/'cache')
            self.assertFalse(list((root/'cache').glob('*60fps.mp4')));self.assertFalse(list((root/'cache').glob('*.json')))

if __name__=='__main__':unittest.main()
