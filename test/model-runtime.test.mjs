import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec = promisify(execFile);
test('an imported Gemma 4 alias uses raw formatted inference end to end', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'skillwalk-model-'));
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body=''; for await (const chunk of req) body+=chunk;
    requests.push({url:req.url,body:JSON.parse(body)});
    res.setHeader('content-type','application/json');
    if(req.url==='/api/show') res.end(JSON.stringify({details:{family:'gemma4'},template:'{{ .Prompt }}',capabilities:['completion']}));
    else if(req.url==='/api/generate') res.end(JSON.stringify({response:'{"answer":"controlled fixture"}',done:true}));
    else {res.statusCode=400;res.end(JSON.stringify({error:'Incorrect chat endpoint'}));}
  });
  try {
    await fs.cp(path.resolve(import.meta.dirname,'../src'), path.join(dir,'src'), {recursive:true});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    const base='http://127.0.0.1:'+server.address().port;
    const code=`import {callModel} from ${JSON.stringify(pathToFileURL(path.join(dir,'src/model.mjs')).href)}; console.log(await callModel('controlled-format',[{role:'system',content:'Return JSON'},{role:'user',content:'Fixture'}],{predict:30}));`;
    const result=await exec(process.execPath,['--input-type=module','-e',code],{env:{...process.env,OLLAMA_BASE:base,OLLAMA_TEXT_BASE:base,GEMMA_TEXT_MODEL:'controlled-gemma',SKILLWALK_LIVE:'0',SKILLWALK_STOP_FILE:''},windowsHide:true});
    assert.match(result.stdout,/controlled fixture/);
    const generated=requests.find(r=>r.url==='/api/generate').body;
    assert.equal(generated.raw,true);assert.match(generated.prompt,/^<\|turn>system\nReturn JSON<turn\|>/);
    assert.equal(generated.messages,undefined);assert.equal(requests.some(r=>r.url==='/api/chat'),false);
  } finally {
    await new Promise(resolve=>server.close(resolve));
    assert.ok(dir.startsWith(path.resolve(os.tmpdir())+path.sep));await fs.rm(dir,{recursive:true,force:true});
  }
});
