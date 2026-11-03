"""Bounded offline crop comparison. No LLM, network, or candidate-driven alignment."""
import csv
import io
import json
import hashlib
from pathlib import Path
import subprocess
import sys

import cv2
import numpy as np
from PIL import Image

LIMITS = {'channelDelta': 40, 'activeMismatch': .12, 'tileMismatch': .30,
          'backgroundDelta': 12, 'foregroundDelta': 12, 'alignmentPixels': 6, 'ocrConfidence': 55}


def clean(text):
    return ' '.join(text.split())


def read_image(file):
    with Image.open(file) as image:
        if not (64 <= image.width <= 1920 and 64 <= image.height <= 1920):
            raise ValueError('Image dimensions outside bounded verification limits')
        return image.convert('RGB')


def ocr_pass(image, modes=(6, 11)):
    # Two segmentation modes must agree; disagreement is not repaired using output text.
    enlarged = image.resize((image.width * 3, image.height * 3))
    data = io.BytesIO()
    enlarged.save(data, format='PNG')
    observations = []
    for mode in modes:
        run = subprocess.run(['tesseract', 'stdin', 'stdout', '--psm', str(mode), 'tsv'],
                             input=data.getvalue(), capture_output=True, timeout=25, check=True)
        rows = list(csv.DictReader(io.StringIO(run.stdout.decode('utf-8')), delimiter='\t'))
        words = [r for r in rows if r.get('text', '').strip()]
        observations.append({'mode': mode, 'text': clean(' '.join(r['text'] for r in words)),
                             'minimumConfidence': min((float(r['conf']) for r in words), default=0)})
    readable = (bool(observations[0]['text']) and
                observations[0]['text'] == observations[1]['text'] and
                all(o['minimumConfidence'] >= LIMITS['ocrConfidence'] for o in observations))
    return {'status': 'passed' if readable else 'unverified', 'observations': observations,
            'text': observations[0]['text'] if readable else None}


def mark_inventory(image):
    """Account for all pixels differing from the median background, including single pixels."""
    pixels = np.asarray(image)
    bg = np.median(pixels.reshape(-1, 3), axis=0)
    marks = np.any(pixels != bg, axis=2).astype('uint8')
    count, labels, stats, _ = cv2.connectedComponentsWithStats(marks, connectivity=8)
    border_mask = np.zeros(marks.shape, dtype='uint8')
    entries = []
    if count > 401:
        return border_mask, labels, [{'kind':'unresolved', 'reason':'Component budget exceeded',
            'pixels':int(marks.sum()), 'componentCount':count-1}], marks
    for index, (x,y,w,h,area) in enumerate(stats[1:], 1):
        x,y,w,h,area = map(int, (x,y,w,h,area))
        component = labels[y:y+h,x:x+w] == index
        # Only a complete, isolated rectangular outline. Attached marks or filled shapes fail.
        rectangle = False
        if w >= 40 and h >= 18:
            inside = component[2:-2,2:-2]
            sides = [component[:2].any(axis=0), component[-2:].any(axis=0),
                     component[:,:2].any(axis=1), component[:,-2:].any(axis=1)]
            corners = [component[:2,:2],component[:2,-2:],component[-2:,:2],component[-2:,-2:]]
            rectangle = not inside.any() and all(side.all() for side in sides) and all(c.any() for c in corners)
        if rectangle:
            border_mask[labels == index] = 255
        entries.append({'id':index,'bounds':[x,y,x+w,y+h],'pixels':area,
                        'pixelHash':hashlib.sha256(pixels[labels == index].tobytes()).hexdigest(),
                        'componentMaskHash':hashlib.sha256(component.tobytes()).hexdigest(),
                        'kind':'outline-candidate' if rectangle else 'unresolved',
                        'classificationStatus':'unverified',
                        'reason':'Geometric outline only; may be a meaningful icon or glyph; retained in raw appearance checks' if rectangle else 'No independent non-text classification'})
    return border_mask, labels, entries, marks


def outline_temporal_support(center, before, after):
    def signature(entries):
        return {(tuple(item['bounds']),item['pixels'],item['pixelHash'],item['componentMaskHash']) for item in entries
                if item.get('kind')=='outline-candidate'}
    expected=signature(center)
    supported=bool(expected) and signature(before)==expected==signature(after)
    return {'status':'supported' if supported else 'unverified',
            'candidateCount':len(expected),'classificationStatus':'unverified',
            'reason':'Exact outline geometry and colors at three samples; static icons can satisfy this too'}


def region_ocr(image, proposal_mode='outline-candidates'):
    """Source-only text proposals; diagnostic evidence, never an acceptance override."""
    gray = np.asarray(image.convert('L'))
    ink = (gray < 180).astype('uint8') * 255
    borders, mark_labels, ledger, marks = mark_inventory(image)
    proposal_mask = borders
    if proposal_mode == 'line-proposal':
        horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((1,40),np.uint8))
        vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN, np.ones((25,1),np.uint8))
        proposal_mask = cv2.dilate(cv2.bitwise_or(horizontal,vertical),np.ones((3,3),np.uint8))
    elif proposal_mode != 'outline-candidates':
        raise ValueError('Unknown diagnostic proposal mode')
    text = cv2.subtract(ink, proposal_mask)
    accounting = {'sourcePixelHash':hashlib.sha256(np.asarray(image).tobytes()).hexdigest(),
                  'markedPixels':int(marks.sum()),'entries':ledger,
                  'outlineCandidatePixels':int(np.count_nonzero(borders)),
                  'semanticallyUnresolvedPixels':int(marks.sum()),
                  'outlineMaskHash':hashlib.sha256(borders.tobytes()).hexdigest(),
                  'proposalMode':proposal_mode,
                  'proposalMaskHash':hashlib.sha256(proposal_mask.tobytes()).hexdigest(),
                  'proposalRemovedMarkedPixels':int(np.count_nonzero((proposal_mask>0)&(marks>0))),
                  'appearanceInput':'unchanged-original-image'}
    count, labels, stats, _ = cv2.connectedComponentsWithStats(text, connectivity=8)
    components = [tuple(int(v) for v in row[:4]) for row in stats[1:]]
    if not components or len(components) > 400:
        return {'status': 'unverified', 'regions': [], 'accounting':accounting, 'reason': 'No bounded text component inventory'}
    # Group overlapping baselines; retain disconnected signs and dots instead of dropping them.
    groups = []
    for x, y, w, h in sorted(components, key=lambda r: (r[1], r[0])):
        hits = [g for g in groups if y <= g[3]+2 and y+h >= g[1]-2]
        if hits:
            group = hits[0]
            group[:] = [min(group[0], x), min(group[1], y), max(group[2], x+w), max(group[3], y+h)]
        else:
            groups.append([x, y, x+w, y+h])
    boxes = []
    for left, top, right, bottom in sorted(groups, key=lambda g: (g[1], g[0])):
        # Split large horizontal gaps, independently of expected labels or browser DOM.
        spans = sorted((x, x+w) for x, y, w, h in components if top <= y < bottom)
        start, end = spans[0]
        for x, edge in spans[1:]:
            if x-end > max(8, (bottom-top)*1.5):
                boxes.append([start, top, end, bottom]);start = x
            end = max(end, edge)
        boxes.append([start, top, end, bottom])
    if len(boxes) > 12:
        return {'status': 'unverified', 'regions': [], 'accounting':accounting, 'reason': 'Text region budget exceeded', 'proposedCount': len(boxes)}
    regions = []
    for left, top, right, bottom in boxes:
        crop = image.crop((max(0,left-2), max(0,top-2), min(image.width,right+2), min(image.height,bottom+2)))
        padded = Image.new('RGB', (crop.width+20, crop.height+20), 'white')
        padded.paste(crop, (10,10))
        reading = ocr_pass(padded, (6,7))
        # No mark becomes text merely because it falls inside a readable bounding box.
        # OCR does not provide character-level attribution: retain unresolved ledger entries.
        regions.append({'bounds': [left,top,right,bottom], **reading})
    readable = bool(regions) and all(r['status']=='passed' for r in regions)
    return {'status': 'unverified', 'textReadingStatus':'passed' if readable else 'unverified', 'regions': regions,
            'accounting':accounting,
            'text': clean(' '.join(r['text'] for r in regions)) if readable else None,
            'scope': 'detected-text-regions-only',
            'reason': 'Region detection may omit marks; diagnostics cannot override full content or coverage checks'}


def ocr(image):
    raw = ocr_pass(image)
    gray = np.asarray(image.convert('L'))
    mask = (gray < 180).astype('uint8') * 255
    horizontal = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((1, 40), np.uint8))
    vertical = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((25, 1), np.uint8))
    lines = cv2.dilate(cv2.bitwise_or(horizontal, vertical), np.ones((3, 3), np.uint8))
    cleaned = ocr_pass(Image.fromarray(255-cv2.subtract(mask, lines)))
    usable = [entry for entry in (raw, cleaned) if entry['status'] == 'passed']
    agreed = bool(usable) and len({entry['text'] for entry in usable}) == 1
    return {'status': 'passed' if agreed else 'unverified',
            'text': usable[0]['text'] if agreed else None,
            'variants': {'raw': raw, 'bordersRemoved': cleaned},
            'reason': 'Each usable variant requires two-mode agreement; conflicting usable variants remain uncertain'}


def background(image):
    pixels = np.asarray(image)
    return np.median(pixels.reshape(-1, 3), axis=0)


def translated(image, dx, dy):
    fill = tuple(int(v) for v in background(image))
    result = Image.new('RGB', image.size, fill)
    result.paste(image, (dx, dy))
    # Refuse to hide edge content when moving the source-derived capture.
    pixels = np.asarray(image).astype(float)
    mask = np.max(np.abs(pixels - np.array(fill)), axis=2) > 40
    lost = ((dx > 0 and mask[:, -dx:].any()) or (dx < 0 and mask[:, :-dx].any()) or
            (dy > 0 and mask[-dy:, :].any()) or (dy < 0 and mask[:-dy, :].any()))
    return result, bool(lost)


def metrics(reference, candidate):
    a, b = np.asarray(reference).astype(float), np.asarray(candidate).astype(float)
    bg_a, bg_b = background(reference), background(candidate)
    active = (np.max(np.abs(a-bg_a), axis=2) > 40) | (np.max(np.abs(b-bg_b), axis=2) > 40)
    different = np.max(np.abs(a-b), axis=2) > LIMITS['channelDelta']
    count = int(active.sum())
    mismatch = float((different & active).sum() / max(count, 1))
    worst = 0.
    # Local evidence prevents the white background from hiding a missing small control.
    for y in range(0, a.shape[0], 8):
        for x in range(0, a.shape[1], 8):
            tile = active[y:y+8, x:x+8]
            if tile.sum() >= 2:
                worst = max(worst, float((different[y:y+8, x:x+8] & tile).sum()/tile.sum()))
    core_a = a[np.max(np.abs(a-bg_a), axis=2) > 80]
    core_b = b[np.max(np.abs(b-bg_b), axis=2) > 80]
    foreground_delta = (float(np.max(np.abs(np.median(core_a, axis=0)-np.median(core_b, axis=0))))
                        if len(core_a) and len(core_b) else 255.)
    return {'activePixels': count, 'activeMismatch': mismatch, 'worstTileMismatch': worst,
            'backgroundDelta': float(np.max(np.abs(bg_a-bg_b))), 'foregroundDelta': foreground_delta}


def visual(reference, creator, candidate):
    if candidate.size != creator.size or any(abs(a-b) > 2 for a, b in zip(reference.size, creator.size)):
        return {'status': 'unverified', 'reason': 'Capture dimensions differ; no output-dependent resizing'}
    canvas = (max(reference.width, creator.width), max(reference.height, creator.height))
    original_sizes = {'reference': reference.size, 'creator': creator.size, 'candidate': candidate.size}
    def pad(image):
        result = Image.new('RGB', canvas, tuple(int(v) for v in background(image)))
        result.paste(image, (0, 0))
        return result
    # Device scale rounding may differ by <=2 pixels. Pad only; never crop or rescale content.
    reference, creator, candidate = [pad(image) for image in (reference, creator, candidate)]
    # Choose only a small translation from reference + pinned creator, never candidate.
    best = None
    for dy in range(-LIMITS['alignmentPixels'], LIMITS['alignmentPixels']+1):
        for dx in range(-LIMITS['alignmentPixels'], LIMITS['alignmentPixels']+1):
            aligned, lost = translated(creator, dx, dy)
            if lost:
                continue
            a, b = np.asarray(reference).astype(float), np.asarray(aligned).astype(float)
            score = float(np.abs(a-b).mean())
            choice = (score, abs(dx)+abs(dy), dx, dy)
            if best is None or choice < best:
                best = choice
    if best is None:
        return {'status': 'unverified', 'reason': 'Alignment would discard edge content'}
    _, _, dx, dy = best
    aligned, lost = translated(candidate, dx, dy)
    evidence = metrics(reference, aligned)
    passed = (not lost and evidence['activePixels'] >= 16 and
              evidence['activeMismatch'] <= LIMITS['activeMismatch'] and
              evidence['worstTileMismatch'] <= LIMITS['tileMismatch'] and
              evidence['backgroundDelta'] <= LIMITS['backgroundDelta'] and
              evidence['foregroundDelta'] <= LIMITS['foregroundDelta'])
    return {'status': 'passed' if passed else 'failed', 'alignment': {'x': dx, 'y': dy},
            'alignmentSource': 'video-and-pinned-creator-only', 'discardedContent': lost,
            'metrics': evidence, 'limits': LIMITS, 'originalSizes': original_sizes, 'paddedCanvas': canvas}


def verify(reference, creator, candidate, expected_text):
    source_text, output_text = ocr(reference), ocr(candidate)
    readable = source_text['status'] == output_text['status'] == 'passed'
    status = ('passed' if source_text['text'] == output_text['text'] == clean(expected_text)
              else 'failed') if readable else 'unverified'
    if readable and source_text['text'] == output_text['text'] != clean(expected_text):
        status = 'unverified'  # Both OCR passes can omit the same small controls.
    content = {'status': status, 'source': source_text, 'output': output_text,
               'browserText': clean(expected_text),
               'reason': 'Require agreement between independent source OCR, output OCR and browser text'}
    appearance = visual(reference, creator, candidate)
    return {'scope': 'selected-source-crop-only', 'content': content, 'appearance': appearance,
            'passed': status == 'passed' and appearance['status'] == 'passed',
            'limitations': ['Crop completeness and tutorial state selection are separate gates.',
                            'OCR agreement is bounded evidence, not proof of every glyph.',
                            'Image thresholds are calibrated controls, not universal fidelity.']}


if __name__ == '__main__':
    request = json.loads(Path('/input/request.json').read_text())
    images = [read_image(Path('/input') / name) for name in ('reference.png', 'creator.png', 'candidate.png')]
    report = verify(*images, request['browserText'])
    count = request.get('neighborCount', 0)
    if count not in (0, 2):
        raise ValueError('Invalid temporal reference count')
    observations = [ocr(read_image(Path('/input') / f'neighbor{i}.png')) for i in range(count)]
    stable = (count == 2 and report['content']['source']['status'] == 'passed' and
              all(o['status'] == 'passed' and o['text'] == report['content']['source']['text'] for o in observations))
    report['temporal'] = {'status': 'passed' if stable else 'unverified', 'observations': observations,
                          'reason': 'Require readable agreeing source text before, at and after the selected state'}
    print(json.dumps(report))
