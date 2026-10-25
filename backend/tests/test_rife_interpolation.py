import hashlib
import subprocess
import tempfile
import unittest
import numpy as np
from pathlib import Path
from unittest.mock import patch

from services import frame_interpolation as motion
from services import rife_interpolation as rife

class GpuInterpolationRecoveryTests(unittest.TestCase):
    def test_static_text_region_is_preserved_beside_a_moving_region(self):
        first=np.zeros((64,256,3),dtype=np.uint8);second=first.copy();second[:,128:]=255
        generated=np.full_like(first,128);protected,count=rife.protect_static(first,second,generated)
        self.assertEqual(count,1)
        self.assertTrue(np.array_equal(protected[:,:128],first[:,:128]))
        self.assertTrue(np.all(protected[:,128:]==128))
    def test_missing_runtime_falls_back_only_when_not_explicitly_required(self):
        with patch.object(rife,'runtime',return_value=None),patch.object(motion,'_interpolate_video',return_value={'engine':'ffmpeg-minterpolate-cpu'}) as cpu:
            self.assertEqual(motion.interpolate_video('unused',engine='auto')['engine'],'ffmpeg-minterpolate-cpu')
            self.assertEqual(cpu.call_count,1)
            with self.assertRaisesRegex(RuntimeError,'not installed'):motion.interpolate_video('unused',engine='gpu')
            self.assertEqual(cpu.call_count,1)

    @unittest.skipUnless(rife.runtime(),'Pinned Windows RIFE runtime is not installed')
    def test_gpu_motion_still_runs_when_only_nvenc_is_unavailable(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=0.5','-c:v','libx264',str(source)],check=True,capture_output=True)
            run=rife._run
            def no_nvenc(command,**kwargs):
                if 'h264_nvenc' in command:raise RuntimeError('Injected unavailable NVENC encoder')
                return run(command,**kwargs)
            with patch.object(rife,'_run',side_effect=no_nvenc):result=motion.interpolate_video(source,root/'cache',engine='gpu')
            self.assertEqual(result['engine'],'rife-ncnn-vulkan-gpu')
            self.assertEqual(result['encoder'],'libx264')
            self.assertEqual(result['output']['packetCount'],30)

    @unittest.skipUnless(rife.runtime(),'Pinned Windows RIFE runtime is not installed')
    def test_gpu_failure_cleans_partials_and_recovers_without_publishing_false_gpu_result(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory);source=root/'source.mp4'
            subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=0.5','-c:v','libx264',str(source)],check=True,capture_output=True)
            original=hashlib.sha256(source.read_bytes()).digest();run=rife._run
            def fail_model(command,**kwargs):
                if Path(command[0]).name=='rife-ncnn-vulkan.exe':raise RuntimeError('Injected GPU inference failure')
                return run(command,**kwargs)
            with patch.object(rife,'_run',side_effect=fail_model):
                result=motion.interpolate_video(source,root/'auto',engine='auto')
                self.assertEqual(result['engine'],'ffmpeg-minterpolate-cpu')
                self.assertIn('Injected GPU',result['gpuFallback'])
                with self.assertRaisesRegex(RuntimeError,'Injected GPU'):motion.interpolate_video(source,root/'strict',engine='gpu')
            self.assertFalse(list(root.rglob('*.partial.mp4')))
            self.assertFalse(list(root.rglob('*.partial.frames')))
            self.assertFalse(list((root/'strict').glob('*.json')))
            self.assertEqual(hashlib.sha256(source.read_bytes()).digest(),original)

if __name__=='__main__':unittest.main()
