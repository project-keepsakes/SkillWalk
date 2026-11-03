import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {compatibilityFor,documentId,reviewedTutorial,tutorials} from '../src/tutorials.mjs';
import {executionInfo,stagesFor,stageFor} from '../src/workspace.mjs';
import {documentActionSignals} from '../src/document-evidence.mjs';
import {checkDocumentAnswer,hasInventedSampleDates} from '../src/document-answers.mjs';
import {validateBridgeRequest,DocumentBroker} from '../src/document-broker.mjs';
import {DocumentRun} from '../src/document-run.mjs';
import {LocalRun} from '../src/ui-runner.mjs';
test('document is featured without retiring existing tutorials; custom URLs are honestly unreviewed',()=>{
 assert.equal(tutorials[0].id,documentId);assert.equal(tutorials.length,3);
 assert.equal(reviewedTutorial('372Iksaz8b0').kind,'presentation');assert.equal(reviewedTutorial('DVlHZufvP10').kind,'website');
 assert.equal(compatibilityFor('abcdefghijk').available,true);assert.match(compatibilityFor('abcdefghijk').message,/actual source requirements/);
 assert.match(compatibilityFor('372Iksaz8b0').message,/Claude/);assert.match(compatibilityFor(documentId).message,/27B/);
});
test('document execution metadata never becomes a slide workflow or cover-repair stage',()=>{
 const info=executionInfo('document');assert.equal(info.sourceId,documentId);assert.match(info.output,/PDF/);assert.equal(info.model,'gemma3:4b');
 assert.equal(stagesFor('document').some(s=>s.id==='draft'),false);assert.equal(stageFor({kind:'document',status:'repairing',choice:null}),'verify');
});
test('source setup citation cannot match amazing',()=>{assert.equal(documentActionSignals.setup_runtime.test('the result was amazing'),false);assert.equal(documentActionSignals.setup_runtime.test('ollama pull gemma3:27b'),true);});
test('comparison verification rejects reversed conclusions and demands chart and table evidence',()=>{
 const evidence=[{kind:'Gemma description of Table'},{kind:'Gemma description of Image'}];
 assert.equal(checkDocumentAnswer(1,{answer:'The United States has 332 million and Egypt has 104 million. The United States has the larger population.',evidence}),true);
 assert.equal(checkDocumentAnswer(1,{answer:'Egypt has a larger population than the United States.',evidence}),false);
 assert.equal(checkDocumentAnswer(1,{answer:'Egypt has 104 million and the United States has 332 million. Egypt has a larger population than the United States.',evidence}),false);
 assert.equal(checkDocumentAnswer(1,{answer:'The United States has 332 million and Egypt has 104 million. The United States has the larger population.',evidence:[evidence[0]]}),false);
});
test('document broker rejects arbitrary routes, remote model IDs, methods and image payloads',()=>{
 for(const r of [{method:'POST',path:'/api/pull',body:{model:'gemma3:4b'}},{method:'GET',path:'/api/chat',body:{model:'gemma3:4b'}},{method:'POST',path:'/api/generate',body:{model:'claude'}},{method:'POST',path:'/api/generate',body:{model:'gemma3:4b',images:['file:///secrets']}}])assert.throws(()=>validateBridgeRequest(r));
 assert.doesNotThrow(()=>validateBridgeRequest({method:'POST',path:'/api/embed',body:{model:'embeddinggemma',input:['local chunk']}}));
});
test('broker shutdown stops forwarding queued requests',async()=>{
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-broker-'));assert.ok(folder.startsWith(path.resolve(os.tmpdir())+path.sep));
 const broker=new DocumentBroker(folder);let count=0;
 broker.forward=async()=>{count++;await broker.close();return{status:200,body:{done:true}};};
 try{for(const id of ['a'.repeat(32),'b'.repeat(32)])await fs.writeFile(path.join(folder,id+'.request.json'),JSON.stringify({method:'POST',path:'/api/generate',body:{model:'gemma3:4b',prompt:'fixture'}}));await broker.poll();assert.equal(count,1);}finally{await broker.close();await fs.rm(folder,{recursive:true,force:true});}
});
test('Stop during successful document check prevents bundle and completion',async()=>{
 const run=new DocumentRun('document-stop-fixture');let closed=0,bundled=0;
 run.runtime={start:async()=>{},stop:async()=>{closed++;},bundle:async()=>{bundled++;}};
 run.step=async()=>{run.stopping=true;return{code:0};};
 await assert.rejects(()=>run.verifyAndRepair(),/Stopped/);assert.equal(closed,1);assert.equal(bundled,0);assert.notEqual(run.status,'complete');
});
test('failed document runs initiate runtime cleanup',async()=>{const run=new DocumentRun('document-cleanup-fixture');let closed=false;run.runtime={stop:async()=>{closed=true;}};run.fail(Error('Controlled failure'));await new Promise(r=>setImmediate(r));assert.equal(closed,true);assert.equal(run.status,'failed');});
test('late manual direction cannot win over server deadline',async()=>{
 const run=new LocalRun('late-choice-fixture');assert.equal(run.styleAutoDelayMs,7000);run.styleAutoDelayMs=10000;run.previews=[{id:'paper',name:'Default',recommended:true},{id:'block-frame',name:'Other'}];const waiting=run.waitForChoice();run.choiceDeadline=Date.now()-1;
 assert.throws(()=>run.choose('block-frame'),/window has closed/);await waiting;assert.equal(run.choice,'paper');assert.equal(run.choiceMode,'automatic');assert.equal(run.events.filter(e=>e.type==='style-selected').length,1);
});

test('sample fidelity detects dates invented inside image descriptions',()=>{assert.equal(hasInventedSampleDates([{figure:'figure-1-1.jpg',text:'Germany (2020): 82 million'}]),true);assert.equal(hasInventedSampleDates([{figure:'figure-1-1.jpg',text:'Germany: about 80 million'}]),false);});

test('runtime Stop waits for pending startup and leaves no running instance',async()=>{
 const {DocumentRuntime}=await import('../src/document-runtime.mjs');
 const runtime=new DocumentRuntime({id:'startup-fixture',dir:path.join(os.tmpdir(),'skillwalk-startup-fixture')});
 let release;const gate=new Promise(r=>release=r);let cleaned=false;
 runtime.startOnce=async()=>{await gate;runtime.running=true;};
 runtime.stopOnce=async()=>{runtime.running=false;cleaned=true;};
 const started=runtime.start();const stopped=runtime.stop();
 assert.equal(cleaned,false);release();await Promise.all([started,stopped]);
 assert.equal(cleaned,true);assert.equal(runtime.running,false);
});

test('correct concise answer need not repeat the question subject',()=>{assert.equal(checkDocumentAnswer(0,{answer:'Approximately 80 million people.',evidence:[{kind:'Gemma description of Image',text:'Germany: approximately 80 million'}]}),true);});

test('checked app rejects changed configuration before reopening',async()=>{
 const {appManifest,verifyAppManifest,documentAppFiles}=await import('../src/document-integrity.mjs');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-integrity-'));assert.ok(folder.startsWith(path.resolve(os.tmpdir())+path.sep));
 try{for(const name of documentAppFiles)await fs.writeFile(path.join(folder,name),'controlled '+name);const manifest=await appManifest(folder);await verifyAppManifest(folder,manifest);await fs.writeFile(path.join(folder,'config.json'),'changed instructions');await assert.rejects(()=>verifyAppManifest(folder,manifest),/changed after verification/);}finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('Analyze reserves ownership during previous cleanup and persistence',async()=>{
 const {createApp}=await import('../src/server.mjs');
 let releaseSave,releaseClose,created=0;
 const saveGate=new Promise(r=>releaseSave=r),closeGate=new Promise(r=>releaseClose=r);
 class ControlledRun extends LocalRun{
  constructor(id,notify){super(id,notify);this.number=++created;}
  async analyze(){this.status='review';}
  async saveWorkspace(){if(this.number===1)await saveGate;}
  async close(){if(this.number===1)await closeGate;}
 }
 const app=createApp({restore:false,runFactory:(_,id,notify)=>new ControlledRun(id,notify)});
 await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;
 try{
  const html=await(await fetch(origin)).text(),token=html.match(/name="skillwalk-token" content="([a-f0-9]+)"/)[1];
  const headers={origin,'x-skillwalk-token':token,'content-type':'application/json'};
  const analyze=()=>fetch(origin+'/api/analyze',{method:'POST',headers,body:JSON.stringify({url:'https://youtu.be/372Iksaz8b0'})});
  assert.equal((await analyze()).status,202);assert.equal((await analyze()).status,409,'persistence must retain busy');
  releaseSave();for(let i=0;i<30;i++){if(!(await(await fetch(origin+'/api/state')).json()).busy)break;await new Promise(r=>setTimeout(r,5));}
  const second=analyze();for(let i=0;i<30;i++){if((await(await fetch(origin+'/api/state')).json()).busy)break;await new Promise(r=>setTimeout(r,5));}
  assert.equal((await analyze()).status,409,'cleanup must reserve busy before awaiting');releaseClose();assert.equal((await second).status,202);assert.equal(created,2);
 }finally{releaseSave();releaseClose();await new Promise(r=>app.close(r));}
});

test('working uploads cannot change sealed checked evidence',async()=>{
 const {sealDocumentEvidence,verifySealedEvidence}=await import('../src/document-integrity.mjs');
 const {sha256}=await import('../src/util.mjs');
 const folder=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-sealed-'));assert.ok(folder.startsWith(path.resolve(os.tmpdir())+path.sep));
 try{
  await fs.mkdir(path.join(folder,'document-data'));await fs.mkdir(path.join(folder,'output/app'),{recursive:true});
  const config='{"controlled":true}',configurationHash=sha256(config),record={passed:true,documentHash:'sample-fixture',configurationHash};
  await fs.writeFile(path.join(folder,'output/app/config.json'),config);
  for(const name of ['browser-report.json','extraction.json'])await fs.writeFile(path.join(folder,'document-data',name),JSON.stringify(record));
  const proof=await sealDocumentEvidence(folder);await verifySealedEvidence(folder,proof);
  await fs.writeFile(path.join(folder,'document-data/extraction.json'),'user-upload working state');await verifySealedEvidence(folder,proof);
  await fs.writeFile(path.join(folder,'verification/document-extraction.json'),'changed checked record');await assert.rejects(()=>verifySealedEvidence(folder,proof),/changed after verification/);
 }finally{await fs.rm(folder,{recursive:true,force:true});}
});
test('local shutdown closes a connected event stream',async()=>{
 const {createApp}=await import('../src/server.mjs');const app=createApp({restore:false});await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;
 const response=await fetch(origin+'/api/events'),reader=response.body.getReader();await reader.read();await app.shutdown();assert.equal(app.listening,false);await reader.cancel();
});

test('chart answer cannot pass just by mentioning the expected number while denying the population answer',()=>{
 const evidence=[{kind:'Gemma description of Image',text:'Germany: 80 million'}];
 assert.equal(checkDocumentAnswer(0,{answer:'The chart shows the tourism receipts of Germany, not its population. Germany has a bar reaching 80 million. I do not know the population of Germany.',evidence}),false);
 assert.equal(checkDocumentAnswer(0,{answer:'I do not know the population. A value of 80 million is shown.',evidence}),false);
 assert.equal(checkDocumentAnswer(0,{answer:'Germany has approximately 80 million people. I do not know the year.',evidence}),true);
});

test('featured recipes and unfamiliar execution have explicit separate routes',()=>{
 for(const entry of tutorials){const route=compatibilityFor(entry.id);assert.equal(route.kind,entry.kind);assert.equal(route.pipeline,'featured-v1');assert.equal(route.featured,true);}
 const route=compatibilityFor('abcdefghijk');assert.equal(route.kind,'generic');assert.equal(route.pipeline,'shared-v1');assert.equal(route.featured,false);
});

test('supported document answers cannot append an unqualified refusal',()=>{
 const evidence=[{kind:'Gemma description of Image',text:'Germany 80 million; Egypt 100 million'},{kind:'Table',text:'United States 332 million'}];
 assert.equal(checkDocumentAnswer(0,{answer:'Germany has 80 million people. I do not know.',evidence}),false);
 const answer='United States has 332 million people. Egypt has 100 million. United States has a larger population than Egypt.';
 assert.equal(checkDocumentAnswer(1,{answer,evidence}),true);
 assert.equal(checkDocumentAnswer(1,{answer:answer+' I do not know.',evidence}),false);
 assert.equal(checkDocumentAnswer(0,{answer:'Germany has 80 million people. I do not know the year.',evidence}),true);
});
