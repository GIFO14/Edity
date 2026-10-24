import json
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from routers.ai import router
from services import ai_settings
from services.ai_provider import AIProvider, _codex_complete, codex_cli_status


class AIModelSettingsTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.settings_file = Path(self.directory.name) / "ai-settings.json"
        self.path_patch = patch("services.ai_settings._settings_path", return_value=self.settings_file)
        self.path_patch.start()
        self.addCleanup(self.path_patch.stop)

    def test_selection_persists_and_automatic_clears_it(self):
        ai_settings.save_ai_model(" gpt-6-luna ")
        self.assertEqual(ai_settings.read_ai_settings()["model"], "gpt-6-luna")
        self.assertEqual(json.loads(self.settings_file.read_text())["model"], "gpt-6-luna")
        ai_settings.save_ai_model("")
        self.assertEqual(ai_settings.read_ai_settings()["model"], "")

    def test_global_selection_reaches_cli_and_records_actual_model(self):
        ai_settings.save_ai_model("gpt-6-luna")
        result = subprocess.CompletedProcess([], 0, "OK", "model: gpt-6-luna\n")
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=result) as run:
            self.assertEqual(AIProvider.complete("hello"), "OK")
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--model") + 1], "gpt-6-luna")
        self.assertIn("--ignore-user-config", command)
        self.assertEqual(ai_settings.read_ai_settings()["last_used_model"], "gpt-6-luna")

    def test_explicit_request_model_overrides_global_without_changing_it(self):
        ai_settings.save_ai_model("gpt-6-luna")
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=subprocess.CompletedProcess([], 0, "OK", "")) as run:
            AIProvider.complete("hello", model="gpt-6-astra")
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--model") + 1], "gpt-6-astra")
        self.assertEqual(ai_settings.read_ai_settings()["model"], "gpt-6-luna")

    def test_automatic_does_not_force_a_model(self):
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=subprocess.CompletedProcess([], 0, "OK", "model: gpt-6.1-sol\n")) as run:
            _codex_complete("hello", None)
        self.assertNotIn("--model", run.call_args.args[0])
        self.assertEqual(ai_settings.read_ai_settings()["last_used_model"], "gpt-6.1-sol")

    def test_catalog_excludes_hidden_entries(self):
        payload = {"models": [{"slug": "visible", "display_name": "Visible", "visibility": "list", "priority": 1,
                               "default_reasoning_level": "low", "supported_reasoning_levels": [
                                   {"effort": "low", "description": "Quick"}, {"effort": "medium", "description": "Balanced"}]},
                              {"slug": "hidden", "visibility": "hide"}]}
        with patch.dict(ai_settings._catalog, {}, clear=True), \
                patch("services.ai_settings.subprocess.run", return_value=subprocess.CompletedProcess([], 0, json.dumps(payload), "")):
            result = ai_settings.codex_model_catalog("codex.exe")
        self.assertEqual(result["models"], [{"id": "visible", "name": "Visible", "default_effort": "low",
                                            "effort_levels": [{"id": "low", "description": "Quick"},
                                                              {"id": "medium", "description": "Balanced"}]}])

    def test_effort_persists_and_reaches_every_cli_request(self):
        ai_settings.save_ai_model("gpt-6-luna", "high")
        self.assertEqual(ai_settings.read_ai_settings()["reasoning_effort"], "high")
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=subprocess.CompletedProcess([], 0, "OK", "")) as run:
            AIProvider.complete("hello")
            self.assertIn('model_reasoning_effort="high"', run.call_args.args[0])
            AIProvider.complete("hello", model="gpt-6-astra")
            self.assertIn('model_reasoning_effort="high"', run.call_args.args[0])

    def test_automatic_effort_does_not_override_cli_default(self):
        ai_settings.save_ai_model("gpt-6-luna", "")
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=subprocess.CompletedProcess([], 0, "OK", "")) as run:
            _codex_complete("hello", None)
        self.assertFalse(any("model_reasoning_effort" in argument for argument in run.call_args.args[0]))

    def test_existing_preferences_keep_previous_medium_effort(self):
        self.settings_file.write_text(json.dumps({"model": "gpt-6-luna"}), encoding="utf-8")
        self.assertEqual(ai_settings.read_ai_settings()["reasoning_effort"], "medium")
        ai_settings.save_ai_model("gpt-6-astra")
        self.assertEqual(ai_settings.read_ai_settings()["reasoning_effort"], "medium")

    def test_catalog_refresh_bypasses_cache_and_expired_cache_reloads(self):
        responses = [subprocess.CompletedProcess([], 0, json.dumps({"models": [
            {"slug": model, "visibility": "list"}]}), "") for model in ["first", "second", "third"]]
        with patch.dict(ai_settings._catalog, {}, clear=True), \
                patch("services.ai_settings.time.monotonic", return_value=0), \
                patch("services.ai_settings.subprocess.run", side_effect=responses) as run:
            self.assertEqual(ai_settings.codex_model_catalog("codex.exe")["models"][0]["id"], "first")
            self.assertEqual(ai_settings.codex_model_catalog("codex.exe")["models"][0]["id"], "first")
            self.assertEqual(run.call_count, 1)
            self.assertEqual(ai_settings.codex_model_catalog("codex.exe", refresh=True)["models"][0]["id"], "second")
            with patch("services.ai_settings.time.monotonic", return_value=301):
                self.assertEqual(ai_settings.codex_model_catalog("codex.exe")["models"][0]["id"], "third")

    def test_settings_api_validates_effort_against_model_and_refreshes_catalog(self):
        app = FastAPI()
        app.include_router(router)
        catalog = {"models": [{"id": "limited", "name": "Limited", "default_effort": "low",
                               "effort_levels": [{"id": "low", "description": "Quick"}]}], "catalog_error": ""}
        with TestClient(app) as client, \
                patch("routers.ai._find_codex_cli", return_value="codex.exe"), \
                patch("routers.ai.codex_model_catalog", return_value=catalog) as fetch:
            self.assertEqual(client.get("/ai/settings?refresh=true").status_code, 200)
            fetch.assert_called_with("codex.exe", True)
            self.assertEqual(client.put("/ai/settings", json={"model": "limited", "reasoning_effort": "ultra"}).status_code, 422)
            self.assertEqual(client.put("/ai/settings", json={"model": "limited", "reasoning_effort": "bad\"level"}).status_code, 422)
            response = client.put("/ai/settings", json={"model": "limited", "reasoning_effort": "low"})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["reasoning_effort"], "low")
            self.assertEqual(client.get("/ai/settings").json()["reasoning_effort"], "low")
            self.assertEqual(client.put("/ai/settings", json={"model": "limited", "reasoning_effort": ""}).status_code, 200)

    def test_unsupported_effort_error_points_to_settings(self):
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=subprocess.CompletedProcess([], 1, "", "Unsupported reasoning_effort")):
            with self.assertRaisesRegex(RuntimeError, "effort level.*Settings"):
                _codex_complete("hello", None)

    def test_connection_test_uses_global_selection(self):
        ai_settings.save_ai_model("gpt-6-luna", "high")
        responses = [subprocess.CompletedProcess([], 0, "codex 0.159.0", ""),
                     subprocess.CompletedProcess([], 0, "Logged in using ChatGPT", ""),
                     subprocess.CompletedProcess([], 0, "OK", "model: gpt-6-luna\n")]
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", side_effect=responses) as run:
            self.assertTrue(codex_cli_status(True)["connection_ok"])
        command = run.call_args.args[0]
        self.assertEqual(command[command.index("--model") + 1], "gpt-6-luna")
        self.assertIn('model_reasoning_effort="high"', command)

    def test_bad_model_is_rejected_and_unavailable_model_has_actionable_error(self):
        with self.assertRaises(ValueError):
            ai_settings.save_ai_model("--bad model")
        with patch("services.ai_provider._find_codex_cli", return_value="codex.exe"), \
                patch("services.ai_provider.subprocess.run", return_value=subprocess.CompletedProcess([], 1, "", "unknown model")):
            with self.assertRaisesRegex(RuntimeError, "Choose another model in Settings"):
                _codex_complete("hello", None, model="unknown")


if __name__ == "__main__":
    unittest.main()
