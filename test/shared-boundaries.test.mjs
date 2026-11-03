import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {LocalRun} from '../src/ui-runner.mjs';
import {DocumentRun} from '../src/document-run.mjs';
import {documentAppFiles} from '../src/document-integrity.mjs';
import {checkStopBoundary} from '../src/stop-boundary.mjs';
import {contractPromptData} from '../src/contract-prompt.mjs';
import {sha256} from '../src/util.mjs';

test('model operation boundaries honor Stop before any next inference', async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-stop-'));
  const previous=process.env.SKILLWALK_STOP_FILE;
  process.env.SKILLWALK_STOP_FILE=path.join(directory,'stop-requested');
  try {
    await checkStopBoundary();
    await fs.writeFile(process.env.SKILLWALK_STOP_FILE,'stop');
    await assert.rejects(checkStopBoundary,/Stopped/);
  } finally {
    if(previous===undefined)delete process.env.SKILLWALK_STOP_FILE;else process.env.SKILLWALK_STOP_FILE=previous;
    assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(directory,{recursive:true,force:true});
  }
});

test('Stop arriving while a step clears its old marker prevents child launch', async()=>{
  const run=new LocalRun('controlled-stop-race');
  const original=fs.rm;
  fs.rm=async()=>{run.stopping=true;};
  try {await assert.rejects(()=>run.step('nonexistent-controlled-child.mjs'),/Stopped/);}
  finally {fs.rm=original;}
});

test('delivered document result includes source outcome verification added by subprocess', async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-source-result-'));
  const run=new DocumentRun('controlled-source-result');run.dir=directory;
  try {
    await fs.mkdir(path.join(directory,'output/app'),{recursive:true});await fs.mkdir(path.join(directory,'document-data'));
    for(const name of documentAppFiles)await fs.writeFile(path.join(directory,'output/app',name),'{}');
    const report={passed:true,checks:['Runtime checked'],documentHash:'fixture',configurationHash:sha256('{}')};
    await fs.writeFile(path.join(directory,'document-data/extraction.json'),JSON.stringify(report));
    const reportPath=path.join(directory,'document-data/browser-report.json');
    await fs.writeFile(reportPath,JSON.stringify(report));
    run.step=async()=>({code:0});
    run.verifySourceOutcome=async()=>{report.checks.push('Source outcome checked');await fs.writeFile(reportPath,JSON.stringify(report));};
    run.runtime={start:async()=>{},bundle:async()=>fs.writeFile(path.join(directory,'output',run.artifactName),'controlled zip')};
    await run.verifyAndRepair();
    const result=JSON.parse(await fs.readFile(path.join(directory,'result.json')));
    assert.ok(result.checks.includes('Source outcome checked'));assert.equal(run.status,'complete');
  } finally {assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});

test('inference contract retains assertions without repeating full provenance for each item',()=>{
  const plan={content:[{text:'literal',segment_id:'v1',quote:'long original evidence'}],referenceFrames:['v1']};
  assert.deepEqual(contractPromptData(plan),{content:[{text:'literal',segment_id:'v1'}],referenceFrames:['v1']});
  assert.equal(plan.content[0].quote,'long original evidence');
});


test('document source review cannot omit steps or substitute invented verdict indexes',async()=>{
  const {documentSourcePassed}=await import('../src/source-review-verdict.mjs');
  const plan={requirements:[{}],steps:[{}]},verdict={index:0,met:true,evidence:'measured operation'};
  const review={uncertain:false,stylingMatches:true,missingOperations:[],requirements:[verdict],steps:[verdict]};
  assert.equal(documentSourcePassed(review,plan),true);
  assert.equal(documentSourcePassed({...review,steps:[]},plan),false);
  assert.equal(documentSourcePassed({...review,requirements:[{...verdict,index:2}]},plan),false);
  assert.equal(documentSourcePassed({...review,steps:[{...verdict,met:false}]},plan),false);
});
