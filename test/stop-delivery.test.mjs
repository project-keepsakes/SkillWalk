import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LocalRun} from '../src/ui-runner.mjs';
import {FrontendRun} from '../src/frontend-run.mjs';
import {deliverCheckedResult} from '../src/result-delivery.mjs';
import {sha256} from '../src/util.mjs';
async function folder(fn){
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-stop-'));
 try{await fn(dir);}finally{assert.ok(path.resolve(dir).startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});}
}
test('Stop during the final visual check prevents delivery in both retained adapters',async t=>{
 for(const website of [false,true])for(const prior of [false,true])await t.test((website?'website':'presentation')+(prior?' preserves prior proof':' has no new proof'),()=>folder(async dir=>{
  const run=website?new FrontendRun('stop-fixture'):new LocalRun('stop-fixture');run.dir=dir;
  await fs.mkdir(path.join(dir,'output'));await fs.mkdir(path.join(dir,'verification'));
  const html='<!doctype html><html><body>Controlled original</body></html>',hash=sha256(html);
  await fs.writeFile(path.join(dir,'output',website?'website.html':'presentation.html'),html);
  await fs.writeFile(path.join(dir,'output',website?'website-generation.json':'generation.json'),JSON.stringify(website?{websiteHash:hash}:{presentationHash:hash}));
  await fs.writeFile(path.join(dir,'verification',website?'website-report.json':'browser-report.json'),JSON.stringify({passed:true,presentationHash:hash,checks:['Controlled check']}));
  const proof=JSON.stringify({passed:true,presentationHash:hash,checks:['Prior checked result']});
  if(prior)await fs.writeFile(path.join(dir,'result.json'),proof);
  run.step=async script=>{if(script===(website?'website-visual-review.mjs':'visual-review.mjs'))run.stopping=true;return{code:0};};
  let failure;try{await run.verifyAndRepair();}catch(e){failure=e;run.fail(e);}
  assert.match(failure?.message||'',/Stopped/);assert.equal(run.status,'stopped');
  assert.equal(run.events.some(e=>e.type==='state'&&e.status==='complete'),false);
  if(prior)assert.equal(await fs.readFile(path.join(dir,'result.json'),'utf8'),proof);
  else await assert.rejects(()=>fs.access(path.join(dir,'result.json')),/ENOENT/);
 }));
});
test('Stop during proof preparation preserves the prior checked result and removes staging',()=>folder(async dir=>{
 const run=new LocalRun('staging-stop');run.dir=dir;const prior='{"passed":true,"label":"previous"}';await fs.writeFile(path.join(dir,'result.json'),prior);
 await assert.rejects(()=>deliverCheckedResult(run,{passed:true,checks:['new']},'Ready',{writeFile:async(...args)=>{await fs.writeFile(...args);run.stopping=true;}}),/Stopped/);
 assert.equal(await fs.readFile(path.join(dir,'result.json'),'utf8'),prior);assert.deepEqual(await fs.readdir(dir),['result.json']);assert.notEqual(run.status,'complete');
}));
test('Stop before delivery and commit failure never replace prior proof',()=>folder(async dir=>{
 const run=new LocalRun('delivery-stop');run.dir=dir;const prior='{"passed":true,"label":"previous"}';await fs.writeFile(path.join(dir,'result.json'),prior);
 run.stopping=true;await assert.rejects(()=>deliverCheckedResult(run,{passed:true},'Ready'),/Stopped/);
 run.stopping=false;await assert.rejects(()=>deliverCheckedResult(run,{passed:true},'Ready',{commit:()=>{throw Error('Controlled commit failure');}}),/Controlled commit failure/);
 assert.equal(await fs.readFile(path.join(dir,'result.json'),'utf8'),prior);assert.deepEqual(await fs.readdir(dir),['result.json']);assert.notEqual(run.status,'complete');
}));
test('successful delivery commits the same proof and completion once',()=>folder(async dir=>{
 const run=new LocalRun('delivery-success');run.dir=dir;run.failure='Earlier repaired overflow';const proof={passed:true,checks:['Verified original bytes']};
 await deliverCheckedResult(run,proof,'Ready');
 assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir,'result.json'))),proof);
 assert.equal(run.status,'complete');assert.equal(run.failure,null);assert.equal(run.events.find(e=>e.status==='complete').failure,null);assert.deepEqual(run.checks,proof.checks);assert.equal(run.events.filter(e=>e.status==='complete').length,1);
}));

test('delivery cleanup never removes a staging path it did not create',()=>folder(async dir=>{
 const run=new LocalRun('unowned-staging');run.dir=dir;let collision;
 await assert.rejects(()=>deliverCheckedResult(run,{passed:true},'Ready',{openFile:async file=>{collision=file;await fs.writeFile(file,'unowned fixture',{flag:'wx'});throw Object.assign(Error('Controlled collision'),{code:'EEXIST'});}}),/Controlled collision/);
 assert.equal(await fs.readFile(collision,'utf8'),'unowned fixture');assert.notEqual(run.status,'complete');
}));
test('failed proof preparation removes only owned staging and preserves checked bytes',()=>folder(async dir=>{
 const run=new LocalRun('write-failure');run.dir=dir;await fs.writeFile(path.join(dir,'result.json'),'prior checked bytes');
 await assert.rejects(()=>deliverCheckedResult(run,{passed:true},'Ready',{writeFile:async(handle,bytes)=>{await handle.writeFile(bytes);throw Error('Controlled write failure');}}),/Controlled write failure/);
 assert.equal(await fs.readFile(path.join(dir,'result.json'),'utf8'),'prior checked bytes');assert.deepEqual(await fs.readdir(dir),['result.json']);
}));

test('both retained adapters still deliver successfully with matching checked hashes',async()=>{
 for(const website of [false,true])await folder(async dir=>{
  const run=website?new FrontendRun('normal-delivery'):new LocalRun('normal-delivery');run.dir=dir;
  await fs.mkdir(path.join(dir,'output'));await fs.mkdir(path.join(dir,'verification'));
  const html='<!doctype html><html><body>Checked original</body></html>',hash=sha256(html);
  await fs.writeFile(path.join(dir,'output',website?'website.html':'presentation.html'),html);
  await fs.writeFile(path.join(dir,'output',website?'website-generation.json':'generation.json'),JSON.stringify(website?{websiteHash:hash}:{presentationHash:hash}));
  await fs.writeFile(path.join(dir,'verification',website?'website-report.json':'browser-report.json'),JSON.stringify({passed:true,presentationHash:hash,checks:['Controlled final check']}));
  run.step=async()=>({code:0});await run.verifyAndRepair();
  const proof=JSON.parse(await fs.readFile(path.join(dir,'result.json')));assert.equal(run.status,'complete');assert.equal(proof.presentationHash,hash);assert.deepEqual(run.checks,['Controlled final check']);
 });
});
