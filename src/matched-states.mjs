import {sourceFolder} from './tutorials.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {ensureSandboxProfile} from './sandbox-profile.mjs';
import {validateReplayState} from './code-first.mjs';
import {root,outputDir,verificationDir,readJSON,sha256,json} from './util.mjs';
const exec=promisify(execFile);
export async function compareMatchedStates(output=outputDir,verification=verificationDir){
 const plan=await readJSON(path.join(output,'plan.json')),manifest=await readJSON(path.join(output,'code-first.json'));
 const sourceHash=sha256(await fs.readFile(path.join(output,'source-reference.html'))),artifactHash=sha256(await fs.readFile(path.join(output,'website.html'))),contractHash=sha256(await fs.readFile(path.join(output,'plan.json')));
 if(sourceHash!==manifest.htmlHash)throw Error('Pinned source reference changed');
 if(plan.replayButtons!==undefined&&(!Array.isArray(plan.replayButtons)||plan.replayButtons.length>8||plan.replayButtons.some(b=>typeof b!=='string'||!b.trim()||b.length>120)))throw Error('Invalid source replay controls');
 const selectors=plan.content.map(c=>c.selector);
 if(!Array.isArray(plan.replayStates)||!plan.replayStates.length||plan.replayStates.length>2)throw Error('Invalid replay count');
 for(const state of plan.replayStates){validateReplayState(state,selectors);if(!/^v\d+$/.test(state.id)||!plan.referenceFrames.includes(state.id)||!['width','height'].every(k=>Number.isInteger(state.viewport?.[k])&&state.viewport[k]>=100&&state.viewport[k]<=1920))throw Error('Invalid source viewport or identity');}
 if(plan.sourceVideoId){
  const inspection=await readJSON(path.join(output,'source-inspection.json'));
  if(inspection.sourceId!==plan.sourceVideoId)throw Error('Source video identity mismatch');
  for(const state of plan.replayStates){
   const frame=inspection.frames.find(f=>f.id===state.id);
   if(!frame?.artifactVerified||!/^inspection-v2\/artifact-\d+-[a-f0-9]+\.jpg$/.test(frame.artifactFile))throw Error('Invalid source crop');
   const bytes=await fs.readFile(path.join(sourceFolder(inspection.sourceId),frame.artifactFile));
   if(sha256(bytes)!==state.cropHash||frame.sha256!==state.frameHash)throw Error('Source crop identity changed');
   await fs.writeFile(path.join(output,'source-crop-'+state.id+'.jpg'),bytes);
  }
 }
 await fs.mkdir(verification,{recursive:true});
 await json(path.join(verification,'matched-states.json'),{passed:false,failure:'State replay did not finish'});
 const profile=await ensureSandboxProfile(),docker=process.env.DOCKER_BIN||'docker.exe',name='skillwalk-states-'+randomUUID();let executionError;
 try{await exec(docker,['run','--rm','--name',name,'--network','none','--read-only','--cap-drop','ALL','--cap-add','SYS_CHROOT','--security-opt','no-new-privileges','--security-opt','seccomp='+profile,'--user','pwuser','--memory','2g','--cpus','2','--pids-limit','128','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=536870912',
 '--mount',`type=bind,source=${path.join(root,'node_modules')},target=/app/node_modules,readonly`,
 '--mount',`type=bind,source=${path.join(root,'src/matched-states-browser.mjs')},target=/app/browser.mjs,readonly`,
 '--mount',`type=bind,source=${path.join(root,'src/recording-scale.mjs')},target=/app/recording-scale.mjs,readonly`,
 '--mount',`type=bind,source=${output},target=/input,readonly`,'--mount',`type=bind,source=${verification},target=/output`,'-w','/app','mcr.microsoft.com/playwright:v1.64.0-noble','node','browser.mjs'],{windowsHide:true,timeout:100000,maxBuffer:1024*1024});}catch(e){executionError=e.message;}finally{await exec(docker,['rm','-f',name],{windowsHide:true,timeout:15000}).catch(()=>{});}
 const report=await readJSON(path.join(verification,'matched-states.json'));
 if(executionError)report.passed=false;
 for(const [file,expected] of [['source-reference.html',sourceHash],['website.html',artifactHash],['plan.json',contractHash]])if(sha256(await fs.readFile(path.join(output,file)))!==expected){report.passed=false;report.failure='Input changed during replay';}
 if(report.sourceHash!==sourceHash||report.artifactHash!==artifactHash||report.contractHash!==contractHash){report.passed=false;report.failure='Replay evidence identity mismatch';}
 await json(path.join(verification,'matched-states.json'),report);return report;
}
