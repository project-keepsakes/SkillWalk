import base64
import csv
import hashlib
import io
from pathlib import Path
import tempfile
import unittest
import zipfile
from build_compat_wheel import build, VERSION


class CompatibilityWheelTests(unittest.TestCase):
    def test_only_declared_metadata_changes_and_record_is_complete(self):
        with tempfile.TemporaryDirectory() as folder:
            source = Path(folder) / "source.whl"
            with zipfile.ZipFile(source, "w") as wheel:
                wheel.writestr("unstructured/tokenize.py", "PAYLOAD = 'unchanged'\n")
                wheel.writestr("unstructured-0.27.34.dist-info/licenses/LICENSE", "preserved license")
                wheel.writestr("unstructured-0.27.34.dist-info/METADATA", "Metadata-Version: 2.4\nName: unstructured\nVersion: 0.27.34\nRequires-Dist: filelock<4.0.0,>=3.12.0\nRequires-Dist: other>=1\n")
                wheel.writestr("unstructured-0.27.34.dist-info/RECORD", "")
            digest = hashlib.sha256(source.read_bytes()).hexdigest()
            with self.assertRaisesRegex(ValueError, "checksum"):
                build(source, Path(folder) / "bad", "wrong")
            first = build(source, Path(folder) / "first", digest)
            second = build(source, Path(folder) / "second", digest)
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with zipfile.ZipFile(first) as wheel:
                self.assertEqual(wheel.read("unstructured/tokenize.py"), b"PAYLOAD = 'unchanged'\n")
                prefix = f"unstructured-{VERSION}.dist-info/"
                self.assertEqual(wheel.read(prefix + "licenses/LICENSE"), b"preserved license")
                metadata = wheel.read(prefix + "METADATA")
                self.assertIn(b"Requires-Dist: filelock==4.2.7", metadata)
                self.assertIn(b"Requires-Dist: other>=1", metadata)
                rows = list(csv.reader(io.StringIO(wheel.read(prefix + "RECORD").decode())))
                self.assertEqual(set(wheel.namelist()), {row[0] for row in rows})
                for name, digest, size in rows:
                    if name.endswith("/RECORD"):
                        continue
                    content = wheel.read(name)
                    self.assertEqual(int(size), len(content))
                    self.assertEqual(digest, "sha256=" + base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b"=").decode())


if __name__ == "__main__":
    unittest.main()
