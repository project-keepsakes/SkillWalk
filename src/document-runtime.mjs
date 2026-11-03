import {ensureSandboxProfile} from './sandbox-profile.mjs';
import {verifyAppManifest,verifySealedEvidence} from './document-integrity.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {randomBytes} from 'node:crypto';
import {root,json,readJSON} from './util.mjs';
import {DocumentBroker} from './document-broker.mjs';
const exec=promisify(execFile),docker=process.env.DOCKER_BIN||'docker.exe';
export const documentPort=4180;
export class DocumentRuntime{
 constructor(run){this.run=run;this.name='skillwalk-document-'+run.id;this.data=path.join(run.dir,'document-data');this.bridge=path.join(run.dir,'document-bridge');this.running=false;}
 async start(){if(this.stopPromise)await this.stopPromise;if(this.startPromise)return this.startPromise;this.cancelStart=false;this.startPromise=this.startOnce().finally(()=>{this.startPromise=null;});return this.startPromise;}
 async startOnce(){
  if(this.run.status==='complete'){const proof=await readJSON(path.join(this.run.dir,'result.json'));await verifyAppManifest(path.join(this.run.dir,'output/app'),proof.appFiles);await verifySealedEvidence(this.run.dir,proof);}
  if(this.running)return;
  await exec(docker,['image','inspect','skillwalk-document:local'],{windowsHide:true,timeout:15000}).catch(()=>{throw Error('Build the local document runtime first: docker build -t skillwalk-document:local document');});
  try{await exec(docker,['network','inspect','skillwalk-document-local'],{windowsHide:true,timeout:15000});}catch{await exec(docker,['network','create','--internal','skillwalk-document-local'],{windowsHide:true,timeout:15000});}
  const net=JSON.parse((await exec(docker,['network','inspect','skillwalk-document-local'],{windowsHide:true})).stdout)[0];if(!net.Internal)throw Error('Document runtime network must be internal');
  await fs.mkdir(this.data,{recursive:true});await fs.mkdir(this.bridge,{recursive:true});
  const profile=await ensureSandboxProfile({download:false});
  const session='session-'+randomBytes(24).toString('hex');
  this.broker=new DocumentBroker(this.bridge,(t,d)=>this.run.event(t,d),path.join(this.run.dir,'runtime-lease.json'),this.run.modelEnvironment);await fetch(this.broker.embeddingBase+'/api/generate',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:process.env.GEMMA_TEXT_MODEL||'local-gemma',keep_alive:0}),signal:AbortSignal.timeout(15000)}).catch(()=>{});await this.broker.start();if(this.cancelStart)throw Error('Document runtime startup stopped');
  const args=['run','--detach','--rm','--name',this.name,'--network','skillwalk-document-local','--read-only','--cap-drop','ALL','--cap-add','SYS_CHROOT','--security-opt','no-new-privileges','--security-opt','seccomp='+profile,'--user','pwuser','--memory','8g','--cpus','2','--pids-limit','512','--shm-size','256m','--tmpfs','/tmp:rw,nosuid,nodev,size=1073741824','--mount','type=bind,source='+path.join(this.run.dir,'output/app')+',target=/input,readonly','--mount','type=bind,source='+path.join(root,'document/lease.py')+',target=/lease.py,readonly','--mount','type=bind,source='+this.broker.leaseFile+',target=/heartbeat.json,readonly','--mount','type=bind,source='+path.join(root,'document/supervisor.py')+',target=/supervisor.py,readonly','--mount','type=bind,source='+this.data+',target=/work','--mount','type=bind,source='+this.bridge+',target=/bridge','--mount','type=bind,source='+path.join(root,'node_modules')+',target=/browser/node_modules,readonly','--mount','type=bind,source='+path.join(root,'src/document-answers.mjs')+',target=/browser/document-answers.mjs,readonly','--mount','type=bind,source='+path.join(root,'src/verify-document-browser.mjs')+',target=/browser/verify-document-browser.mjs,readonly','-e','DOCUMENT_GEMMA_MODEL='+this.broker.approvedModel,'-e','DOCUMENT_SESSION='+session,'-e','DOCUMENT_WORKDIR=/work','-e','STREAMLIT_BROWSER_GATHER_USAGE_STATS=false','-e','UNSTRUCTURED_HI_RES_MODEL_NAME=yolox','-e','HF_HUB_OFFLINE=1','-e','TRANSFORMERS_OFFLINE=1','-e','NUMBA_CACHE_DIR=/tmp/numba','-e','MPLCONFIGDIR=/tmp/matplotlib','-e','XDG_CACHE_HOME=/tmp/cache','-e','PYTHONDONTWRITEBYTECODE=1','-e','SCARF_NO_ANALYTICS=true','-e','DO_NOT_TRACK=1','skillwalk-document:local','python','/supervisor.py'];
  try{await exec(docker,args,{windowsHide:true,timeout:30000,maxBuffer:1024*1024});this.running=true;if(this.cancelStart)throw Error('Document runtime startup stopped');
  const detail=JSON.parse((await exec(docker,['inspect',this.name],{windowsHide:true})).stdout)[0];
  const target=detail.NetworkSettings.Networks['skillwalk-document-local'].IPAddress;
  if(!/^172\.\d+\.\d+\.\d+$|^192\.168\.\d+\.\d+$|^10\.\d+\.\d+\.\d+$/.test(target))throw Error('Invalid isolated document app address');
  this.proxyName='skillwalk-document-access-'+this.run.id;
  await exec(docker,['run','--detach','--rm','--name',this.proxyName,'--network','bridge','--publish','127.0.0.1:'+documentPort+':8501','--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--user','65534:65534','--memory','128m','--cpus','0.5','--pids-limit','64','--mount','type=bind,source='+path.join(root,'document/lease.py')+',target=/lease.py,readonly','--mount','type=bind,source='+this.broker.leaseFile+',target=/heartbeat.json,readonly','--mount','type=bind,source='+path.join(root,'document/loopback_access.py')+',target=/access.py,readonly','-e','DOCUMENT_TARGET='+target,'python:3.12.15-bookworm','python','/access.py'],{windowsHide:true,timeout:30000});
  this.proxyRunning=true;if(this.cancelStart)throw Error('Document runtime startup stopped');await exec(docker,['network','connect','skillwalk-document-local',this.proxyName],{windowsHide:true,timeout:15000});
  this.appURL='http://127.0.0.1:'+documentPort+'/'+session+'/?embed=true';this.internalURL='http://127.0.0.1:8501/'+session+'/';await json(path.join(this.run.dir,'output/document-runtime.json'),{container:this.name,appURL:this.appURL,internalURL:this.internalURL,network:'internal',loopbackPort:documentPort});let ready=false;for(let i=0;i<40;i++){try{const response=await fetch(this.appURL,{signal:AbortSignal.timeout(2000)});if(response.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}if(!ready)throw Error('Local document app did not become ready');this.run.event('skill-operation',{message:'Started the real isolated local Streamlit app; inference uses the restricted loopback broker'});}catch(e){try{const logs=await exec(docker,['logs',this.name],{windowsHide:true,timeout:10000,maxBuffer:1024*1024});await fs.writeFile(path.join(this.data,'runtime.log'),logs.stdout+logs.stderr);e.message+=': '+(logs.stdout+logs.stderr).slice(-1800);}catch{}await this.stopOnce();throw e;}
 }
 async bundle(){
  const script="from pathlib import Path; import zipfile; p=Path('/input'); z=zipfile.ZipFile('/work/document-app.zip','w',zipfile.ZIP_DEFLATED); [z.write(f,f.name) for f in p.iterdir() if f.is_file()]; z.close()";
  await exec(docker,['exec',this.name,'python','-c',script],{windowsHide:true,timeout:15000});await fs.copyFile(path.join(this.data,'document-app.zip'),path.join(this.run.dir,'output/document-app.zip'));
 }
 async stop(){this.cancelStart=true;if(this.stopPromise)return this.stopPromise;this.stopPromise=(async()=>{if(this.startPromise)await this.startPromise.catch(()=>{});await this.stopOnce();})().finally(()=>{this.stopPromise=null;});return this.stopPromise;}
 async stopOnce(){await this.broker?.close();if(this.proxyRunning){await exec(docker,['stop','--time','1',this.proxyName],{windowsHide:true,timeout:10000}).catch(()=>{});this.proxyRunning=false;}if(this.running){await exec(docker,['stop','--time','3',this.name],{windowsHide:true,timeout:10000}).catch(()=>{});}this.running=false;}
}
