import asyncio
import unittest
from unittest.mock import patch

from routers.preview import EditedPreviewRequest, _manifest
from services.silence import resolve_margin


class JoinMarginTests(unittest.TestCase):
    def test_preview_resolves_the_same_margin_as_import(self):
        for preset, custom in [('personal', 0.7), ('gaming', 0.7), ('custom', 0), ('custom', 0.17)]:
            with self.subTest(preset=preset, custom=custom), patch('routers.preview.make_manifest', return_value={}) as make:
                request = EditedPreviewRequest(video_path='fixture.mp4', keep_segments=[],
                    join_silence_preset=preset, join_custom_margin=custom)
                asyncio.run(_manifest(request))
                self.assertEqual(make.call_args.kwargs['join_margin_seconds'], resolve_margin(preset, custom))

    def test_legacy_project_preserves_previous_policy(self):
        with patch('routers.preview.make_manifest', return_value={}) as make:
            asyncio.run(_manifest(EditedPreviewRequest(video_path='fixture.mp4', keep_segments=[])))
            self.assertIsNone(make.call_args.kwargs['join_margin_seconds'])

    def test_invalid_profile_is_rejected(self):
        with self.assertRaises(ValueError):
            asyncio.run(_manifest(EditedPreviewRequest(video_path='fixture.mp4', keep_segments=[], join_silence_preset='unknown')))
