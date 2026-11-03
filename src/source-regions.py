"""Propose page-sized uniform background regions; proposals are not validation."""
from pathlib import Path
import json
import cv2
import numpy as np

def propose_regions(image):
    height, width = image.shape[:2]
    pixels = image.reshape(-1, 3).astype(np.int32)
    bins = pixels // 16
    keys = bins[:, 0] * 256 + bins[:, 1] * 16 + bins[:, 2]
    counts = np.bincount(keys, minlength=4096)
    edges = cv2.Canny(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), 10, 30)
    lines = cv2.HoughLinesP(edges, 1, np.pi/180, 80,
                           minLineLength=min(width,height)*.35, maxLineGap=5)
    proposals = []
    for key in counts.argsort()[-6:][::-1]:
        if counts[key] == 0:
            continue
        color = np.median(pixels[keys == key], axis=0).astype(np.int32)
        mask = cv2.inRange(image, np.maximum(0, color - 12).astype(np.uint8),
                           np.minimum(255, color + 12).astype(np.uint8))
        if lines is not None:
            for x1,y1,x2,y2 in lines.reshape(-1,4):
                if abs(x1-x2)<3 or abs(y1-y2)<3:
                    cv2.line(mask,(x1,y1),(x2,y2),0,3)
        mask = cv2.erode(mask, np.ones((3, 3), np.uint8))
        total, _, stats, _ = cv2.connectedComponentsWithStats(mask, connectivity=4)
        for left, top, w, h, area in stats[1:]:
            if w < width * .1 or h < height * .15 or area < width * height * .035 or area / (w*h) < .65:
                continue
            left, top = max(0, int(left)-1), max(0, int(top)-1)
            right, bottom = min(width, left+int(w)+2), min(height, top+int(h)+2)
            box = [left, top, right, bottom]
            duplicate = False
            for old in proposals:
                a, b, c, d = old['pixels']
                overlap = max(0,min(c,right)-max(a,left))*max(0,min(d,bottom)-max(b,top))
                union = (c-a)*(d-b)+(right-left)*(bottom-top)-overlap
                if overlap / max(1,union) > .85:
                    duplicate = True
                    break
            if not duplicate:
                x, y = round(left/width*1000), round(top/height*1000)
                proposals.append({'x':x,'y':y,'width':min(1000-x,round((right-left)/width*1000)),
                                  'height':min(1000-y,round((bottom-top)/height*1000)),
                                  'pixels':box,'area':int(area)})
    proposals.sort(key=lambda item:item['area'],reverse=True)
    return [{k:v for k,v in proposal.items() if k not in ('pixels','area')} for proposal in proposals[:5]]


if __name__ == '__main__':
    result = {filename.name: propose_regions(cv2.imread(str(filename))) for filename in sorted(Path('/input').glob('frame-*.jpg'))}
    print(json.dumps(result))
