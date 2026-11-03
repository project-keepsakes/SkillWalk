import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceFields} from '../src/source-fields.mjs';
test('style extraction cannot silently remove source requirements or operations',()=>{
  const plan={requirements:[{capability:'unavailable'}],steps:[{action:'Required source operation'}]};
  Object.assign(plan,sourceFields({styles:[],requirements:[],steps:[],supported:true},['styles']));
  assert.deepEqual(plan.requirements,[{capability:'unavailable'}]);
  assert.deepEqual(plan.steps,[{action:'Required source operation'}]);assert.equal(plan.supported,undefined);
  assert.throws(()=>sourceFields({requirements:[]},['styles']),/Missing/);
});
