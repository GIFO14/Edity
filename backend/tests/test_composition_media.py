import json
import tempfile
import unittest
import wave
from pathlib import Path
import numpy as np
from services.asset_preparation import prepare,frame
from services.composition_audio import render_audio

FIXTURES=Path(__file__).resolve().parents[2]/'tests'/'fixtures'/'composition'
class CompositionMediaTests(unittest.TestCase):
    def test_probe_and_rgba_preserve_transparency(self):
        png=prepare(FIXTURES/'alpha.png','image');video=prepare(FIXTURES/'alpha.mov','video')
        self.assertTrue(png['hasAlpha']);self.assertTrue(video['hasAlpha']);self.assertEqual(video['width'],240)
        pixels=np.frombuffer(frame(str(FIXTURES/'alpha.mov'),0,240,140),np.uint8).reshape(140,240,4)
        self.assertEqual(int(pixels[0,0,3]),0);self.assertGreater(int(pixels[70,120,3]),100);self.assertLess(int(pixels[70,120,3]),255)

    def test_exif_image_orientation_has_a_shared_normalized_derivative(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'rotated.jpg';image=Image.new('RGB',(80,40),'red');exif=Image.Exif();exif[274]=6;image.save(source,exif=exif)
            result=prepare(source,'image');self.assertEqual((result['width'],result['height']),(40,80));self.assertEqual(result['color']['profile'],'exif-oriented-v1')
            with Image.open(result['normalizedPath']) as normalized:self.assertEqual(normalized.size,(40,80))

    def test_hdr_profile_produces_sdr_for_player_and_worker(self):
        from services.asset_preparation import run,probe
        with tempfile.TemporaryDirectory() as directory:
            source=Path(directory)/'hdr.mp4'
            run(['ffmpeg','-v','error','-y','-f','lavfi','-i','testsrc2=size=160x90:rate=30:duration=0.3','-vf','format=yuv420p10le','-c:v','libx265','-preset','ultrafast','-x265-params','pools=1:frame-threads=1:log-level=error:transfer=16:colorprim=9:colormatrix=9',str(source)])
            result=prepare(source,'video');self.assertEqual(result['color']['profile'],'hdr-hable-sdr-v1');self.assertEqual(probe(result['normalizedPath'])['streams'][0]['color_transfer'],'bt709');self.assertTrue(Path(result['previewPath']).is_file())

    def test_audio_fragments_equal_export_pcm_and_gains_do_not_normalize(self):
        asset={'path':str(FIXTURES/'music.wav'),'durationUs':2000000,'hasAudio':True}
        entry={'id':'music','assetId':'music','startUs':0,'endUs':2000000,'sourceInUs':0,'endPolicy':'loop','gainDb':-6,'mute':False,'fadeInUs':200000,'fadeOutUs':200000,'ducking':True,'bus':'music'}
        plan={'sampleRate':48000,'durationUs':2000000,'entries':[entry],'masterGainDb':0,'voiceGainDb':0,'voiceMute':False,'duckEnvelope':[{'timeUs':0,'gain':1},{'timeUs':500000,'gain':.25},{'timeUs':1500000,'gain':.25},{'timeUs':2000000,'gain':1}]}
        manifest={'keepSegments':[{'start':0,'end':2}]}
        full=render_audio(plan,{'music':asset},manifest,include_voice=False)
        parts=[render_audio(plan,{'music':asset},manifest,start_us=i*1000000,end_us=(i+1)*1000000,include_voice=False) for i in range(2)]
        def pcm(p):
            with wave.open(p,'rb') as f:self.assertEqual(f.getnframes(),int(f.getframerate()*(2 if p==full else 1)));return f.readframes(f.getnframes())
        self.assertEqual(pcm(full),b''.join(pcm(p) for p in parts))
        duplicated={**plan,'entries':[entry,{**entry,'id':'other'}]};double=render_audio(duplicated,{'music':asset},manifest,include_voice=False)
        def values(p):
            with wave.open(p,'rb') as f:b=np.frombuffer(f.readframes(f.getnframes()),np.uint8).reshape(-1,3).astype(np.int32);return (b[:,0]|b[:,1]<<8|b[:,2]<<16)^0x800000
        self.assertGreater(len(pcm(full)),100000)
        self.assertLessEqual(int(np.max(np.abs((values(double)-0x800000)-2*(values(full)-0x800000)))),1)

if __name__=='__main__':unittest.main()
