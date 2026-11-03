import fs from 'node:fs/promises';import path from 'node:path';import {fileURLToPath}from 'node:url';import {execFile,spawn}from 'node:child_process';import {promisify}from 'node:util';import {json,sha256}from './util.mjs';import {parseVtt,compactSegments}from './evidence.mjs';import {tutorialId,reviewedTutorial,sourceFolder,originalId,frameTimes,assertSourceIdentity}from './tutorials.mjs';
const exec=promisify(execFile),yt=process.env.YTDLP_BIN||'yt-dlp.exe',common=['--no-playlist','--js-runtimes','node','--no-warnings'];
export async function previewTutorial(url){const id=tutorialId(url);const source=sourceFolder(id);await fs.mkdir(source,{recursive:true});try{const meta=JSON.parse(await fs.readFile(path.join(source,'metadata.json'),'utf8'));if(meta.id!==id||tutorialId(meta.url)!==id)throw Error('Cached tutorial identity mismatch');return meta;}catch(e){if(e.code!=='ENOENT')throw e;}
 const r=await exec(yt,[...common,'--skip-download','--dump-single-json',url],{maxBuffer:12*1024*1024,timeout:90000,windowsHide:true});const m=JSON.parse(r.stdout);if(m.id!==id)throw Error('Downloaded metadata does not match selected tutorial');const meta={id,url:'https://www.youtube.com/watch?v='+id,title:m.title,creator:m.uploader,duration:m.duration,description:m.description,chapters:m.chapters||[],acquiredAt:new Date().toISOString()};await json(path.join(source,'metadata.json'),meta);return meta;}
export const maxVideoBytes=256*1024*1024;
export function acquisitionFrameTimes(id,segments,duration){
 const sampled=frameTimes(segments,duration);
 // The vetted presentation analyzer reads these source moments explicitly.
 return id===originalId?[...new Set([...sampled,116,146,198])].sort((a,b)=>a-b):sampled;
}
export function validateAcquisitionMetadata(metadata){if(!Number.isFinite(metadata.duration)||metadata.duration<20||metadata.duration>3600)throw Error('Tutorial must be between 20 seconds and one hour');}
async function boundedVideoDownload(args, source) {
 return await new Promise((resolve,reject)=>{
  const child=spawn(yt,args,{windowsHide:true});let errors='',limited=false,checking=false;
  child.stderr.on('data',chunk=>{errors=(errors+chunk).slice(-10000)});
  child.stdout.resume();
  const timer=setTimeout(()=>{limited=true;child.kill()},240000);
  const monitor=setInterval(async()=>{if(checking)return;checking=true;try{
   let total=0;for(const name of await fs.readdir(source)){if(!name.startsWith('tutorial.'))continue;const stat=await fs.stat(path.join(source,name));if(stat.isFile())total+=stat.size;}
   if(total>maxVideoBytes){limited=true;child.kill()}
  }catch(error){if(error.code!=='ENOENT'){limited=true;child.kill()}}finally{checking=false}},100);
  child.once('error',error=>{clearTimeout(timer);clearInterval(monitor);reject(error)});
  child.once('close',code=>{clearTimeout(timer);clearInterval(monitor);if(limited)reject(Error('Video download exceeded the time or 256 MiB resource limit'));else if(code!==0)reject(Error('Video download failed: '+errors));else resolve()});
 });
}
export async function acquireTutorial(url){const id=tutorialId(url);const metadata=await previewTutorial(url);validateAcquisitionMetadata(metadata);const source=sourceFolder(id);try{const prior=assertSourceIdentity(JSON.parse(await fs.readFile(path.join(source,'evidence.json'),'utf8')),id);if((await fs.stat(path.join(source,prior.video.file))).size>maxVideoBytes)throw Error('Cached video exceeds 256 MiB resource limit');if(sha256(await fs.readFile(path.join(source,prior.video.file)))!==prior.video.sha256)throw Error('Cached video changed');for(const f of prior.frames)if(sha256(await fs.readFile(path.join(source,f.file)))!==f.sha256)throw Error('Cached frame changed');if(prior.captions&&sha256(await fs.readFile(path.join(source,prior.captions.file)))!==prior.captions.sha256)throw Error('Cached captions changed');return prior;}catch(e){if(e.code!=='ENOENT')throw e;}
 const video=path.join(source,'tutorial.mp4');try{const size=(await fs.stat(video)).size;if(size>maxVideoBytes)throw Error('Cached video exceeds 256 MiB resource limit');if(size<100000)throw Error('Incomplete media');}catch(error){if(error.code!=='ENOENT'&&error.message!=='Incomplete media')throw error;await boundedVideoDownload([...common,'--max-filesize','128M','-f','bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]','--merge-output-format','mp4','--no-progress','-o',path.join(source,'tutorial.%(ext)s'),metadata.url],source);}
 if((await fs.stat(video)).size>maxVideoBytes)throw Error('Downloaded video exceeds 256 MiB resource limit');
 let captions=(await fs.readdir(source)).find(n=>n.endsWith('.en.vtt'));if(!captions){await exec(yt,[...common,'--skip-download','--write-subs','--write-auto-subs','--sub-langs','en','--sub-format','vtt','-o',path.join(source,'tutorial.%(ext)s'),metadata.url],{maxBuffer:1024*1024,timeout:90000,windowsHide:true});captions=(await fs.readdir(source)).find(n=>n.endsWith('.en.vtt'));}if(!captions)throw Error('No English captions available; no invented transcript fallback');
 const captionBytes=await fs.readFile(path.join(source,captions)),segments=parseVtt(captionBytes.toString('utf8'));if(segments.length<10)throw Error('Incomplete captions');const frameDir=path.join(source,'frames');await fs.mkdir(frameDir,{recursive:true});const times=acquisitionFrameTimes(id,compactSegments(segments,20),metadata.duration),frames=[];for(const t of times){const name=`frame-${t}.jpg`;await exec(process.env.FFMPEG_BIN||'ffmpeg.exe',['-hide_banner','-loglevel','error','-y','-ss',String(t),'-i',video,'-frames:v','1','-vf','scale=1280:-2',path.join(frameDir,name)],{timeout:30000,windowsHide:true});const bytes=await fs.readFile(path.join(frameDir,name));frames.push({id:'f'+t,timestamp:t,file:'frames/'+name,sha256:sha256(bytes)});}
 const evidence={metadata,video:{file:'tutorial.mp4',sha256:sha256(await fs.readFile(video))},captions:{file:captions,sha256:sha256(captionBytes)},segments,frames};await json(path.join(source,'evidence.json'),evidence);return evidence;}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const e=await acquireTutorial(process.argv[2]||'https://www.youtube.com/watch?v='+originalId);console.log(JSON.stringify({id:e.metadata.id,title:e.metadata.title,segments:e.segments.length,frames:e.frames.map(f=>f.timestamp),sha256:e.video.sha256},null,2));}
