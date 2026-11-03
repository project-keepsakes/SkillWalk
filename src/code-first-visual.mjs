import fs from 'node:fs/promises';
import path from 'node:path';
import {compareMatchedStates} from './matched-states.mjs';
import {compareLayeredImages} from './layered-images.mjs';
import {adjacentSourceCrops,layeredDecision} from './layered-reference.mjs';
import {sourceFolder} from './tutorials.mjs';
import {sha256} from './util.mjs';
import {resolvedReplayEvidence} from './code-first.mjs';
export const comparisonPassed=r=>r?.matches===true&&r.uncertain===false&&Array.isArray(r.differences)&&r.differences.length===0&&['sourceDescription','outputDescription'].every(k=>typeof r[k]==='string'&&r[k].trim());

export async function reviewCodeFirst(plan,inspection,output,verification,{replay=compareMatchedStates,compare=compareLayeredImages,adjacent=adjacentSourceCrops}={}){
 const matched=await replay(output,verification);
 const review={passed:false,method:'offline-layered-v1',artifactHash:matched.artifactHash,contractHash:matched.contractHash,sourceHash:matched.sourceHash,matchedStates:matched,frames:[],differences:[]};
 if(!matched.passed){review.differences.push('Source implementation/output state replay failed; no video-fidelity verdict was attempted.');return review;}
 for(const state of plan.replayStates){
  const frame=inspection.frames.find(f=>f.id===state.id),result=matched.states.find(s=>s.id===state.id);
  if(!frame||!result?.passed)throw Error('Missing matched reference');
  const replayEvidence=resolvedReplayEvidence(state,result);
  const original=path.join(sourceFolder(inspection.sourceId),frame.file);
  const crop=path.join(sourceFolder(inspection.sourceId),frame.artifactFile);
  const generated=path.join(verification,result.output.screenshot);
  const creator=path.join(verification,result.source.screenshot);
  for(const [file,hash] of [[original,state.frameHash],[crop,state.cropHash],[generated,result.output.screenshotHash],[creator,result.source.screenshotHash]]){
   if(sha256(await fs.readFile(file))!==hash)throw Error('Matched visual evidence changed');
  }
  let neighbors={frames:[]},neighborError;
  try{neighbors=await adjacent(inspection.sourceId,frame,verification);}catch(error){neighborError=error.message;}
  const comparison=await compare({reference:crop,creator,candidate:generated,browserText:result.output.snapshot.find(e=>e.tag==='BODY')?.text,neighbors:neighbors.frames.map(f=>f.file)},verification);
  const coverage={status:'unverified',reason:'The selected crop is model-proposed. Image and OCR matching cannot establish that no tutorial application content was omitted outside it.',bounds:frame.artifactBounds};
  const temporal=comparison.temporal||{status:'unverified',reason:neighborError||'Temporal evidence unavailable'};
  const decision=layeredDecision({replay:{status:'passed'},content:comparison.content,appearance:comparison.appearance,temporal,coverage});
  const item={id:state.id,...replayEvidence,...decision,comparison,temporalReferences:neighbors,neighborError,frameHash:state.frameHash,cropHash:state.cropHash,outputScreenshotHash:result.output.screenshotHash};
  if(!item.passed)review.differences.push('Unresolved video layers for '+state.id+': '+Object.entries(decision.layers).filter(([,v])=>v?.status!=='passed').map(([k,v])=>k+'='+v?.status).join(', '));
  review.frames.push(item);
 }
 review.passed=review.frames.length>0&&review.frames.every(f=>f.passed===true);
 return review;
}
