import json
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest import mock

from fastapi.testclient import TestClient

from main import app
from services.preview import _cached, _fingerprint, _paths, prepare_preview, preview_status, cancel_preview


class PreviewCacheTests(unittest.TestCase):
    def test_failed_studio_preview_is_not_restarted_by_polling(self):
        with tempfile.TemporaryDirectory(prefix="edity-preview-error-") as directory:
            source = Path(directory) / "video.mp4"
            source.write_bytes(b"test video")

            def fail(_source, job, _studio):
                job.update(status="error", progress=1, error="cuDNN failure")

            with mock.patch("services.preview._prepare", side_effect=fail) as worker:
                prepare_preview(str(source), True)
                for _ in range(100):
                    if preview_status(str(source), True)["status"] == "error":
                        break
                    time.sleep(0.01)
                repeated = prepare_preview(str(source), True)
            self.assertEqual(repeated["status"], "error")
            self.assertEqual(repeated["error"], "cuDNN failure")
            worker.assert_called_once()

    def test_media_endpoint_supports_byte_ranges(self):
        with tempfile.TemporaryDirectory(prefix="edity-range-test-") as directory:
            source = Path(directory) / "video.mp4"
            source.write_bytes(b"0123456789")
            with TestClient(app) as client:
                response = client.get("/file", params={"path": str(source)},
                                      headers={"Range": "bytes=3-5"})
            self.assertEqual(response.status_code, 206)
            self.assertEqual(response.content, b"345")
            self.assertEqual(response.headers["content-range"], "bytes 3-5/10")

    def test_preview_paths_cannot_overwrite_the_source(self):
        source = Path("C:/Projects/video.mp4")
        output, metadata, temporary = _paths(source)
        self.assertEqual(output.name, "video.edity-preview.mp4")
        self.assertEqual(metadata.name, "video.edity-preview.json")
        self.assertEqual(temporary.name, "video.edity-preview.tmp.mp4")
        self.assertEqual(len({source, output, metadata, temporary}), 4)
        studio_output, studio_metadata, studio_temporary = _paths(source, True)
        self.assertEqual(studio_output.name, "video.edity-preview-studio.mp4")
        self.assertEqual(studio_metadata.name, "video.edity-preview-studio.json")
        self.assertEqual(studio_temporary.name, "video.edity-preview-studio.tmp.mp4")
        self.assertTrue({studio_output, studio_metadata, studio_temporary}.isdisjoint(
            {source, output, metadata, temporary}))

    def test_cache_invalidates_when_source_changes(self):
        with tempfile.TemporaryDirectory(prefix="edity-preview-test-") as directory:
            source = Path(directory) / "video.mp4"
            source.write_bytes(b"source")
            output, metadata, _ = _paths(source)
            output.write_bytes(b"preview")
            metadata.write_text(json.dumps(_fingerprint(source)), encoding="utf-8")
            self.assertEqual(_cached(source), output)
            source.write_bytes(b"source updated")
            self.assertIsNone(_cached(source))

    def test_studio_sound_cache_is_separate_from_normal_preview(self):
        with tempfile.TemporaryDirectory(prefix="edity-preview-studio-test-") as directory:
            source = Path(directory) / "video.mp4"
            source.write_bytes(b"source")
            normal, normal_metadata, _ = _paths(source)
            studio, studio_metadata, _ = _paths(source, True)
            normal.write_bytes(b"normal")
            studio.write_bytes(b"studio")
            normal_metadata.write_text(json.dumps(_fingerprint(source)), encoding="utf-8")
            studio_metadata.write_text(json.dumps(_fingerprint(source, True)), encoding="utf-8")
            self.assertEqual(_cached(source), normal)
            self.assertEqual(_cached(source, True), studio)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
    def test_studio_sound_preview_replaces_the_audio_track(self):
        with tempfile.TemporaryDirectory(prefix="edity-preview-studio-test-") as directory:
            source = Path(directory) / "video.mp4"
            subprocess.run([
                "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                "testsrc2=size=320x180:rate=30", "-f", "lavfi", "-i",
                "sine=frequency=440:sample_rate=48000", "-t", "1", "-ac", "2",
                "-c:v", "libx264", "-c:a", "aac", "-shortest", str(source),
            ], check=True, capture_output=True)

            def clean_to_mono(input_path: str, output_path: str, on_progress=None) -> str:
                subprocess.run([
                    "ffmpeg", "-v", "error", "-y", "-i", input_path, "-vn", "-ac", "1",
                    "-c:a", "pcm_s16le", output_path,
                ], check=True, capture_output=True)
                if on_progress:
                    on_progress(100)
                return output_path

            with mock.patch("services.audio_cleaner.clean_audio", side_effect=clean_to_mono):
                prepare_preview(str(source), True)
                deadline = time.monotonic() + 30
                while time.monotonic() < deadline:
                    status = preview_status(str(source), True)
                    if status["status"] != "preparing":
                        break
                    time.sleep(0.1)
                else:
                    cancel_preview(str(source), True)
                    self.fail("Studio Sound preview generation timed out")

            self.assertEqual(status["status"], "ready", status.get("error"))
            self.assertIn("edity-preview-studio", status["path"])
            channels = subprocess.check_output([
                "ffprobe", "-v", "error", "-select_streams", "a:0", "-show_entries",
                "stream=channels", "-of", "default=noprint_wrappers=1:nokey=1", status["path"],
            ], text=True).strip()
            self.assertEqual(channels, "1")

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
    def test_generated_preview_has_frequent_keyframes_and_preserves_source(self):
        with tempfile.TemporaryDirectory(prefix="edity-preview-test-") as directory:
            source = Path(directory) / "video.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                            "testsrc2=size=640x360:rate=30", "-t", "2", "-c:v", "libx264",
                            "-g", "120", str(source)], check=True, capture_output=True)
            original = source.read_bytes()
            prepare_preview(str(source))
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                status = preview_status(str(source))
                if status["status"] != "preparing":
                    break
                time.sleep(0.1)
            else:
                cancel_preview(str(source))
                self.fail("Preview generation timed out")
            self.assertEqual(status["status"], "ready", status.get("error"))
            self.assertEqual(source.read_bytes(), original)
            preview = Path(status["path"])
            self.assertNotEqual(preview, source)
            keyframes = subprocess.check_output([
                "ffprobe", "-v", "error", "-skip_frame", "nokey", "-select_streams", "v:0",
                "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", str(preview),
            ], text=True).splitlines()
            self.assertGreaterEqual(len(keyframes), 3)


if __name__ == "__main__":
    unittest.main()
