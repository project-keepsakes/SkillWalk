"""Standalone offline diagnostic using the same installed OCR engine and thresholds."""
import importlib.util
import json
from pathlib import Path

spec = importlib.util.spec_from_file_location('layered', '/checker.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
files = sorted(Path('/input').glob('*.png'))
if not 1 <= len(files) <= 12:
    raise ValueError('Expected 1 to 12 diagnostic frames')
results = {}
for file in files:
    image=checker.read_image(file)
    result=checker.region_ocr(image)
    alternative=checker.region_ocr(image, 'line-proposal')
    result['alternativeLineProposal']=alternative
    result['interpretationComparison']={
        'status':'unverified',
        'conflictingReadableText':bool(result.get('text') and alternative.get('text') and result['text']!=alternative['text']),
        'reason':'Alternative preprocessing never resolves mark attribution or overrides the conservative inventory'}
    mask,_,_,_=checker.mark_inventory(image)
    mask_file=Path('/output')/(file.stem+'-outline-mask.png')
    checker.Image.fromarray(mask).save(mask_file)
    result['outlineMaskFile']=mask_file.name
    result['outlineMaskFileHash']=checker.hashlib.sha256(mask_file.read_bytes()).hexdigest()
    ink=(checker.np.asarray(image.convert('L'))<180).astype('uint8')*255
    horizontal=checker.cv2.morphologyEx(ink,checker.cv2.MORPH_OPEN,checker.np.ones((1,40),checker.np.uint8))
    vertical=checker.cv2.morphologyEx(ink,checker.cv2.MORPH_OPEN,checker.np.ones((25,1),checker.np.uint8))
    line_mask=checker.cv2.dilate(checker.cv2.bitwise_or(horizontal,vertical),checker.np.ones((3,3),checker.np.uint8))
    if checker.hashlib.sha256(line_mask.tobytes()).hexdigest()!=alternative['accounting']['proposalMaskHash']:
        raise ValueError('Alternative mask evidence mismatch')
    line_file=Path('/output')/(file.stem+'-line-mask.png')
    checker.Image.fromarray(line_mask).save(line_file)
    result['lineMaskFile']=line_file.name
    result['lineMaskFileHash']=checker.hashlib.sha256(line_file.read_bytes()).hexdigest()
    results[file.name]=result
for name,result in results.items():
    if name.endswith('-native.png'):
        before=results.get(name.replace('-native.png','-native-before.png'))
        after=results.get(name.replace('-native.png','-native-after.png'))
        if before and after:
            result['temporalOutlineSupport']=checker.outline_temporal_support(result['accounting']['entries'],before['accounting']['entries'],after['accounting']['entries'])
print(json.dumps(results, indent=2))
