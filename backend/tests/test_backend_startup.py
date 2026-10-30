"""Opening the editor must not initialize optional processing engines."""
import subprocess
import sys
import unittest
from pathlib import Path


class BackendStartupTests(unittest.TestCase):
    def test_health_and_routes_without_loading_transcription_or_moviepy(self):
        script = """
import asyncio, importlib.abc, sys
class NoProcessingOnStartup(importlib.abc.MetaPathFinder):
    def find_spec(self, fullname, path=None, target=None):
        if fullname.split('.')[0] in {'moviepy', 'torch', 'whisperx', 'transformers'}:
            raise AssertionError('Eager processing import: ' + fullname)
sys.meta_path.insert(0, NoProcessingOnStartup())
import main
assert asyncio.run(main.health()) == {'status':'ok','app':'edity','workflowVersion':32}
paths = {route.path for route in main.app.routes}
assert {'/transcribe', '/audio/clean', '/preview/align-cut', '/health'} <= paths, paths
"""
        result = subprocess.run([sys.executable, '-c', script],
                                cwd=Path(__file__).resolve().parents[1],
                                capture_output=True, text=True, timeout=90)
        self.assertEqual(result.returncode, 0, result.stderr)


if __name__ == '__main__':
    unittest.main()
