import {appManifest,sealDocumentEvidence} from './document-integrity.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {LocalRun} from './ui-runner.mjs';
import {DocumentRuntime} from './document-runtime.mjs';
import {acquireTutorial} from './acquire.mjs';
import {documentId} from './tutorials.mjs';
import {json,readJSON,sha256} from './util.mjs';
export class DocumentRun extends LocalRun{
 constructor(id,notify){super(id,notify);this.kind='document';this.tutorialId=documentId;this.artifactName='document-app.zip';this.runtime=null;}
 view(){return{...super.view(),artifactName:this.artifactName,appURL:this.runtime?.running?this.runtime.appURL:null};}
 async analyze(){await this.init();this.state('analyzing','Reading the full local Gemma document tutorial and its pinned materials');await acquireTutorial('https://www.youtube.com/watch?v='+this.tutorialId);const analyzed=await this.step('document-proof.mjs',['analyze']);if(analyzed.code!==0)throw Error(analyzed.error||'Document tutorial analysis failed');this.plan=await readJSON(path.join(this.dir,'output/plan.json'));const demo=await readJSON(path.join(this.dir,'output/demo-brief.json'));this.demoBrief=demo.brief;this.demoSource=demo.provenance;if(this.stopping)throw Error('Stopped at the requested step boundary.');this.state('review','Full document workflow ready. No writing or upload required.');}
 async execute(){this.taskTitle=this.demoBrief.title;this.stopping=false;this.failure=null;this.checks=[];await json(path.join(this.dir,'brief.json'),this.demoBrief);this.state('generating','Gemma is preparing source-grounded multimodal instructions and the local app');const built=await this.step('document-proof.mjs',['build']);if(built.code!==0)throw Error(built.error||'Document tutorial build failed');await this.verifyAndRepair();}
 async verifyAndRepair(){
  if(this.stopping)throw Error('Stopped at the requested step boundary.');
  this.state('testing','Starting the full local PDF, image, table and question-answering workflow');
  this.runtime??=new DocumentRuntime(this);await this.runtime.start();
  for(let attempt=0;attempt<=2;attempt++){
   if(this.stopping)throw Error('Stopped at the requested step boundary.');
   this.state('testing','Real browser: extract, describe, embed, retrieve and answer'+(attempt?' (retry '+attempt+')':''));
   const result=await this.step('document-check.mjs');if(this.stopping){await this.close();throw Error('Stopped at the requested step boundary.');}let report;try{report=await readJSON(path.join(this.dir,'document-data/browser-report.json'));}catch{throw Error(result.error||'Document browser check produced no report');}
   if(result.code===0&&report.passed){if(this.verifySourceOutcome){await this.verifySourceOutcome(report);report=await readJSON(path.join(this.dir,'document-data/browser-report.json'));if(!report.passed)throw Error('Source outcome verification failed');}await this.runtime.bundle();if(this.stopping){await this.close();throw Error('Stopped at the requested step boundary.');}const artifactHash=sha256(await fs.readFile(path.join(this.dir,'output',this.artifactName)));this.checks=report.checks;await json(path.join(this.dir,'result.json'),{passed:true,kind:this.kind,sourceVideoId:this.tutorialId,artifactHash,presentationHash:artifactHash,checks:report.checks,appFiles:await appManifest(path.join(this.dir,'output/app')),...await sealDocumentEvidence(this.dir),verifiedAt:new Date().toISOString()});if(this.stopping){await this.close();throw Error('Stopped at the requested step boundary.');}this.state('complete','Full document workflow checked. Explore the local app or download its source.');return;}
   this.failure=report.failure;this.event('validation-failed',{failure:report.failure,attempt:attempt+1});
   if(attempt===2)throw Error('Document repair limit reached: '+report.failure);
   if(!/^Gemma (?:answer failed expected document behavior|visual interpretation)/.test(report.failure||''))throw Error('Document runtime/check failure: '+report.failure);
   this.state('repairing','Repairing local document instructions from the actual failed check');
   // Only plain prompt configuration is repairable; no arbitrary program execution.
   await json(path.join(this.dir,'output/document-repair-feedback.json'),{failure:report.failure});
   const repaired=await this.step('document-proof.mjs',['repair']);
   if(repaired.code!==0)throw Error(repaired.error||'Local Gemma instruction repair failed');
   await this.runtime.stop();this.runtime=new DocumentRuntime(this);await this.runtime.start();
  }
 }
 async retry(){this.stopping=false;this.failure=null;this.checks=[];let built=false;try{await fs.access(path.join(this.dir,'output/app/config.json'));built=true;}catch{}return built?this.verifyAndRepair():this.execute();}
 async openApp(){if(this.status!=='complete')throw Error('Verify the document workflow first');this.runtime??=new DocumentRuntime(this);await this.runtime.start();return this.runtime.appURL;}
 async fail(error){super.fail(error);await this.close();}
 async close(){await this.runtime?.stop();}
}
