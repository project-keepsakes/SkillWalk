import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeSourceContract} from '../src/analyze-source.mjs';
test('creator browser measurements ground the initial contract before any generated candidate exists',async()=>{
  const calls=[];
  const files=[{id:'m0',name:'index.html',text:'<html><body><p>Original source</p></body></html>'}];
  const inspection={captions:[{id:'s0',text:'Make an HTML page',start:0}],frames:[{id:'v1',timestamp:1,artifactVerified:true,appearance:'incorrect dark editor observation'}]};
  const model=async(name)=>{
    calls.push(name);
    if(name.startsWith('source-requirements'))return JSON.stringify({summary:'Make the source page',requirements:[{description:'HTML authoring',capability:'local-authoring',required:true,segment_id:'s0'}],steps:[{action:'Make the page',required:true,segment_id:'s0'}],creatorEntry:'m0'});
    if(name.startsWith('source-operations'))return JSON.stringify({steps:[{action:'Make the page',required:true,segment_id:'s0'}]});
    if(name.startsWith('source-creator-entry'))return '{"creatorEntry":"m0"}';
    throw Error('Unexpected guessing of measured source: '+name);
  };
  const inspectCreator=async(entry)=>{
    assert.equal(entry,files[0]);
    return {content:[{selector:'p',text:'Original source'}],structure:[{selector:'p',minimum:1}],styles:[{selector:'p',property:'color',value:'rgb(0, 0, 0)'}]};
  };
  const plan=await analyzeSourceContract({metadata:{title:'Controlled tutorial'}},inspection,{files},{model,inspectCreator});
  assert.equal(plan.supported,true);
  assert.equal(plan.content[0].text,'Original source');
  assert.equal(plan.content[0].sourceKind,'creator-material');
  assert.ok(plan.requirements.some(r=>r.capability==='html'&&r.segment_id==='m0'));
  assert.deepEqual(calls,['source-requirements-0','source-operations-0','source-creator-entry-0']);
});
