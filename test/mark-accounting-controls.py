"""Adversarial geometry controls: real marks must never vanish as border cleanup."""
import importlib.util
import json
import io
import numpy as np
from PIL import Image, ImageDraw
spec = importlib.util.spec_from_file_location('checker', '/checker.py')
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)
results = []
for name in ['border','thick-border','large-outline-icon','broken-border','minus','plus','underline','decimal','tick','tiny-icon','low-contrast','attached-sign']:
    image = Image.new('RGB',(240,160),'white')
    draw = ImageDraw.Draw(image)
    if name in ('border','thick-border','large-outline-icon','broken-border','attached-sign'):
        draw.rectangle((30,30,180,90),outline='black',width=2 if name=='thick-border' else 1)
        if name == 'broken-border':draw.line((80,30,90,30),fill='white')
        if name == 'attached-sign':draw.line((180,60,200,60),fill='black')
    elif name == 'minus':draw.line((30,60,100,60),fill='black',width=2)
    elif name == 'plus':
        draw.line((30,60,100,60),fill='black',width=2)
        draw.line((65,25,65,95),fill='black',width=2)
    elif name == 'underline':draw.line((30,90,180,90),fill='black')
    elif name == 'decimal':draw.point((30,60),fill='black')
    elif name == 'tick':draw.line([(30,60),(40,70),(65,40)],fill='black',width=2)
    elif name == 'tiny-icon':draw.rectangle((30,30,34,34),outline='black')
    else:draw.line((30,60,100,60),fill=(250,250,250))
    original=image.tobytes()
    border,labels,ledger,marks=checker.mark_inventory(image)
    assert sum(item['pixels'] for item in ledger)==int(marks.sum()), name
    assert image.tobytes()==original, name
    if name in ('border','thick-border','large-outline-icon'):
        assert np.count_nonzero(border)==np.count_nonzero(marks),name
        assert all(item['classificationStatus']=='unverified' for item in ledger),name
        # Removing a visual border still fails the raw appearance comparison.
        assert checker.visual(image,image,Image.new('RGB',image.size,'white'))['status']=='failed'
    else:
        assert np.count_nonzero(border)==0,name
        assert all(item['kind']=='unresolved' for item in ledger),name
    results.append({'name':name,'markedPixels':int(marks.sum()),'outlinePixels':int(np.count_nonzero(border))})
# Inventory overflow must aggregate, not drop, detected pixels.
image=Image.new('RGB',(240,160),'white');draw=ImageDraw.Draw(image)
for y in range(0,160,4):
    for x in range(0,240,4):draw.point((x,y),fill='black')
border,labels,ledger,marks=checker.mark_inventory(image)
assert len(ledger)==1 and ledger[0]['pixels']==int(marks.sum()) and not border.any()
def outlines(offset=0,color='black'):
    frame=Image.new('RGB',(240,160),'white')
    ImageDraw.Draw(frame).rectangle((30+offset,30,180+offset,90),outline=color)
    return checker.mark_inventory(frame)[2]
center=outlines()
assert checker.outline_temporal_support(center,center,center)['status']=='supported'
assert checker.outline_temporal_support(center,center,center)['classificationStatus']=='unverified'
for changed in [outlines(1),outlines(color='gray'),[]]:
    assert checker.outline_temporal_support(center,center,changed)['status']=='unverified'
# Same bounds, area and colors, but different placement of the extra edge pixels.
shapes=[]
for y in [31,89]:
    frame=Image.new('RGB',(240,160),'white');draw=ImageDraw.Draw(frame)
    draw.rectangle((30,30,180,90),outline='black')
    draw.line((31,y,179,y),fill='black')
    entries=checker.mark_inventory(frame)[2]
    assert len(entries)==1 and entries[0]['kind']=='outline-candidate'
    shapes.append(entries)
assert shapes[0][0]['pixels']==shapes[1][0]['pixels']
assert shapes[0][0]['pixelHash']==shapes[1][0]['pixelHash']
assert checker.outline_temporal_support(shapes[0],shapes[0],shapes[1])['status']=='unverified'
# JPEG noise remains accounted for even when it destroys outline confidence.
frame=Image.new('RGB',(240,160),'white');ImageDraw.Draw(frame).rectangle((30,30,180,90),outline='black')
encoded=io.BytesIO();frame.save(encoded,format='JPEG',quality=75)
frame=Image.open(io.BytesIO(encoded.getvalue())).convert('RGB')
border,labels,ledger,marks=checker.mark_inventory(frame)
assert sum(item['pixels'] for item in ledger)==int(marks.sum())
# Alternative line removal may exclude a real minus from region proposals,
# but its pixels must remain accounted for and the diagnostic must not pass.
frame=Image.new('RGB',(240,160),'white');ImageDraw.Draw(frame).line((30,60,100,60),fill='black',width=2)
alternative=checker.region_ocr(frame,'line-proposal')
assert alternative['status']=='unverified'
assert alternative['accounting']['markedPixels']==alternative['accounting']['semanticallyUnresolvedPixels']
assert alternative['accounting']['proposalRemovedMarkedPixels']>0
print(json.dumps(results,indent=2))
