// Diagnostic only; use an existing experimental output directory. No acceptance overrides.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {root,artifacts,readJSON,json,sha256} from '../src/util.mjs';
import {sourceFolder} from '../src/tutorials.mjs';
import {artifactCropFilter} from '../src/source-frame.mjs';
const exec=promisify(execFile);
if(!process.argv[2])throw Error('Provide the retained experimental output directory');
const output=path.resolve(process.argv[2]),inspection=await readJSON(path.join(output,'source-inspection.json'));
const plan=await readJSON(path.join(output,'plan.json')),source=sourceFolder(inspection.sourceId);
const evidence=await readJSON(path.join(source,'evidence.json'));
if(evidence.metadata.id!==inspection.sourceId||path.basename(evidence.video.file)!==evidence.video.file)throw Error('Invalid video identity');
const video=path.join(source,evidence.video.file),videoHash=sha256(await fs.readFile(video));
if(videoHash!==evidence.video.sha256)throw Error('Source video changed');
const directory=await fs.mkdtemp(path.join(artifacts,'region-ocr-')),input=path.join(directory,'input');await fs.mkdir(input);
const masks=path.join(directory,'masks');await fs.mkdir(masks);
const frames=inspection.frames.filter(frame=>plan.referenceFrames.includes(frame.id)).slice(-2),manifest=[];
if(!frames.length)throw Error('No selected source frames');
for(const frame of frames){
 if(!/^v\d+$/.test(frame.id)||!Number.isFinite(frame.timestamp)||frame.timestamp<0||frame.timestamp>3600)throw Error('Invalid source frame');
 const crop=path.join(source,frame.artifactFile),bytes=await fs.readFile(crop);
 if(sha256(bytes)!==frame.artifactSha256)throw Error('Source crop changed');
 const native=path.join(input,frame.id+'-native.png');
 await exec(process.env.FFMPEG_BIN||'ffmpeg.exe',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(frame.timestamp),'-i',video,'-frames:v','1','-vf',artifactCropFilter(frame.artifactBounds),native],{windowsHide:true,timeout:30000});
 await fs.writeFile(path.join(input,frame.id+'-existing.png'),bytes);
 const neighbors=[];
 for(const [suffix,offset] of [['before',-.2],['after',.2]]){
  const timestamp=frame.timestamp+offset;
  if(timestamp<0||timestamp>evidence.metadata.duration)throw Error('Neighbor timestamp outside retained video');
  const file=path.join(input,frame.id+'-native-'+suffix+'.png');
  await exec(process.env.FFMPEG_BIN||'ffmpeg.exe',['-hide_banner','-loglevel','error','-nostdin','-y','-ss',String(timestamp),'-i',video,'-frames:v','1','-vf',artifactCropFilter(frame.artifactBounds),file],{windowsHide:true,timeout:30000});
  neighbors.push({file:path.basename(file),timestamp,sha256:sha256(await fs.readFile(file))});
 }
 manifest.push({id:frame.id,timestamp:frame.timestamp,bounds:frame.artifactBounds,neighbors,nativeHash:sha256(await fs.readFile(native)),existingHash:sha256(bytes)});
}
const checker=path.join(root,'src/layered-image.py'),runner=path.join(root,'src/region-ocr.py');
const checkerHash=sha256(await fs.readFile(checker)),runnerHash=sha256(await fs.readFile(runner));
const name='skillwalk-region-'+randomUUID();let report;
try{
 const result=await exec(process.env.DOCKER_BIN||'docker.exe',['run','--rm','--pull','never','--name',name,'--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','pwuser','--memory','1g','--cpus','2','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,nodev,size=134217728',
  '--mount',`type=bind,source=${input},target=/input,readonly`,'--mount',`type=bind,source=${masks},target=/output`,'--mount',`type=bind,source=${checker},target=/checker.py,readonly`,'--mount',`type=bind,source=${runner},target=/region.py,readonly`,
  'skillwalk-document:local','python','/region.py'],{windowsHide:true,timeout:180000,maxBuffer:1024*1024});
 report=JSON.parse(result.stdout);
}finally{await exec(process.env.DOCKER_BIN||'docker.exe',['rm','-f',name],{windowsHide:true,timeout:15000}).catch(()=>{});}
if(sha256(await fs.readFile(checker))!==checkerHash||sha256(await fs.readFile(runner))!==runnerHash||sha256(await fs.readFile(video))!==videoHash)throw Error('Diagnostic inputs changed');
for(const frame of manifest){
 if(sha256(await fs.readFile(path.join(input,frame.id+'-native.png')))!==frame.nativeHash||
    sha256(await fs.readFile(path.join(input,frame.id+'-existing.png')))!==frame.existingHash)throw Error('Diagnostic image changed');
 for(const neighbor of frame.neighbors)if(sha256(await fs.readFile(path.join(input,neighbor.file)))!==neighbor.sha256)throw Error('Neighbor image changed');
}
for(const value of Object.values(report)){
 for(const kind of ['outline','line']){
  const file=value[kind+'MaskFile'];
  if(path.basename(file)!==file||sha256(await fs.readFile(path.join(masks,file)))!==value[kind+'MaskFileHash'])throw Error('Diagnostic mask identity mismatch');
 }
}
await json(path.join(directory,'report.json'),{scope:'source-region-ocr-diagnostic',videoHash,checkerHash,runnerHash,manifest,report});
console.log(JSON.stringify({directory,frames:Object.entries(report).map(([name,value])=>({name,status:value.status,text:value.text,regions:value.regions.length}))},null,2));
