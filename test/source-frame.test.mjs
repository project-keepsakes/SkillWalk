import test from 'node:test';
import assert from 'node:assert/strict';
import {validArtifactBounds,artifactCropFilter,frameEvidence,cropIsArtifact} from '../src/source-frame.mjs';
test('artifact regions reject out-of-frame and executable model values',()=>{
  const region={x:700,y:80,width:300,height:920};
  assert.equal(validArtifactBounds(region),true);
  assert.equal(artifactCropFilter(region),'crop=iw*300/1000:ih*920/1000:iw*700/1000:ih*80/1000');
  for(const bad of [{...region,width:301},{...region,x:-1},{...region,width:'300;evil'},null,{x:0,y:0,width:0,height:0}])assert.throws(()=>artifactCropFilter(bad));
});
test('geometry cannot certify a crop containing editor or browser chrome',()=>{
  const clear={containsEditor:false,containsBrowserToolbar:false,pageReadable:true,uncertain:false};
  assert.equal(cropIsArtifact(clear),true);
  for(const key of ['containsEditor','containsBrowserToolbar','uncertain'])assert.equal(cropIsArtifact({...clear,[key]:true}),false);
  assert.equal(cropIsArtifact({}),false);
  assert.equal(frameEvidence({artifactOCR:'unverified editor text',artifactVerified:false}).artifactText,'');
});
test('content evidence uses cropped page OCR rather than editor chrome',()=>{
  const evidence=frameEvidence({id:'v1',timestamp:1,view:'mixed',ocr:'Close tab Ask Gemini line 12',visibleText:['wrong editor text'],artifactOCR:'Click me\nHello',code:'<p>Hello</p>',appearance:'white page',artifactVerified:true});
  assert.equal(evidence.artifactText,'Click me\nHello');assert.equal(JSON.stringify(evidence).includes('Ask Gemini'),false);
});

import {applyArtifactObservation} from '../src/source-frame.mjs';
test('verified crop styling replaces conflicting full-frame chrome without losing source code',()=>{
 const whole={view:'mixed',appearance:'Dark editor',visibleText:['file.js'],code:'button code',uncertainty:'mixed'};
 const crop={containsEditor:false,containsBrowserToolbar:false,pageReadable:true,uncertain:false,artifactAppearance:'White page, dark text; number below two buttons',artifactText:['+1','-1','3']};
 const result=applyArtifactObservation(whole,crop);assert.equal(result.appearance,crop.artifactAppearance);assert.deepEqual(result.visibleText,crop.artifactText);assert.equal(result.code,whole.code);
 assert.equal(applyArtifactObservation(whole,{...crop,containsEditor:true}),whole);
 assert.equal(applyArtifactObservation(whole,{...crop,artifactAppearance:''}),whole);
});
