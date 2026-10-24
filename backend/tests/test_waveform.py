import tempfile
import unittest
import wave
from pathlib import Path
import numpy as np
from services.waveform import waveform

class WaveformTests(unittest.TestCase):
    def test_full_band_antiphase_stereo_and_visible_window(self):
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/'antiphase.wav';t=np.arange(96000)/48000
            audio=.7*np.sin(2*np.pi*8000*t);audio[:24000]=0
            with wave.open(str(path),'wb') as f:
                f.setparams((2,2,48000,0,'NONE','not compressed'));f.writeframes((np.column_stack([audio,-audio])*32767).astype('<i2').tobytes())
            s=path.stat();data=waveform(str(path),s.st_mtime_ns,s.st_size,0,2000000,100)
            self.assertTrue(all(p==0 for p in data['peaks'][:24]))
            self.assertGreater(max(data['peaks']),.5)
            zoom=waveform(str(path),s.st_mtime_ns,s.st_size,1000000,1100000,100)
            self.assertEqual(zoom['startUs'],1000000);self.assertLessEqual(zoom['binUs'],1100);self.assertGreater(min(zoom['peaks']),.5)

if __name__=='__main__':unittest.main()
