"""Real OCR controls in the installed offline document image."""
import importlib.util
import json
from PIL import Image, ImageDraw, ImageFont
spec = importlib.util.spec_from_file_location('checker', '/checker.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 22)
results = []
for label, value in [('negative', '-3'), ('positive', '3'), ('changed', '-8')]:
    image = Image.new('RGB', (480,240), 'white')
    draw = ImageDraw.Draw(image)
    draw.text((20,20), 'Add', fill='black', font=font)
    draw.text((170,20), 'Subtract', fill='black', font=font)
    draw.text((20,100), value, fill='black', font=font)
    report = checker.region_ocr(image)
    results.append({'label':label, **report})
    assert report['textReadingStatus'] == 'passed', json.dumps(results[-1])
    assert report['status'] == 'unverified'  # Readable words do not attribute every pixel to a glyph.
    assert report['text'] == 'Add Subtract '+value, json.dumps(results[-1])
assert checker.region_ocr(Image.new('RGB',(480,240),'white'))['status'] == 'unverified'
assert len({r['text'] for r in results}) == 3
print(json.dumps(results,indent=2))
