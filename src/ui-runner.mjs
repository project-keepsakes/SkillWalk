import {deliverCheckedResult} from './result-delivery.mjs';
import{executionInfo,previewFiles,operationLabel,outputTarget,stageFor,appendOperation}from './workspace.mjs';import{model}from './model.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {spawn} from 'node:child_process';import {root,artifacts,json,readJSON,sha256} from './util.mjs';

export class LocalRun{

 constructor(id,notify=()=>{}){this.models={text:process.env.GEMMA_TEXT_MODEL||'local-gemma',vision:model};this.styleAutoDelayMs=7000;this.choiceDeadline=null;this.taskTitle=null;this.kind='presentation';this.tutorialId='372Iksaz8b0';this.task=null;this.previewArtifact=null;this.previewWork=Promise.resolve();this.operations=[];this.currentOperation=null;this.browserActive=false;this.browserLocation=null;this.id=id;this.notify=notify;this.status='new';this.events=[];this.seq=0;this.frame=null;this.code='';this.stage='';this.stopping=false;this.dir=path.join(artifacts,'experiments',id);this.plan=null;this.demoBrief=null;this.demoSource=null;this.failure=null;this.checks=[];this.previews=[];this.choice=null;this.resolveChoice=null;}

 view(){return {choiceDeadline:this.choiceDeadline,taskTitle:this.taskTitle,kind:this.kind,tutorialId:this.tutorialId,execution:executionInfo(this.kind,this.models),task:this.task,previewArtifact:this.previewArtifact,operations:this.operations,currentOperation:this.currentOperation,browserActive:this.browserActive,browserLocation:this.browserLocation,id:this.id,seq:this.seq,status:this.status,stage:this.stage,stopping:this.stopping,plan:this.plan,demoBrief:this.demoBrief,demoSource:this.demoSource,failure:this.failure,checks:this.checks,code:this.code,frame:this.frame,previews:this.previews,choice:this.choice,events:this.events.filter(e=>e.type!=='model-output').slice(-100)};}

 event(type,data={}){const e={...data,type,at:data.at||new Date().toISOString(),seq:++this.seq};if(type==='browser-start')this.browserActive=true;if(type==='browser-end')this.browserActive=false;if(type==='browser-location')this.browserLocation=data.url;if(type==='model-start'){this.models[data.name==='document-embeddings'?'embedding':data.name?.startsWith('vision-')?'vision':data.name==='document-answer'?'answer':'text']=data.model;}if(type==='model-start')this.currentOperation={name:data.name,model:data.model,target:outputTarget(data.name),at:e.at};const label=operationLabel(e);if(label){this.operations=appendOperation(this.operations,{type,at:e.at,text:label});}if(type==='artifact-written'&&previewFiles.test(data.artifact||''))this.previewWork=this.previewWork.then(()=>this.registerPreview(data.artifact)).catch(()=>{});if(type==='browser-frame'){this.frame=e;this.notify(e);return;}if(type==='model-start'){this.code='';if(this.status!=='testing')this.frame=null;}if(type==='model-output')this.code=(this.code+data.text).slice(-150000);if(type==='artifact-written'&&/^preview-(paper|bold-poster|block-frame)\.html$/.test(data.artifact||'')&&this.status==='previewing'){readJSON(path.join(this.dir,'output/previews.json')).then(manifest=>{this.previews=manifest.styles;this.event('previews-updated',{previews:this.previews,validated:false});}).catch(()=>{});}if(type==='check')this.checks.push(data.check);this.events.push(e);if(this.events.length>5000)this.events.shift();this.notify(e);if(this.ready)fs.appendFile(path.join(this.dir,'events.ndjson'),JSON.stringify(e)+'\n').catch(()=>{});}

 state(status,stage,task=null){if(status==='complete')this.failure=null;const previous=this.task;this.task=task||(['failed','stopped'].includes(status)?previous:stageFor({...this,status,task:null}));this.status=status;this.stage=stage;this.event('state',{status,stage,kind:this.kind,appURL:this.runtime?.running?this.runtime.appURL:null,task:this.task,choiceDeadline:this.choiceDeadline,execution:this.view().execution,previews:this.previews,choice:this.choice,plan:status==='review'?this.plan:undefined,demoBrief:status==='review'?this.demoBrief:undefined,demoSource:status==='review'?this.demoSource:undefined,failure:this.failure});}

 async init(){await fs.mkdir(path.join(this.dir,'output'),{recursive:true});this.ready=true;}

 throwIfStopping(){if(this.stopping)throw Error('Stopped at the requested step boundary.');}

 async requestStop(){this.stopping=true;await fs.mkdir(this.dir,{recursive:true});await fs.writeFile(path.join(this.dir,'stop-requested'),'stop');}

 async step(script,args=[]){if(this.stopping)throw Error('Stopped at the requested step boundary.');await fs.rm(path.join(this.dir,'stop-requested'),{force:true});this.throwIfStopping();return await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'src',script),...args],{cwd:root,windowsHide:true,env:{...process.env,PROOF_RUN:this.id,SKILLWALK_STOP_FILE:path.join(this.dir,'stop-requested'),TUTORIAL_VIDEO_ID:this.tutorialId||'372Iksaz8b0',PROOF_BRIEF:path.join(this.dir,'brief.json'),SKILLWALK_LIVE:'1',SKILLWALK_REPAIR_FEEDBACK:this.repairFeedback||'',OLLAMA_TEXT_BASE:process.env.OLLAMA_TEXT_BASE||'http://127.0.0.1:11434',GEMMA_TEXT_MODEL:process.env.GEMMA_TEXT_MODEL||'local-gemma',...this.modelEnvironment}});let buf='',errors='';const timer=setTimeout(()=>{child.kill();if(script==='verify.mjs'||script==='verify-generic.mjs'){const cleanup=spawn(process.env.DOCKER_BIN||'docker.exe',['stop','skillwalk-browser-'+this.id],{stdio:'ignore',windowsHide:true});cleanup.on('error',()=>{});}reject(Error('Step timed out; execution stopped.'));},this.stepTimeoutMs||8*60*1000);const line=s=>{if(s.startsWith('@@SKILLWALK ')){try{const e=JSON.parse(s.slice(12));this.event(e.type,e);}catch{this.event('log',{text:'Malformed live event ignored.'});}}else if(s.trim())this.event('log',{text:s.slice(0,2000)});};child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{buf+=chunk;let i;while((i=buf.indexOf('\n'))>=0){line(buf.slice(0,i));buf=buf.slice(i+1);}});child.stderr.on('data',chunk=>{errors+=chunk;this.event('log',{text:String(chunk).slice(0,2000)});});child.once('error',e=>{clearTimeout(timer);reject(e);});child.once('close',code=>{clearTimeout(timer);if(buf)line(buf);this.browserActive=false;this.previewWork.then(()=>resolve({code,error:errors.match(/(?:^|\n)(?:\w*Error): ([^\r\n]*)/g)?.at(-1)?.trim()||errors.slice(-1000)}));});});}


 async registerPreview(file){if(!previewFiles.test(file))throw Error('Unsupported preview file');const bytes=await fs.readFile(path.join(this.dir,'output',file));this.previewArtifact={file,hash:sha256(bytes),at:new Date().toISOString()};this.event('artifact-preview',{artifact:this.previewArtifact});}
 async saveWorkspace(){await this.previewWork;await json(path.join(this.dir,'workspace.json'),{models:this.models,taskTitle:this.taskTitle,kind:this.kind,task:this.task,previewArtifact:this.previewArtifact,operations:this.operations,currentOperation:this.currentOperation,browserLocation:this.browserLocation});}
 async restoreWorkspace(){try{const w=await readJSON(path.join(this.dir,'workspace.json'));if(w.kind!==this.kind)return;this.task=w.task;this.taskTitle=w.taskTitle;if(w.models?.text&&w.models?.vision)this.models=w.models;this.operations=Array.isArray(w.operations)?w.operations.slice(-60):[];this.currentOperation=w.currentOperation;this.browserLocation=w.browserLocation;if(previewFiles.test(w.previewArtifact?.file||'')&&sha256(await fs.readFile(path.join(this.dir,'output',w.previewArtifact.file)))===w.previewArtifact.hash)this.previewArtifact=w.previewArtifact;}catch{}this.browserActive=false;}
 async analyze(){await this.init();await json(path.join(this.dir,'brief.json'),{});this.state('analyzing','Reading actual video frames and captions');const result=await this.step('proof.mjs',['evidence']);if(result.code!==0)throw Error(result.error||'Video analysis did not pass evidence validation.');this.plan=await readJSON(path.join(this.dir,'output/plan.json'));if(this.stopping)throw Error('Stopped at the requested step boundary.');this.state('analyzing','Preparing a ready-to-run demo from the tutorial');const prepared=await this.step('demo-brief.mjs');if(prepared.code!==0)throw Error(prepared.error||'Could not prepare a ready-to-run demo.');const demo=await readJSON(path.join(this.dir,'output/demo-brief.json'));this.demoBrief=demo.brief;this.demoSource=demo.provenance;if(this.stopping)throw Error('Stopped at the requested step boundary.');this.state('review','Your demo is ready. Review it or run now.');}

 async previewStyles(){this.state('previewing','Gemma is creating three real cover previews');const made=await this.step('proof.mjs',['previews']);if(made.code!==0)throw Error(made.error||'Cover generation failed');for(let attempt=0;attempt<3;attempt++){this.state('preview-testing','Inspecting the three covers in the real browser');const checked=await this.step('verify.mjs',['previews']);const report=await readJSON(path.join(this.dir,'verification/browser-report.json'));if(checked.code===0&&report.passed)break;this.failure=report.failure;this.event('validation-failed',{failure:report.failure,attempt:attempt+1});if(attempt===2)throw Error('Cover repair limit reached: '+report.failure);this.state('repairing','Gemma is repairing a cover before you choose');const repair=await this.step('repair.mjs',['previews']);if(repair.code===0)this.repairFeedback='';if(repair.code!==0){this.repairFeedback=repair.error||'Cover repair rejected';this.event('repair-rejected',{failure:this.repairFeedback});}}const manifest=await readJSON(path.join(this.dir,'output/previews.json'));manifest.validated=true;await json(path.join(this.dir,'output/previews.json'),manifest);this.previews=manifest.styles;}

 async waitForChoice(){
  if(this.stopping)throw Error('Stopped at the requested step boundary.');
  const recommended=this.previews.find(p=>p.recommended)||this.previews[0];if(!recommended)throw Error('No checked design is available for automatic selection.');
  this.choiceDeadline=Date.now()+this.styleAutoDelayMs;
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{if(!this.resolveChoice)return;if(this.stopping)this.resolveChoice(null);else this.choose(recommended.id,'automatic');},this.styleAutoDelayMs);
   this.resolveChoice=id=>{clearTimeout(timer);this.resolveChoice=null;this.choiceDeadline=null;if(!id)reject(Error('Stopped at the requested step boundary.'));else resolve(id);};
   this.state('choosing','Comparing checked covers; continuing with '+recommended.name+' automatically');
  });
 }

 choose(id,mode='manual'){if(mode==='manual'&&this.status==='choosing'&&this.resolveChoice&&Date.now()>=this.choiceDeadline){const recommended=this.previews.find(p=>p.recommended)||this.previews[0];this.choose(recommended.id,'automatic');throw Error('The direction window has closed; the recommendation was selected automatically.');}if(this.status!=='choosing'||!this.resolveChoice||!this.previews.some(s=>s.id===id))throw Error('Choose one of the available covers while style selection is open');this.choice=id;this.previewWork=this.previewWork.then(()=>this.registerPreview('preview-'+id+'.html')).catch(()=>{});this.choiceMode=['recommended','automatic'].includes(mode)?mode:'manual';this.event('style-selected',{id,mode:this.choiceMode,name:this.previews.find(s=>s.id===id).name,timestamp:150});this.resolveChoice(id);}

 async verifyAndRepair(){
  for(let attempt=0;attempt<=4;attempt++){
   this.throwIfStopping();
   this.state('testing',`Browser test pass ${attempt+1}`);
   const result=await this.step('verify.mjs');this.throwIfStopping();
   const report=await readJSON(path.join(this.dir,'verification/browser-report.json'));this.throwIfStopping();
   if(result.code===0&&report.passed){
    this.state('testing','Gemma is inspecting actual rendered slides');
    const visual=await this.step('visual-review.mjs');this.throwIfStopping();
    const updated=await readJSON(path.join(this.dir,'verification/browser-report.json'));this.throwIfStopping();
    Object.assign(report,updated);
    if(visual.code!==0&&!report.failure)throw Error(visual.error||'Visual inspection failed');
   }
   if(result.code===0&&report.passed){
    const currentHash=sha256(await fs.readFile(path.join(this.dir,'output/presentation.html')));this.throwIfStopping();
    const generation=await readJSON(path.join(this.dir,'output/generation.json'));this.throwIfStopping();
    if(!report.presentationHash||report.presentationHash!==currentHash||generation.presentationHash!==currentHash)throw Error('Artifact integrity changed between generation, verification and result; run checks again.');
    await deliverCheckedResult(this,{passed:true,presentationHash:currentHash,checks:report.checks,verifiedAt:new Date().toISOString()},'Presentation verified. Edit text here or save your copy.');
    return;
   }
   this.failure=report.failure;this.event('validation-failed',{failure:report.failure,attempt:attempt+1});
   if(attempt===4)throw Error('Repair limit reached. The presentation is not verified.');
   this.state('repairing',`Gemma repair ${attempt+1} of 4`);
   const repaired=await this.step('repair.mjs');this.throwIfStopping();
   if(repaired.code===0)this.repairFeedback='';
   if(repaired.code!==0){this.repairFeedback=repaired.error||'Repair rejected';this.event('repair-rejected',{failure:this.repairFeedback});}
  }
 }

 async execute(brief){this.taskTitle=brief.title;this.previews=[];this.choice=null;this.frame=null;this.stopping=false;this.repairFeedback='';await json(path.join(this.dir,'brief.json'),brief);this.checks=[];this.failure=null;await this.previewStyles();await this.waitForChoice();await json(path.join(this.dir,'output/choice.json'),{id:this.choice,mode:this.choiceMode,selectedAt:new Date().toISOString()});this.state('generating','Gemma is building the selected design into your full presentation');const generated=await this.step('proof.mjs',['generate']);if(generated.code!==0)throw Error(generated.error||'Generation failed. No verified presentation is available.');await this.verifyAndRepair();}

 async retry(){let generated=false;try{const info=await readJSON(path.join(this.dir,'output/generation.json'));generated=['paper','bold-poster','block-frame'].includes(info.styleChoice);await fs.access(path.join(this.dir,'output/presentation-raw.html'));}catch{generated=false;}if(!generated)return this.execute(await readJSON(path.join(this.dir,'brief.json')));this.stopping=false;this.failure=null;this.repairFeedback='';this.checks=[];this.state('testing','Apply the current runtime, then retry the real browser checks');const compiled=await this.step('compile.mjs');if(compiled.code!==0)throw Error(compiled.error||'Could not safely recompile the unchanged generated deck');await this.verifyAndRepair();}

 fail(error){this.failure=error.message;this.state(this.stopping?'stopped':'failed',error.message);this.event('error',{message:error.message});}

}
