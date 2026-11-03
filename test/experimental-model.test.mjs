import test from 'node:test';
import assert from 'node:assert/strict';
import {experimentalModelEnvironment} from '../src/experimental-model.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {GenericRun} from '../src/generic-run.mjs';
test('experimental model profile does not inherit the featured text alias', () => {
  const env = {OLLAMA_BASE:'http://127.0.0.1:11435', OLLAMA_TEXT_BASE:'http://127.0.0.1:11434', GEMMA_TEXT_MODEL:'local-gemma'};
  const selected = experimentalModelEnvironment(env);
  assert.equal(selected.GEMMA_TEXT_MODEL, 'gemma3:12b');
  assert.equal(selected.GEMMA_MODEL, selected.GEMMA_TEXT_MODEL);
  assert.equal(selected.OLLAMA_TEXT_BASE, env.OLLAMA_BASE);
  assert.equal(env.GEMMA_TEXT_MODEL, 'local-gemma');
});
test('experimental overrides remain local and explicit', () => {
  assert.equal(experimentalModelEnvironment({EXPERIMENTAL_GEMMA_MODEL:'gemma3:4b'}).GEMMA_MODEL, 'gemma3:4b');
  for (const base of ['https://example.com', 'http://example.com', 'http://user:secret@localhost:11434']) {
    assert.throws(() => experimentalModelEnvironment({EXPERIMENTAL_OLLAMA_BASE:base}), /local loopback/);
  }
});

import {validateBridgeRequest} from '../src/document-broker.mjs';
test('document broker admits only its trusted run model and unchanged embeddings',()=>{
 const request={method:'POST',path:'/api/generate',body:{model:'gemma3:12b',prompt:'test'}};
 assert.throws(()=>validateBridgeRequest(request),/Unapproved model/);
 assert.equal(validateBridgeRequest(request,'gemma3:12b'),request);
 assert.throws(()=>validateBridgeRequest({...request,body:{model:'gemma3:4b'}},'gemma3:12b'),/Unapproved model/);
 assert.doesNotThrow(()=>validateBridgeRequest({method:'POST',path:'/api/embed',body:{model:'embeddinggemma',input:'test'}},'gemma3:12b'));
});
test('retry and reopened document publish active models before doing new work', async()=>{
  for(const action of ['retry','openApp']) {
    const events=[];
    const run=new GenericRun('profile-label-'+action+'-'+Date.now(),e=>events.push(e),'abcdefghijk');
    run.kind='document'; run.status='complete';
    await fs.mkdir(run.dir,{recursive:true});
    await fs.writeFile(path.join(run.dir,'workspace.json'),JSON.stringify({kind:'document',models:{text:'local-gemma',vision:'gemma3:4b'}}));
    await run.restoreWorkspace();
    assert.equal(run.view().execution.visionModel,'gemma3:4b');
    const verify=()=>{
      assert.equal(run.view().execution.visionModel,run.modelEnvironment.GEMMA_MODEL);
      assert.equal(events.at(-1).execution.authoringModel,run.modelEnvironment.GEMMA_TEXT_MODEL);
    };
    run.execute=async()=>verify();
    run.verifyAndRepair=async()=>verify();
    run.runtime={start:async()=>verify(),appURL:'http://127.0.0.1:4180'};
    try {await run[action]();} finally {await fs.rm(run.dir,{recursive:true,force:true});}
  }
});
