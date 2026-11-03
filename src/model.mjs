import {needsGemma4Formatting, gemma4Prompt} from './model-format.mjs';
import {checkStopBoundary} from './stop-boundary.mjs';
import {emit,live,consumeModelStream} from './events.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {artifacts,json} from './util.mjs';
const base=process.env.OLLAMA_BASE||'http://127.0.0.1:11435';
const target=new URL(base);if(!['127.0.0.1','localhost','[::1]'].includes(target.hostname)||target.protocol!=='http:')throw Error('Proof inference must stay on local loopback.');
const textBase=process.env.OLLAMA_TEXT_BASE||base;
const textTarget=new URL(textBase);if(!['127.0.0.1','localhost','[::1]'].includes(textTarget.hostname)||textTarget.protocol!=='http:')throw Error('Text inference must stay on loopback.');
export const textModel=process.env.GEMMA_TEXT_MODEL||process.env.GEMMA_MODEL||'gemma3:4b';
let textChecked=false;let visionPrepared=false;let rawGemma4=false;
export const model=process.env.GEMMA_MODEL||'gemma3:4b';
export async function callModel(name,messages,{schema,predict=4096,context=16384,images}={}){
 await checkStopBoundary();
 const vision=name.startsWith('vision-');if(vision&&!visionPrepared&&textBase!==base){await fetch(`${textBase}/api/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:textModel,keep_alive:0}),signal:AbortSignal.timeout(10000)});visionPrepared=true;}const activeModel=vision?model:textModel;const activeBase=vision?base:textBase;
 if(!vision&&!textChecked){const r=await fetch(`${activeBase}/api/show`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:activeModel}),signal:AbortSignal.timeout(10000)});const d=await r.json();if(!r.ok||!String(d.details?.family).toLowerCase().includes('gemma'))throw Error('Text worker is not verified local Gemma');rawGemma4=needsGemma4Formatting(d);await json(path.join(artifacts,'text-model.json'),{formatting:rawGemma4?'gemma4-raw-turns':'model-chat-template',model:activeModel,base:activeBase,details:d.details,capabilities:d.capabilities});if(activeBase!==base)await fetch(`${base}/api/generate`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model,keep_alive:0}),signal:AbortSignal.timeout(10000)});textChecked=true;}
 let payload={model:activeModel,stream:live,think:false,messages,options:{temperature:0,seed:42,num_predict:predict,num_ctx:context},keep_alive:'20m'};
 if(schema)payload.format=schema;
 if(images?.length)payload.messages=[...messages.slice(0,-1),{...messages.at(-1),images}];
 const rawText=rawGemma4&&!vision;
 if(rawText){const {messages:chatMessages,...rest}=payload;payload={...rest,raw:true,prompt:gemma4Prompt(chatMessages)};}
 emit('model-start',{name,model:activeModel,formatting:rawText?'gemma4-raw-turns':'model-chat-template'});const start=Date.now();const response=await fetch(`${activeBase}/api/${rawText?'generate':'chat'}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(240000)});
 if(!response.ok)throw Error(`Local model ${response.status}: ${await response.text()}`);let pending='',last=Date.now();const flush=()=>{if(pending){emit('model-output',{name,text:pending});pending='';last=Date.now();}};const result=live?await consumeModelStream(response.body,text=>{pending+=text;if(Date.now()-last>100)flush();}):await response.json();flush();if(!result.message)result.message={role:'assistant',content:result.response||''};emit('model-end',{name,elapsedMs:Date.now()-start,tokens:result.eval_count||0});
 await json(path.join(artifacts,'runs',`${Date.now()}-${name}.json`),{model:activeModel,base:activeBase,elapsedMs:Date.now()-start,request:{...payload,messages:payload.messages?.map(m=>({...m,images:m.images?.map(()=>'<local frame>')}))},response:result});
 console.log(`${name}: ${((Date.now()-start)/1000).toFixed(1)}s, ${result.eval_count||0} output tokens`);
 await checkStopBoundary();
 return result.message.content;
}
export async function checkModel(){const response=await fetch(`${base}/api/show`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model}),signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw Error(result.error);if(!String(result.details?.family).toLowerCase().includes('gemma'))throw Error('Selected runtime is not a verified Gemma family');await json(path.join(artifacts,'model.json'),{model,details:result.details,capabilities:result.capabilities,parameters:result.parameters});return result;}
