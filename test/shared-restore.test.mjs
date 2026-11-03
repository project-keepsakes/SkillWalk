import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';

test('completed historical experimental document cannot reopen or restart',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-release-'));let app,opened=false;
 try{
  for(const name of ['src','web'])await fs.cp(path.resolve(import.meta.dirname,'..',name),path.join(dir,name),{recursive:true});
  const id='live-123456-ab12cd',runDir=path.join(dir,'.artifacts/experiments',id);
  await fs.mkdir(path.join(runDir,'output'),{recursive:true});
  await fs.writeFile(path.join(runDir,'output/plan.json'),'{}');
  await fs.writeFile(path.join(runDir,'output/document-app.zip'),'fixture');
  await fs.writeFile(path.join(runDir,'result.json'),JSON.stringify({passed:true,presentationHash:createHash('sha256').update('fixture').digest('hex')}));
  await fs.writeFile(path.join(dir,'.artifacts/last-run.json'),JSON.stringify({id,kind:'document',pipeline:'shared-v1',tutorialId:'abcdefghijk',status:'complete'}));
  const {createApp}=await import(pathToFileURL(path.join(dir,'src/server.mjs')).href);
  app=createApp({runFactory:()=>({id,dir:runDir,kind:'document',pipeline:'shared-v1',artifactName:'document-app.zip',configureArtifact(){},async restoreWorkspace(){},view(){return {id,status:this.status,kind:this.kind,pipeline:this.pipeline};},async openApp(){opened=true;}})});
  await new Promise(r=>app.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.address().port;
  const html=await(await fetch(origin)).text(),token=html.match(/name="skillwalk-token" content="([a-f0-9]+)"/)[1];
  assert.equal((await(await fetch(origin+'/api/state')).json()).run.status,'complete');
  for(const action of ['open-document','execute','retry'])assert.equal((await fetch(origin+'/api/'+action,{method:'POST',headers:{origin,'x-skillwalk-token':token,'content-type':'application/json'},body:JSON.stringify({id})})).status,422);
  assert.equal(opened,false);
 }finally{if(app)await app.shutdown();await fs.rm(dir,{recursive:true,force:true});}
});
test('a shared analysis failure before a plan exists survives restart', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillwalk-restore-'));
  let app;
  try {
    for (const name of ['src', 'web']) await fs.cp(path.resolve(import.meta.dirname, '..', name), path.join(dir, name), {recursive:true});
    await fs.mkdir(path.join(dir, '.artifacts'), {recursive:true});
    await fs.writeFile(path.join(dir, '.artifacts/last-run.json'), JSON.stringify({id:'live-123456-ab12cd', kind:'generic', pipeline:'shared-v1', tutorialId:'abcdefghijk', status:'failed', failure:'Source captions unavailable'}));
    const {createApp} = await import(pathToFileURL(path.join(dir, 'src/server.mjs')).href);
    app = createApp(); await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
    const state = await (await fetch('http://127.0.0.1:' + app.address().port + '/api/state')).json();
    assert.equal(state.run.status, 'failed'); assert.equal(state.run.failure, 'Source captions unavailable'); assert.equal(state.run.plan, null);
  } finally {
    if (app) await app.shutdown();
    assert.ok(dir.startsWith(path.resolve(os.tmpdir()) + path.sep));
    await fs.rm(dir, {recursive:true, force:true});
  }
});
