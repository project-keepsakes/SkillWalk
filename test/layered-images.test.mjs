import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {validLayeredResult,compareLayeredImages} from '../src/layered-images.mjs';

test('layered verdict rejects uncertainty and contradictory success',()=>{
 const value={scope:'selected-source-crop-only',passed:true,content:{status:'passed'},appearance:{status:'passed'}};
 assert.equal(validLayeredResult(value),true);
 for(const changed of [{...value,passed:'true'},{...value,content:{status:'unverified'}},{...value,appearance:{status:'unknown'}}])assert.equal(validLayeredResult(changed),false);
});
test('missing tools fail closed and never pull an image or call a model',async()=>{
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'skillwalk-layered-test-'));
 try{
  const file=path.join(directory,'image.png');await fs.writeFile(file,'fixture');
  const calls=[];
  const result=await compareLayeredImages({reference:file,creator:file,candidate:file,browserText:'Visible'},directory,{execute:async(bin,args)=>{calls.push(args);throw Error('Tool unavailable');}});
  assert.equal(result.passed,false);assert.equal(result.content.status,'unverified');
  assert.ok(calls[0].includes('never'));assert.ok(calls[0].includes('none'));assert.equal(calls.length,2);
  assert.ok(result.identities.reference);assert.ok(result.browserTextHash);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
