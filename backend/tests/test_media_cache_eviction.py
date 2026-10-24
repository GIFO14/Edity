import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from services import asset_preparation as preparation

class MediaCacheEvictionTests(unittest.TestCase):
    def test_preparing_mix_is_ignored_and_vanished_entry_is_normal(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            partial=root/'mix.partial.wav';partial.write_bytes(b'pending')
            old=root/'old.wav';old.write_bytes(b'old')
            vanished=root/'vanished.wav'
            with patch.object(preparation,'CACHE',root),patch.object(preparation,'LIMIT',0),patch.object(Path,'rglob',return_value=iter([partial,vanished,old])):
                preparation.evict()
            self.assertTrue(partial.exists())
            self.assertFalse(old.exists())

if __name__=='__main__':unittest.main()
