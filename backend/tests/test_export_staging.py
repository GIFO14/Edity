import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from routers.export import _replace_export_from_temporary


class ExportStagingTests(unittest.TestCase):
    def test_studio_sound_replacement_is_staged_on_destination_drive(self):
        with tempfile.TemporaryDirectory(prefix="edity-export-source-") as source_dir, \
                tempfile.TemporaryDirectory(prefix="edity-export-target-") as target_dir:
            source = Path(source_dir) / "enhanced.mp4"
            target = Path(target_dir) / "exported.mp4"
            source.write_bytes(b"enhanced video")
            target.write_bytes(b"original export")
            from routers import export as export_router
            original_replace = export_router.os.replace

            def same_directory_replace(staged, destination):
                self.assertEqual(Path(staged).parent, target.parent)
                return original_replace(staged, destination)

            with patch.object(export_router.os, "replace", side_effect=same_directory_replace):
                _replace_export_from_temporary(str(source), str(target))
            self.assertEqual(target.read_bytes(), b"enhanced video")
            self.assertEqual(source.read_bytes(), b"enhanced video")
            self.assertEqual(list(target.parent.iterdir()), [target])

    def test_copy_failure_preserves_original_export(self):
        with tempfile.TemporaryDirectory(prefix="edity-export-staging-") as directory:
            root = Path(directory)
            source, target = root / "cleaned.mp4", root / "exported.mp4"
            source.write_bytes(b"cleaned")
            target.write_bytes(b"original")
            with patch("routers.export.shutil.copyfile", side_effect=OSError("disk full")):
                with self.assertRaises(OSError):
                    _replace_export_from_temporary(str(source), str(target))
            self.assertEqual(target.read_bytes(), b"original")
            self.assertEqual(sorted(path.name for path in root.iterdir()),
                             ["cleaned.mp4", "exported.mp4"])


if __name__ == "__main__":
    unittest.main()
