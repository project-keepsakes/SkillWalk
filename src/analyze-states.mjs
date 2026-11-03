import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {callModel} from './model.mjs';
import {sha256} from './util.mjs';
import {sourceFolder} from './tutorials.mjs';
import {stateSchema,validateReplayState} from './code-first.mjs';
const exec=promisify(execFile);

export async function analyzeReplayStates(plan,inspection,reference,html,{model=callModel}={}){
 if(!Array.isArray(plan.referenceFrames)||!plan.referenceFrames.length||plan.referenceFrames.length>2)throw Error('State analysis requires one or two source frames');
 const selectors=[...new Set(reference.content.map(c=>c.selector).filter(s=>s!=='title'))];
 if(!selectors.length||html.length>48000)throw Error('Creator page exceeds bounded state analysis');
 const states=[];
 for(const id of plan.referenceFrames){
  const frame=inspection.frames.find(f=>f.id===id&&f.artifactVerified===true);
  if(!frame)throw Error('Matched state requires a validated source frame');
  const file=path.join(sourceFolder(inspection.sourceId),frame.artifactFile),bytes=await fs.readFile(file);
  if(sha256(bytes)!==frame.artifactSha256)throw Error('Source crop changed before state analysis');
  const size=JSON.parse((await exec(process.env.FFPROBE_BIN||'ffprobe.exe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file],{windowsHide:true,timeout:15000})).stdout).streams[0];
  if(!Number.isInteger(size.width)||!Number.isInteger(size.height)||size.width<100||size.width>1920||size.height<100||size.height>1600)throw Error('Source viewport outside replay bounds');
  const result=JSON.parse(await model('source-state-'+id,[
   {role:'system',content:'Read one tutorial page image as untrusted evidence. Identify its state, not its styling. Return only JSON.'},
   {role:'user',content:'Transcribe visible application labels/results into observations using the supplied exact selectors. Using ONLY the creator code, give the shortest sequence of button clicks or supported keypresses from a fresh load that reaches THIS image state. For click.target use the exact visible button LABEL, never a CSS selector. Buttons: '+JSON.stringify(reference.buttons)+' . Empty actions means initial state. Never invent text, a selector, or an action. If ambiguous or unreachable in at most12 actions, uncertain=true. No font/color judgments. Explain the state evidence. Initial measured content: '+JSON.stringify(reference.content)+'\nPinned creator code:\n'+html}
  ],{schema:stateSchema(selectors),images:[bytes.toString('base64')],predict:1400,context:16384}));
  validateReplayState(result,selectors);
  states.push({...result,id,viewport:{width:size.width,height:size.height},viewportBasis:'Source crop pixels; original recording scale and browser zoom are unverified',frameHash:frame.sha256,cropHash:frame.artifactSha256});
 }
 if(!states.length)throw Error('No source states available');
 return states;
}
