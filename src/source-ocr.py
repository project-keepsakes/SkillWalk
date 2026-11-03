"""Offline, read-only transcription of tutorial frames with the installed OCR tool."""
from pathlib import Path
import json
import subprocess
import sys

result = {}
names = sys.argv[1:]
if any(Path(name).name != name or not name.endswith('.jpg') for name in names):
    raise ValueError('Invalid frame filename')
frames = [Path('/input') / name for name in names] if names else Path('/input').glob('*.jpg')
for frame in sorted(frames):
    completed = subprocess.run(['tesseract', str(frame), 'stdout', '--psm', '11'],
                               capture_output=True, text=True, timeout=20, check=True)
    result[frame.name] = completed.stdout[:16000]
print(json.dumps(result))
