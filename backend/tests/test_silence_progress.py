import unittest

from services.silence import _progress_event


class SilenceProgressTests(unittest.TestCase):
    def test_machine_progress_maps_each_auto_editor_phase(self):
        analysis = _progress_event("Analyzing audio volume~50~100~1~2")
        audio = _progress_event("Creating new audio~50~100~1~2")
        video = _progress_event("Creating new video~50~100~1~2")

        self.assertEqual(analysis["phase_progress"], 50)
        self.assertEqual(analysis["progress"], 12)
        self.assertEqual(audio["progress"], 37)
        self.assertEqual(video["progress"], 70)

    def test_invalid_output_is_ignored(self):
        self.assertIsNone(_progress_event("ordinary log line"))


if __name__ == "__main__":
    unittest.main()
