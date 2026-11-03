import unittest
import cv2
import numpy as np
from importlib.util import spec_from_file_location, module_from_spec
from pathlib import Path

spec = spec_from_file_location('regions', Path(__file__).with_name('source-regions.py'))
regions = module_from_spec(spec)
spec.loader.exec_module(regions)

class RegionTests(unittest.TestCase):
    def test_plain_page_does_not_require_editor_layout(self):
        boxes = regions.propose_regions(np.full((300, 500, 3), 255, np.uint8))
        self.assertTrue(any(box['width'] > 980 and box['height'] > 980 for box in boxes))

    def test_panes_on_either_side_are_proposed_without_video_rules(self):
        for left in (True, False):
            image = np.full((400, 800, 3), 30, np.uint8)
            image[:50] = 150
            start, end = (0, 300) if left else (500, 800)
            image[50:380, start:end] = 255
            cv2.putText(image, 'Sample', (start+15, 90), cv2.FONT_HERSHEY_SIMPLEX, .5, (0,0,0), 1)
            boxes = regions.propose_regions(image)
            self.assertTrue(any(abs(box['x']-start/800*1000)<15 and abs(box['width']-375)<20 and abs(box['y']-125)<15 for box in boxes))
            for box in boxes:
                self.assertLessEqual(box['x']+box['width'], 1000)
                self.assertLessEqual(box['y']+box['height'], 1000)

if __name__ == '__main__':
    unittest.main()
