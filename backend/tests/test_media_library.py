import json
import shutil
import subprocess
import tempfile
import time
import unittest
from pathlib import Path
from unittest.mock import patch

from services import media_library
from services.ai_provider import plan_video_edit


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg is required")
class MediaLibraryTests(unittest.TestCase):
    def test_broll_frames_are_sent_to_codex_and_cached(self):
        with tempfile.TemporaryDirectory(prefix="edity-media-test-") as directory:
            root = Path(directory)
            broll = root / "B-roll"
            broll.mkdir()
            source = broll / "demo.mp4"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
                            "testsrc2=size=320x180:rate=30", "-t", "14", "-c:v", "libx264",
                            str(source)], check=True, capture_output=True)
            cache_path = root / "index.json"
            calls = []

            def describe(*, image_paths, **_kwargs):
                self.assertEqual(len(image_paths), 2)
                self.assertTrue(all(Path(path).is_file() for path in image_paths))
                calls.append(image_paths[0])
                return "A color test pattern changes over time."

            folders = {"broll": str(broll)}
            with patch.object(media_library, "_cache_path", return_value=cache_path), \
                 patch.object(media_library.AIProvider, "complete", side_effect=describe):
                media_library.start_media_index(folders)
                for _ in range(100):
                    status = media_library.media_index_status()
                    if status["status"] != "analyzing":
                        break
                    time.sleep(0.1)
                self.assertEqual(status["status"], "ready", status)
                assets = media_library.catalog_media(folders)
                self.assertEqual(len(assets), 1)
                self.assertEqual(assets[0]["type"], "broll")
                self.assertIn("test pattern", assets[0]["description"])
                self.assertEqual(len(calls), 1)
                self.assertTrue(json.loads(cache_path.read_text(encoding="utf-8")))
                media_library.start_media_index(folders)
                for _ in range(100):
                    if media_library.media_index_status()["status"] != "analyzing":
                        break
                    time.sleep(0.1)
                self.assertEqual(len(calls), 1)

    def test_chat_resolves_only_known_local_asset_ids(self):
        asset = {"id": "asset-1", "type": "broll", "path": "C:/clips/demo.mp4", "name": "demo.mp4",
                 "duration": 8, "description": "A person typing on a keyboard"}
        answer = {"reply": "Use this clip in the introduction.", "deleteRanges": [],
                  "markForRemoval": False, "mediaIdeas": [
                      {"type": "broll", "assetId": "asset-1", "startTime": 1, "endTime": 4, "reason": "Shows the action"},
                      {"type": "broll", "assetId": "made-up", "startTime": 5, "endTime": 8, "reason": "Unknown"},
                  ]}
        with patch("services.ai_provider.AIProvider.complete", return_value=json.dumps(answer)) as complete:
            result = plan_video_edit("Add B-roll to the introduction", "", [
                {"index": 0, "word": "Welcome", "start": 0, "end": 1,
                 "exported_start": 0, "exported_end": 1}], [], media_instructions="Only in the introduction",
                media_assets=[asset])
        self.assertEqual(result["mediaIdeas"][0]["localPath"], asset["path"])
        self.assertNotIn("localPath", result["mediaIdeas"][1])
        self.assertIn("Only in the introduction", complete.call_args.kwargs["system_prompt"])


if __name__ == "__main__":
    unittest.main()
