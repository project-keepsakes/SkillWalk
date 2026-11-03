"""Run in the existing document image: real Tesseract + Pillow, no downloads."""
import importlib.util
import json
from PIL import Image, ImageDraw, ImageFont

spec = importlib.util.spec_from_file_location('layered', '/checker.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
font = ImageFont.truetype('/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf', 28)


def page(value='-3', color='white', offset=0, missing=False, extra=False):
    image = Image.new('RGB', (480, 240), color)
    draw = ImageDraw.Draw(image)
    draw.text((24+offset, 24), 'Add', fill='black', font=font)
    if not missing:
        draw.text((180+offset, 24), 'Subtract', fill='black', font=font)
    draw.text((24+offset, 100), value, fill='black', font=font)
    if extra:
        draw.text((24+offset, 160), 'Extra', fill='black', font=font)
    return image


reference = page()
results = []
for name, candidate, browser_text, expected in [
    ('correct', page(), 'Add Subtract -3', True),
    ('wrong-value', page('3'), 'Add Subtract 3', False),
    ('wrong-color', page(color='orange'), 'Add Subtract -3', False),
    ('shifted-layout', page(offset=35), 'Add Subtract -3', False),
    ('missing-control', page(missing=True), 'Add -3', False),
    ('extra-content', page(extra=True), 'Add Subtract -3 Extra', False),
]:
    result = module.verify(reference, reference, candidate, browser_text)
    results.append({'name': name, **result})
    assert result['passed'] == expected, json.dumps(results[-1])
# Compression can make OCR ambiguous even when the image comparison passes.
import io
compressed = io.BytesIO()
reference.save(compressed, format='JPEG', quality=85)
jpeg = Image.open(io.BytesIO(compressed.getvalue())).convert('RGB')
result = module.verify(jpeg, reference, reference, 'Add Subtract -3')
results.append({'name': 'compressed-correct', **result})
assert result['appearance']['status'] == 'passed', json.dumps(results[-1])
assert result['content']['status'] in ('passed', 'unverified'), json.dumps(results[-1])
if result['content']['status'] == 'passed':
    assert result['content']['source']['text'] == result['content']['output']['text'] == 'Add Subtract -3'
else:
    assert not result['passed']
assert module.visual(reference, reference, page().resize((240, 120)))['status'] == 'unverified'
rounded = Image.new('RGB', (482, 240), 'white')
rounded.paste(reference, (0, 0))
assert module.visual(rounded, reference, reference)['status'] == 'passed'
assert module.verify(reference, reference, reference, 'Add Subtract -3 Missing')['content']['status'] == 'unverified'
blank = Image.new('RGB', (480, 240), 'white')
assert module.ocr(blank)['status'] == 'unverified'
gray = reference.point(lambda p: 30 if p == 0 else p)
assert module.visual(reference, reference, gray)['status'] == 'failed'
for shape in ('icon', 'border'):
    adorned = reference.copy()
    draw = ImageDraw.Draw(adorned)
    if shape == 'icon':
        draw.rectangle((400, 180, 403, 183), fill='black')
    else:
        draw.line((20, 200, 440, 200), fill='black', width=1)
    result = module.visual(adorned, adorned, reference)
    results.append({'name': 'removed-'+shape, 'appearance': result})
    assert result['status'] == 'failed', json.dumps(results[-1])
print(json.dumps(results, indent=2))
