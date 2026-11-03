"""Offline regressions for the document image's patched locking dependency."""
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

from filelock import FileLock
from huggingface_hub.utils import WeakFileLock
from torch.utils._filelock import FileLock as TorchFileLock
from unstructured.nlp import tokenize


class LockCompatibilityTests(unittest.TestCase):
    def test_process_contention_and_release(self):
        with tempfile.TemporaryDirectory() as folder:
            path = str(Path(folder) / "process.lock")
            code = (
                "import sys; from filelock import FileLock, Timeout\n"
                "try:\n with FileLock(sys.argv[1], timeout=0.05): pass\n"
                "except Timeout: sys.exit(7)\n"
            )
            with FileLock(path, timeout=-1):
                self.assertEqual(subprocess.run([sys.executable, "-c", code, path], timeout=10).returncode, 7)
            self.assertEqual(subprocess.run([sys.executable, "-c", code, path], timeout=10).returncode, 0)

    def test_hub_and_torch_callers(self):
        with tempfile.TemporaryDirectory() as folder:
            with WeakFileLock(Path(folder) / "hub.lock", timeout=1) as lock:
                self.assertTrue(lock.is_locked)
            with TorchFileLock(str(Path(folder) / "torch.lock"), timeout=1) as lock:
                self.assertTrue(lock.is_locked)
            self.assertFalse(lock.is_locked)

    def test_unstructured_install_double_check_under_real_lock(self):
        with tempfile.TemporaryDirectory() as folder:
            lock_path = str(Path(folder) / "model.lock")
            model = object()
            with patch.object(tokenize, "_INSTALL_LOCK_PATH", lock_path), \
                 patch.object(tokenize.spacy, "load", side_effect=[OSError(), OSError(), model]), \
                 patch.object(tokenize, "_install_spacy_model") as install:
                def assert_locked():
                    from filelock import Timeout
                    with self.assertRaises(Timeout):
                        FileLock(lock_path, timeout=0).acquire()
                install.side_effect = assert_locked
                self.assertIs(tokenize._load_spacy_model(), model)
                install.assert_called_once_with()
            with FileLock(lock_path, timeout=0):
                pass


if __name__ == "__main__":
    unittest.main()
