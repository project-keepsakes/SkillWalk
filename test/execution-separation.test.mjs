import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {GenericRun} from '../src/generic-run.mjs';
import {json,sha256} from '../src/util.mjs';

test('failed fidelity preserves successful execution and never regenerates the artifact',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-separation-'));
 try{
  await fs.mkdir(path.join(dir,'output'));await fs.mkdir(path.join(dir,'verification'));
  const run=new GenericRun('separation',()=>{},'abcdefghijk');run.dir=dir;
  const html='<html><body>Checked content</body></html>',hash=sha256(html),calls=[];
  run.step=async name=>{
   calls.push(name);
   if(name==='generic-proof.mjs'){await fs.writeFile(path.join(dir,'output/website.html'),html);return {code:0};}
   if(name==='verify-generic.mjs'){await json(path.join(dir,'verification/generic-report.json'),{passed:true,artifactHash:hash,checks:['Real contract fixture']});return {code:0};}
   await json(path.join(dir,'verification/source-fidelity.json'),{passed:false,uncertain:true,artifactHash:hash});return {code:1};
  };
  await assert.rejects(()=>run.execute(),/Execution passed; source verification/);
  assert.deepEqual(calls,['generic-proof.mjs','verify-generic.mjs','visual-contract-review.mjs']);
  assert.equal(await fs.readFile(path.join(dir,'output/website.html'),'utf8'),html);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'verification/execution-report.json'))).passed,true);
  assert.equal(JSON.parse(await fs.readFile(path.join(dir,'verification/verification-report.json'))).passed,false);
  await assert.rejects(()=>fs.access(path.join(dir,'result.json')));
 }finally{assert.ok(dir.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});}
});
