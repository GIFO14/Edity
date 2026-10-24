import tempfile,unittest,wave
from pathlib import Path
from unittest.mock import patch
import numpy as np
from services.composition_audio import render_audio
class SpeechAudioPhase(unittest.TestCase):
    def test_source_phase_continues_after_foreign_gap_without_restarting_audio(self):
        with tempfile.TemporaryDirectory() as temporary:
            root=Path(temporary);source=root/'source.wav';rate=48000
            with wave.open(str(source),'wb') as f:
                f.setnchannels(2);f.setsampwidth(2);f.setframerate(rate);values=np.concatenate([np.full(rate,3000,dtype='<i2'),np.full(rate,9000,dtype='<i2')]);f.writeframes(np.repeat(values[:,None],2,axis=1).tobytes())
            common={'assetId':'audio','gainDb':0,'mute':False,'fadeInUs':0,'fadeOutUs':0,'ducking':False,'bus':'supplemental','sourceInUs':0,'activeDurationUs':2000000,'endPolicy':'hold'}
            plan={'sampleRate':48000,'durationUs':4000000,'masterGainDb':0,'voiceGainDb':0,'voiceMute':True,'duckEnvelope':[{'timeUs':0,'gain':1}],
                  'entries':[{**common,'id':'first','startUs':0,'endUs':1000000,'sourcePhaseUs':0},{**common,'id':'second','startUs':3000000,'endUs':4000000,'sourcePhaseUs':1000000}]}
            assets={'audio':{'path':str(source),'hash':'qa','durationUs':2000000,'hasAudio':True}}
            with patch('services.composition_audio.CACHE',root/'cache'):
                output=render_audio(plan,assets,{},include_voice=False)
            with wave.open(output,'rb') as f:raw=np.frombuffer(f.readframes(f.getnframes()),dtype=np.uint8).reshape(-1,3)
            values=raw[:,0].astype(np.int32)|(raw[:,1].astype(np.int32)<<8)|(raw[:,2].astype(np.int32)<<16);values=np.where(values&0x800000,values-0x1000000,values).reshape(-1,2)/8388607
            self.assertLess(np.max(np.abs(values[rate:3*rate])),.0001)
            self.assertAlmostEqual(float(values[rate//2,0]),3000/32768,places=3)
            self.assertAlmostEqual(float(values[3*rate+rate//2,0]),9000/32768,places=3)
