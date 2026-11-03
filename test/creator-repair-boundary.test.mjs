import {sha256} from '../src/util.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
test('a wrong selected creator implementation cannot repair away approved source checks',async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-creator-boundary-'));
  try {
    await fs.cp(path.resolve(import.meta.dirname,'../src'),path.join(directory,'src'),{recursive:true});
    const output=path.join(directory,'.artifacts/experiments/controlled/output');await fs.mkdir(output,{recursive:true});
    const source=path.join(directory,'.artifacts/sources/abcdefghijk');await fs.mkdir(source,{recursive:true});
    const plan=JSON.stringify({creatorEntry:'m0',content:[{text:'Required source result',selector:'p',segment_id:'s0'}]});
    const wrong='<!doctype html><html><head><title>Wrong example</title></head><body><p>Unrelated result</p></body></html>';
    for(const [name,value] of Object.entries({'plan.json':plan,'source-inspection.json':'{"frames":[]}', 'creator-materials.json':JSON.stringify({files:[{id:'m0',name:'index.html',text:wrong,collection:'controlled',revision:'fixed',sha256:sha256(wrong)}]})}))await fs.writeFile(path.join(output,name),value);
    await fs.writeFile(path.join(output,'code-first.json'),JSON.stringify({htmlHash:sha256(wrong)}));
    await fs.writeFile(path.join(output,'website.html'),wrong);
    await fs.writeFile(path.join(source,'evidence.json'),JSON.stringify({metadata:{id:'abcdefghijk'},segments:[]}));
    await assert.rejects(()=>exec(process.execPath,['src/generic-proof.mjs','generate'],{cwd:directory,windowsHide:true,env:{...process.env,PROOF_RUN:'controlled',TUTORIAL_VIDEO_ID:'abcdefghijk',SKILLWALK_REPAIR_FEEDBACK:'Missing required source result',OLLAMA_BASE:'http://127.0.0.1:9',OLLAMA_TEXT_BASE:'http://127.0.0.1:9'}}),/checks were not changed/);
    assert.equal(await fs.readFile(path.join(output,'plan.json'),'utf8'),plan);
    assert.equal(await fs.readFile(path.join(output,'website.html'),'utf8'),wrong);
    await assert.rejects(()=>fs.access(path.join(output,'generic-generation.json')));
  } finally {assert.ok(directory.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(directory,{recursive:true,force:true});}
});
