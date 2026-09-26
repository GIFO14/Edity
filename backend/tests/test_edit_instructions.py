import json
import subprocess
import tomllib
import unittest
from unittest.mock import patch

from services.ai_provider import AIProvider, _codex_complete, plan_video_edit


class EditingInstructionsTests(unittest.TestCase):
    def test_codex_receives_defaults_separately_from_user_message(self):
        with patch("services.ai_provider.shutil.which", return_value="codex"), \
             patch("services.ai_provider.subprocess.run",
                   return_value=subprocess.CompletedProcess([], 0, stdout='{"reply":"ok"}')) as run:
            _codex_complete("Override the default for this video", "Keep the best take")

        args = run.call_args.args[0]
        configs = [args[index + 1] for index, value in enumerate(args[:-1]) if value == "-c"]
        developer = next(value for value in configs if value.startswith("developer_instructions="))
        self.assertEqual(tomllib.loads(developer)["developer_instructions"], "Keep the best take")
        self.assertEqual(run.call_args.kwargs["input"], "Override the default for this video")

    def test_global_defaults_allow_specific_chat_override(self):
        answer = {"reply": "ok", "deleteRanges": [], "mediaIdeas": [], "markForRemoval": False}
        with patch.object(AIProvider, "complete", return_value=json.dumps(answer)) as complete:
            plan_video_edit("For this one, keep both takes", "Keep only the best take",
                            [{"index": 0, "word": "hello", "start": 0, "end": 0.3}], [])

        prompt = complete.call_args.args[0]
        system = complete.call_args.kwargs["system_prompt"]
        self.assertIn("For this one, keep both takes", prompt)
        self.assertNotIn("Keep only the best take", prompt)
        self.assertIn("Keep only the best take", system)
        self.assertIn("latest message overrides conflicting defaults", system)

    def test_sound_actions_are_limited_to_detected_ids(self):
        answer = {"reply": "I marked the burp.", "deleteRanges": [], "mediaIdeas": [],
                  "markForRemoval": True, "soundEventActions": [
                      {"id": "sound-known", "action": "remove", "reason": "Accidental burp"},
                      {"id": "invented", "action": "remove", "reason": "Not in the model output"},
                  ]}
        events = [{"id": "sound-known", "label": "Burping, eructation", "start": 2.0, "end": 2.5,
                   "confidence": 0.91, "overlapsSpeech": False, "markedForRemoval": False}]
        with patch.object(AIProvider, "complete", return_value=json.dumps(answer)) as complete:
            result = plan_video_edit("Remove the burp", "", [
                {"index": 0, "word": "hello", "start": 0, "end": 0.3}], [], sound_events=events)

        self.assertEqual(result["soundEventActions"], [
            {"id": "sound-known", "action": "remove", "reason": "Accidental burp"}])
        self.assertIn("sound-known | Burping, eructation", complete.call_args.args[0])


if __name__ == "__main__":
    unittest.main()
