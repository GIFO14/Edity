import tempfile
import unittest
import wave
from pathlib import Path
from unittest.mock import patch
import numpy as np
from services import composition_audio as mixer, asset_preparation

class MusicFidelityTests(unittest.TestCase):
    def test_stereo_multiband_gain_and_fragment_export_parity(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);rate=48000;t=np.arange(rate*8)/rate
            left=sum(.06*np.sin(2*np.pi*f*t) for f in (80,440,3000,10000))
            right=sum(.04*np.sin(2*np.pi*f*t+.6) for f in (120,880,4000,12000))
            samples=np.column_stack((left,right));source=root/'stereo.wav'
            with wave.open(str(source),'wb') as w:
                w.setparams((2,2,rate,0,'NONE','not compressed'));w.writeframes(np.round(samples*32767).astype('<i2').tobytes())
            reference=np.round(samples*32767)/32768
            asset={'path':str(source),'durationUs':8000000,'hasAudio':True}
            entry={'id':'m','assetId':'m','startUs':0,'endUs':8000000,'sourceInUs':0,'endPolicy':'trim','gainDb':0,'mute':False,'fadeInUs':0,'fadeOutUs':0,'ducking':False,'bus':'music'}
            plan={'sampleRate':rate,'durationUs':8000000,'entries':[entry],'masterGainDb':0,'voiceGainDb':0,'voiceMute':False,'duckEnvelope':[{'timeUs':0,'gain':.25},{'timeUs':2000000,'gain':.25},{'timeUs':2500000,'gain':1}]}
            def read(file):
                with wave.open(file,'rb') as w:
                    raw=np.frombuffer(w.readframes(w.getnframes()),np.uint8).reshape(-1,3).astype(np.int32)
                    values=raw[:,0]|raw[:,1]<<8|raw[:,2]<<16
                    return ((values^0x800000)-0x800000).reshape(-1,2)/8388608
            with patch.object(mixer,'CACHE',root/'cache'),patch.object(asset_preparation,'CACHE',root/'cache'):
                for db in (0,-6,-15,-30):
                    entry['gainDb']=db;file=mixer.render_audio(plan,{'m':asset},{'keepSegments':[]},include_voice=False)
                    result=read(file);expected=reference*10**(db/20)
                    self.assertLess(float(np.max(np.abs(result-expected))),1.3e-7,f'{db}dB preserves both channels and every frequency')
                    if db==-15:
                        fragments=[mixer.render_audio(plan,{'m':asset},{'keepSegments':[]},start_us=a,end_us=b,include_voice=False) for a,b in ((0,6000000),(6000000,8000000))]
                        np.testing.assert_array_equal(result,np.concatenate([read(f) for f in fragments]))
                entry['gainDb']=-15;entry['ducking']=True
                ducked=read(mixer.render_audio(plan,{'m':asset},{'keepSegments':[]},include_voice=False))
                self.assertLess(float(np.max(np.abs(ducked[:rate]-reference[:rate]*10**(-15/20)*.25))),1.3e-7)

    def test_split_inside_fades_keeps_every_sample_and_loop_phase(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder);rate=48000;t=np.arange(rate*2)/rate;source=root/'loop.wav'
            with wave.open(str(source),'wb') as w:
                w.setparams((2,2,rate,0,'NONE','not compressed'))
                w.writeframes(np.round(np.column_stack((.2*np.sin(2*np.pi*213*t),.15*np.sin(2*np.pi*573*t)))*32767).astype('<i2').tobytes())
            entry=dict(id='m',assetId='m',startUs=0,endUs=6000000,sourceInUs=0,sourcePhaseUs=0,envelopePhaseUs=0,activeDurationUs=6000000,endPolicy='loop',gainDb=-8,mute=False,fadeInUs=4000000,fadeOutUs=3000000,ducking=False,bus='music')
            plan=dict(sampleRate=rate,durationUs=6000000,entries=[entry],masterGainDb=0,voiceGainDb=0,voiceMute=False,duckEnvelope=[dict(timeUs=0,gain=1)])
            asset=dict(path=str(source),durationUs=2000000,hasAudio=True)
            with patch.object(mixer,'CACHE',root/'cache'),patch.object(asset_preparation,'CACHE',root/'cache'):
                before=Path(mixer.render_audio(plan,{'m':asset},{'keepSegments':[]},include_voice=False)).read_bytes()
                plan['entries']=[{**entry,'endUs':2500000},{**entry,'id':'right','startUs':2500000,'sourcePhaseUs':2500000,'envelopePhaseUs':2500000}]
                after=Path(mixer.render_audio(plan,{'m':asset},{'keepSegments':[]},include_voice=False)).read_bytes()
                self.assertEqual(before,after)

if __name__=='__main__':unittest.main()
