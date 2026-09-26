import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from services import audio_cleaner


class AudioCleanerTests(unittest.TestCase):
    def test_deepfilter_decodes_video_audio_through_ffmpeg(self):
        with tempfile.TemporaryDirectory(prefix="edity-audio-test-") as directory:
            source = Path(directory) / "source.mp4"
            output = Path(directory) / "cleaned.wav"
            source.write_bytes(b"video placeholder")
            state = MagicMock()
            state.sr.return_value = 48000

            def fake_run(command, **_kwargs):
                Path(command[-1]).write_bytes(b"decoded wav")
                return MagicMock(returncode=0, stderr="")

            with patch.object(audio_cleaner, "_init_deepfilter", return_value=("model", state)), \
                 patch.object(audio_cleaner.subprocess, "run", side_effect=fake_run) as run, \
                 patch.object(audio_cleaner, "load_audio", return_value=("audio", "info"), create=True) as load, \
                 patch.object(audio_cleaner, "enhance", return_value="enhanced", create=True), \
                 patch.object(audio_cleaner, "save_audio", create=True) as save:
                result = audio_cleaner._clean_with_deepfilter(str(source), str(output))

            command = run.call_args.args[0]
            self.assertIn("-vn", command)
            self.assertIn(str(source), command)
            self.assertTrue(load.call_args.args[0].endswith("speech.wav"))
            save.assert_called_once_with(str(output), "enhanced", sr=48000)
            self.assertEqual(result, str(output))

    def test_default_output_is_wav_and_never_overwrites_source(self):
        with tempfile.TemporaryDirectory(prefix="edity-audio-test-") as directory:
            source = Path(directory) / "source.mp4"
            source.write_bytes(b"video placeholder")
            with patch.object(audio_cleaner, "DEEPFILTER_AVAILABLE", False), \
                 patch.object(audio_cleaner, "_clean_with_ffmpeg", side_effect=lambda _source, output: output):
                output = audio_cleaner.clean_audio(str(source))
            self.assertTrue(output.endswith("source_clean.wav"))
            with self.assertRaises(ValueError):
                audio_cleaner.clean_audio(str(source), str(source))


if __name__ == "__main__":
    unittest.main()
