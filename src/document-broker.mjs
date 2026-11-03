import fs from 'node:fs/promises';
import path from 'node:path';
export const allowedRoutes=new Set(['/api/chat','/api/generate','/api/embed','/api/embeddings','/api/show','/api/tags','/api/version']);
export function validateBridgeRequest(request,approvedModel='gemma3:4b'){
 if(!request||!allowedRoutes.has(request.path)||!['GET','POST'].includes(request.method))throw Error('Unsupported local model operation');
 if(['GET'].includes(request.method)&&!['/api/tags','/api/version'].includes(request.path))throw Error('Invalid model method');
 const b=request.body;if(!b||typeof b!=='object'||Array.isArray(b)||JSON.stringify(b).length>8000000)throw Error('Model request exceeds local limits');
 if(!['/api/tags','/api/version'].includes(request.path)){
  const embedding=['/api/embed','/api/embeddings'].includes(request.path);
  if(b.model!==(embedding?'embeddinggemma':approvedModel)&&!(request.path==='/api/show'&&b.model==='embeddinggemma'))throw Error('Unapproved model for document workflow');
  if(b.messages&&!Array.isArray(b.messages))throw Error('Invalid model messages');
  if(b.images&&(!Array.isArray(b.images)||b.images.length>6||b.images.some(i=>typeof i!=='string'||!/^[A-Za-z0-9+/=]+$/.test(i))))throw Error('Invalid local image input');
  if(request.path==='/api/embed'&&!(typeof b.input==='string'||Array.isArray(b.input)&&b.input.length<=100&&b.input.every(x=>typeof x==='string')))throw Error('Invalid embedding input');
 }
 return request;
}
function localBase(value){const u=new URL(value);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)||u.username||u.password||u.search||u.hash||u.pathname!=='/')throw Error('Document inference must stay on loopback');return u.origin;}
export class DocumentBroker{
 constructor(directory,event=()=>{},leaseFile=path.join(directory,'heartbeat.json'),profile={}){this.approvedModel=profile.GEMMA_MODEL||'gemma3:4b';this.directory=directory;this.leaseFile=leaseFile;this.event=event;this.closed=false;this.processing=false;this.requests=0;this.lastActivity=Date.now();this.embeddingBase=localBase(process.env.DOCUMENT_EMBEDDING_BASE||'http://127.0.0.1:11434');this.visionBase=localBase(profile.OLLAMA_BASE||process.env.OLLAMA_BASE||'http://127.0.0.1:11435');}
 async start(){await fs.mkdir(this.directory,{recursive:true});this.heartbeat=()=>fs.writeFile(this.leaseFile,JSON.stringify({at:Date.now()})).catch(()=>{});await this.heartbeat();this.heartbeatTimer=setInterval(this.heartbeat,2000);this.timer=setInterval(()=>this.poll().catch(e=>this.event('log',{text:'Local model broker: '+e.message})),100);}
 async close(){this.closed=true;clearInterval(this.timer);clearInterval(this.heartbeatTimer);this.controller?.abort();await fs.writeFile(this.leaseFile,JSON.stringify({at:Date.now(),closed:true})).catch(()=>{});}
 async poll(){if(this.closed||this.processing)return;this.processing=true;try{for(const name of await fs.readdir(this.directory)){if(this.closed)break;if(!/^[a-f0-9]{32}\.request\.json$/.test(name))continue;const file=path.join(this.directory,name),stat=await fs.lstat(file);if(!stat.isFile()||stat.isSymbolicLink())continue;let reply;try{if(stat.size>8000000)throw Error('Request too large');if(++this.requests>1000)throw Error('This local app reached its model-request limit');const request=validateBridgeRequest(JSON.parse(await fs.readFile(file,'utf8')),this.approvedModel);reply=await this.forward(request);}catch(e){reply={status:400,body:{error:e.message}};}const response=file.replace('.request.json','.response.json');try{const stat=await fs.lstat(response);if(stat.isSymbolicLink()||!stat.isFile())throw Error('Unsafe broker response target');}catch(e){if(e.code!=='ENOENT')throw e;}const temp=response+'.tmp';await fs.writeFile(temp,JSON.stringify(reply),{flag:'wx'});await fs.rename(temp,response);await fs.unlink(file);this.lastActivity=Date.now();}}finally{this.processing=false;}}
 async forward({method,path:route,body}){
 const embedding=['/api/embed','/api/embeddings'].includes(route),base=embedding||body.model==='embeddinggemma'?this.embeddingBase:this.visionBase;
 const inference=['/api/embed','/api/embeddings','/api/chat','/api/generate'].includes(route),name=embedding?'document-embeddings':body.images?.length?'vision-document-figure':'document-answer';
 const started=Date.now();if(inference)this.event('model-start',{name,model:body.model});
 const payload={...body,stream:false,keep_alive:'10m'};if(inference)payload.options={temperature:0,num_ctx:8192,num_predict:1000,...(embedding?{num_gpu:0}:{}),seed:42};
 this.controller=new AbortController();const limit=setTimeout(()=>this.controller.abort(),300000);let r,data;try{r=await fetch(base+route,{method,headers:{'content-type':'application/json'},...(method==='POST'?{body:JSON.stringify(payload)}:{}),signal:this.controller.signal});data=await r.json();}finally{clearTimeout(limit);}
 if(inference){if(data.response||data.message?.content)this.event('model-output',{name,text:data.response||data.message.content});this.event('model-end',{name,elapsedMs:Date.now()-started,tokens:data.eval_count||0});}
 return{status:r.status,body:data};
 }
}
