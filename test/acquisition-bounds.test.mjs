import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAcquisitionMetadata,acquisitionFrameTimes} from '../src/acquire.mjs';
import {frameTimes,originalId} from '../src/tutorials.mjs';
import fs from 'node:fs/promises';

test('source duration is checked before video acquisition', () => {
  for (const duration of [0, 19, 3601, NaN, null]) {
    assert.throws(() => validateAcquisitionMetadata({duration}), /20 seconds and one hour/);
  }
  for (const duration of [20, 3600]) assert.doesNotThrow(() => validateAcquisitionMetadata({duration}));
});

test('fresh presentation sampling supplies the frames consumed by proof analysis', async () => {
  const proof=await fs.readFile(new URL('../src/proof.mjs',import.meta.url),'utf8');
  const required=[...new Set([...proof.matchAll(/'f(\d+)'/g)].map(m=>Number(m[1])))];
  assert.deepEqual(required,[116,146,198]);
  const segments=[0,40,260,380,540].map(start=>({start,text:'design skill'}));
  const old=frameTimes(segments,700);
  assert.ok(required.every(t=>!old.includes(t)), 'negative control reproduces old missing-frame contract');
  const actual=acquisitionFrameTimes(originalId,segments,700);
  assert.ok(required.every(t=>actual.includes(t)));
  assert.ok(old.every(t=>actual.includes(t)), 'retain generic observations');
  assert.deepEqual(acquisitionFrameTimes('nkluXCISryk',segments,700),old);
});
