import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {readJSON,sha256} from './util.mjs';
import {sourceFolder} from './tutorials.mjs';
import {artifactCropFilter} from './source-frame.mjs';
const exec=promisify(execFile);

export async function adjacentSourceCrops(sourceId,frame,directory,{execute=exec}={}){
 if(!Number.isFinite(frame.timestamp)||frame.timestamp<.25||frame.timestamp>3600)throw Error('Invalid reference timestamp');
 const source=sourceFolder(sourceId),evidence=await readJSON(path.join(source,'evidence.json'));
 if(evidence.metadata.id!==sourceId||path.basename(evidence.video.file)!==evidence.video.file)throw Error('Invalid retained video identity');
 const video=path.join(source,evidence.video.file),hash=sha256(await fs.readFile(video));
 if(hash!==evidence.video.sha256)throw Error('Retained source video changed');
 await fs.mkdir(directory,{recursive:true});
 const owned=await fs.mkdtemp(path.join(directory,'temporal-')),frames=[];
 for(const offset of [-.2,.2]){
  const timestamp=frame.timestamp+offset,file=path.join(owned,offset<0?'before.png':'after.png');
  await execute(process.env.FFMPEG_BIN||'ffmpeg.exe',['-hide_banner','-loglevel','error','-nostdin','-y',
   '-ss',String(timestamp),'-i',video,'-frames:v','1','-vf','scale=1280:-2,'+artifactCropFilter(frame.artifactBounds),file],
   {windowsHide:true,timeout:30000,maxBuffer:1024*1024});
  frames.push({file,timestamp,sha256:sha256(await fs.readFile(file))});
 }
 if(sha256(await fs.readFile(video))!==hash)throw Error('Source video changed during extraction');
 return {videoHash:hash,frames};
}

export function layeredDecision({replay,content,appearance,temporal,coverage}){
 const layers={replay,content,appearance,temporal,coverage};
 return {passed:Object.values(layers).every(layer=>layer?.status==='passed'),layers};
}
