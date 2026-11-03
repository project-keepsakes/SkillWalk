import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomUUID} from 'node:crypto';
import {root,json,sha256} from './util.mjs';
const exec=promisify(execFile);
const statuses=new Set(['passed','failed','unverified']);

export function validLayeredResult(value){
 return value?.scope==='selected-source-crop-only'&&typeof value.passed==='boolean'&&
  statuses.has(value.content?.status)&&statuses.has(value.appearance?.status)&&
  value.passed===(value.content.status==='passed'&&value.appearance.status==='passed');
}

export async function compareLayeredImages({reference,creator,candidate,browserText,neighbors=[]},directory,{execute=exec}={}){
 if(typeof browserText!=='string'||browserText.length>64000)throw Error('Invalid visible browser text');
 if(!Array.isArray(neighbors)||![0,2].includes(neighbors.length))throw Error('Expected two temporal references or none');
 await fs.mkdir(directory,{recursive:true});
 const input=await fs.mkdtemp(path.join(directory,'layered-input-'));
 const identities={};
 for(const [name,file] of Object.entries({reference,creator,candidate,...Object.fromEntries(neighbors.map((file,i)=>['neighbor'+i,file]))})){
  const bytes=await fs.readFile(file);
  if(bytes.length>16*1024*1024)throw Error('Image exceeds verification byte limit');
  identities[name]=sha256(bytes);await fs.writeFile(path.join(input,name+'.png'),bytes);
 }
 await json(path.join(input,'request.json'),{browserText,neighborCount:neighbors.length});
 const name='skillwalk-layered-'+randomUUID();
 const checker=path.join(root,'src/layered-image.py'),checkerHash=sha256(await fs.readFile(checker));
 let result;
 try{
  const run=await execute(process.env.DOCKER_BIN||'docker.exe',['run','--rm','--pull','never','--name',name,
   '--network','none','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','pwuser',
   '--memory','1g','--cpus','2','--pids-limit','64','--tmpfs','/tmp:rw,nosuid,nodev,size=134217728',
   '--mount',`type=bind,source=${input},target=/input,readonly`,
   '--mount',`type=bind,source=${path.join(root,'src/layered-image.py')},target=/checker.py,readonly`,
   'skillwalk-document:local','python','/checker.py'],{windowsHide:true,timeout:180000,maxBuffer:1024*1024});
  result=JSON.parse(run.stdout);
  if(!validLayeredResult(result))throw Error('Malformed layered verifier result');
 }catch(error){result={scope:'selected-source-crop-only',passed:false,content:{status:'unverified'},appearance:{status:'unverified'},error:error.message};}
 finally{await execute(process.env.DOCKER_BIN||'docker.exe',['rm','-f',name],{windowsHide:true,timeout:15000}).catch(()=>{});}
 for(const [key,hash] of Object.entries(identities)){
  if(sha256(await fs.readFile(path.join(input,key+'.png')))!==hash)throw Error('Layered verification input changed');
 }
 if(sha256(await fs.readFile(checker))!==checkerHash)throw Error('Layered checker changed during verification');
 const report={...result,identities,browserTextHash:sha256(browserText),checkerHash,input:path.basename(input)};
 await json(path.join(input,'result.json'),report);return report;
}
