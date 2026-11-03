import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFidelityPassed, renderReviewPassed} from '../src/visual-verdict.mjs';

test('source fidelity rejects malformed, contradictory and uncertain model verdicts', () => {
  const valid = {contentMatches:true, stylingMatches:true, uncertain:false, differences:[],
    sourceContent:'Counter', outputContent:'Counter', sourceStyle:'White', outputStyle:'White'};
  assert.equal(sourceFidelityPassed(valid),true);
  for(const change of [{contentMatches:'false'}, {stylingMatches:1}, {uncertain:undefined},
    {uncertain:true}, {differences:''}, {differences:['Missing label']}, {sourceStyle:''}, {outputContent:null}]) {
    assert.equal(sourceFidelityPassed({...valid,...change}),false);
  }
  assert.equal(sourceFidelityPassed(null),false);
});

test('render review cannot accept string booleans or reported defects', () => {
  assert.equal(renderReviewPassed({acceptable:true,issues:[]}),true);
  for(const result of [null, {}, {acceptable:'false',issues:[]}, {acceptable:true,issues:['Clipped text']},
    {acceptable:true,issues:''}, {acceptable:false,issues:[]}]) assert.equal(renderReviewPassed(result),false);
});
