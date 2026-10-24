import shutil
import struct
import tempfile
import unittest
import wave
from pathlib import Path

from services.playback_audio import prepare_playback_audio


@unittest.skipUnless(shutil.which("ffmpeg"), "FFmpeg required")
class PlaybackAudioTests(unittest.TestCase):
    def test_preview_audio_has_sample_aligned_pcm_timeline(self):
        with tempfile.TemporaryDirectory(prefix="edity-playback-audio-") as directory:
            source = Path(directory) / "speech.wav"
            with wave.open(str(source), "wb") as output:
                output.setnchannels(1)
                output.setsampwidth(2)
                output.setframerate(24000)
                output.writeframes(struct.pack("<24000h", *([1200] * 24000)))
            result = prepare_playback_audio(str(source))
            track = Path(result["path"])
            self.assertEqual(track.suffix, ".wav")
            with wave.open(str(track), "rb") as playback:
                self.assertEqual(playback.getframerate(), 24000)
                self.assertEqual(playback.getnframes(), 24000)


if __name__ == "__main__":
    unittest.main()
