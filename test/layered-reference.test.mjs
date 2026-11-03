import test from 'node:test';
import assert from 'node:assert/strict';
import {layeredDecision,adjacentSourceCrops} from '../src/layered-reference.mjs';
test('matching a crop cannot override uncertain coverage or temporal evidence',()=>{
 const passed={status:'passed'},layers={replay:passed,content:passed,appearance:passed,temporal:passed,coverage:passed};
 assert.equal(layeredDecision(layers).passed,true);
 for(const key of Object.keys(layers)){
  for(const status of ['failed','unverified','unknown'])assert.equal(layeredDecision({...layers,[key]:{status}}).passed,false);
 }
 assert.equal(layeredDecision({...layers,coverage:null}).passed,false);
});
test('temporal extraction refuses invalid timestamps before using tools',async()=>{
 for(const timestamp of [-1,NaN,Infinity,4000])await assert.rejects(adjacentSourceCrops('fixture',{timestamp},'.'),/timestamp/);
});
