import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {artifacts,sha256} from '../src/util.mjs';
import {reviewCodeFirst} from '../src/code-first-visual.mjs';

test('successful crop layers preserve unverified coverage and never become tutorial success',async()=>{
 const sources=path.join(artifacts,'sources');await fs.mkdir(sources,{recursive:true});
 const directory=await fs.mkdtemp(path.join(sources,'layer'));
 try{
  for(const name of ['original.jpg','crop.jpg','source.png','output.png'])await fs.writeFile(path.join(directory,name),'fixture');
  const hash=sha256('fixture'),state={id:'v1',frameHash:hash,cropHash:hash,viewport:{width:600,height:400},actions:[],observations:[{selector:'body',text:'Text'}],uncertain:false,explanation:'Controlled state'};
  const frame={id:'v1',file:'original.jpg',artifactFile:'crop.jpg',artifactBounds:{x:0,y:0,width:500,height:1000}};
  const image={screenshot:'source.png',screenshotHash:hash,snapshot:[{tag:'BODY',text:'Text'}]};
  const matched={passed:true,states:[{...state,passed:true,source:image,output:{...image,screenshot:'output.png'}}]};
  const report=await reviewCodeFirst({replayStates:[state]},{sourceId:path.basename(directory),frames:[frame]},directory,directory,{
   replay:async()=>matched,adjacent:async()=>({frames:[]}),
   compare:async()=>({passed:true,content:{status:'passed'},appearance:{status:'passed'},temporal:{status:'passed'}}),
   model:()=>{throw Error('No model calls permitted');}
  });
  assert.equal(report.passed,false);assert.equal(report.frames[0].comparison.passed,true);
  assert.equal(report.frames[0].layers.coverage.status,'unverified');
  assert.match(report.differences[0],/coverage=unverified/);
 }finally{await fs.rm(directory,{recursive:true,force:true});}
});
