"""Build a metadata-only, provenance-pinned Unstructured compatibility wheel."""
import argparse
import base64
import csv
import hashlib
import io
from pathlib import Path
import re
import tempfile
import urllib.request
import zipfile

UPSTREAM_VERSION = "0.27.34"
VERSION = "0.27.34+filelock4.2.7"
URL = "https://files.pythonhosted.org/packages/1c/14/8ce9ee4281cc9600fff5fce2fdec44969cb76a919d939e214997af291987/unstructured-0.27.34-py3-none-any.whl"
SHA256 = "fde06cbd051b98da9bc4f4765a04f228c90ae3e7053c95aa7091732a9968d60d"


def build(source, output, expected_sha=SHA256):
    raw = Path(source).read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_sha:
        raise ValueError("Upstream wheel checksum does not match")
    old = f"unstructured-{UPSTREAM_VERSION}.dist-info/"
    new = f"unstructured-{VERSION}.dist-info/"
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        metadata = archive.read(old + "METADATA")
        metadata, versions = re.subn(rb"(?m)^Version: 0\.27\.34\r?$", ("Version: " + VERSION).encode(), metadata)
        metadata, constraints = re.subn(rb"(?m)^Requires-Dist: filelock<4\.0\.0,>=3\.12\.0\r?$", b"Requires-Dist: filelock==4.2.7", metadata)
        if versions != 1 or constraints != 1:
            raise ValueError("Unexpected upstream dependency metadata")
        files = {}
        attributes = {}
        for item in archive.infolist():
            if item.is_dir() or item.filename == old + "RECORD":
                continue
            name = new + item.filename[len(old):] if item.filename.startswith(old) else item.filename
            if name in files:
                raise ValueError("Duplicate wheel member")
            files[name] = metadata if name == new + "METADATA" else archive.read(item)
            attributes[name] = item.external_attr
        if not any(name.startswith("unstructured/") for name in files):
            raise ValueError("Upstream Python payload is missing")
    record = io.StringIO(newline="")
    writer = csv.writer(record, lineterminator="\n")
    for name, content in sorted(files.items()):
        digest = base64.urlsafe_b64encode(hashlib.sha256(content).digest()).rstrip(b"=").decode()
        writer.writerow([name, "sha256=" + digest, len(content)])
    writer.writerow([new + "RECORD", "", ""])
    files[new + "RECORD"] = record.getvalue().encode()
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    destination = output / f"unstructured-{VERSION}-py3-none-any.whl"
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, content in sorted(files.items()):
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.compress_type = zipfile.ZIP_DEFLATED
            item.create_system = 3
            item.external_attr = attributes.get(name, 0o644 << 16)
            archive.writestr(item, content)
    return destination


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-wheel", type=Path)
    parser.add_argument("--output-dir", type=Path, default=Path("wheelhouse"))
    args = parser.parse_args()
    if args.source_wheel:
        result = build(args.source_wheel, args.output_dir)
    else:
        with tempfile.TemporaryDirectory(prefix="document-wheel-") as folder:
            source = Path(folder) / "upstream.whl"
            with urllib.request.urlopen(URL, timeout=30) as response:
                content = response.read(32 * 1024 * 1024 + 1)
            if len(content) > 32 * 1024 * 1024:
                raise ValueError("Upstream wheel exceeds the expected size bound")
            source.write_bytes(content)
            result = build(source, args.output_dir)
    print(result)


if __name__ == "__main__":
    main()
