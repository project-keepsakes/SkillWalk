import {catalogEntry} from './tutorial-catalog.mjs';
export const previewFiles=/^(?:presentation|baseline|website|preview-(?:paper|bold-poster|block-frame))\.html$/;
export function executionInfo(kind='presentation',models={}){const t=kind==='generic'?{skill:'Source-derived HTML',id:null,url:null,skillURL:null,compatibility:'Requires a self-contained HTML tutorial',output:'Standalone HTML',tasks:[]}:catalogEntry(kind);return{skill:t.skill,sourceId:t.id,sourceURL:t.url,skillURL:t.skillURL,compatibility:t.compatibility,authoringModel:models.text||'local-gemma',embeddingModel:kind==='document'?'embeddinggemma':null,output:t.output,model:kind==='document'?(models.vision||'gemma3:4b'):(models.text||'local-gemma'),visionModel:models.vision||'gemma3:4b',tasks:t.tasks};}
export function stagesFor(kind='presentation'){return[{id:'source',label:'Read video'},{id:'brief',label:'Review task'},...(['document','generic'].includes(kind)?[]:[{id:'draft',label:kind==='website'?'Initial page':'Cover previews'}]),{id:'build',label:'Build'},{id:'verify',label:'Test and repair'},{id:'done',label:'Ready'}];}
export function stageFor(run){if(['failed','stopped'].includes(run.status)&&run.task)return run.task==='initial'?'draft':run.task;if(run.status==='analyzing')return'source';if(run.status==='review')return'brief';if(run.status==='complete')return'done';if(run.task==='initial'||['previewing','preview-testing','choosing'].includes(run.status)||run.status==='repairing'&&!run.choice&&run.kind==='presentation')return'draft';if(run.status==='generating')return'build';return'verify';}
export function operationLabel(e){if(e.type==='skill-reference'||e.type==='skill-operation')return e.message;if(e.type==='artifact-preview')return'Saved '+e.artifact.file+'; browser verification pending';if(e.type==='check')return'Passed: '+e.check;if(e.type==='check-failed'||e.type==='validation-failed')return'Check failed: '+(e.failure||'').split('\n')[0];if(e.type==='state')return e.stage;if(e.type==='model-start')return(e.name?.startsWith('vision-')?'Gemma vision inspecting':'Gemma working on')+' '+String(e.name||'the task').replaceAll('-',' ');if(e.type==='error')return e.message;return null;}
export function outputTarget(name=''){if(name.startsWith('cover-')){const id=name.slice(6).replace(/-repair-\d+$/,'');if(['paper','bold-poster','block-frame'].includes(id))return'preview-'+id+'.html';}if(/website-baseline/.test(name))return'baseline.html';if(/website-with|website-browser|website-policy/.test(name))return'website.html';if(name==='presentation'||name==='artifact-browser-repair')return'presentation.html';return null;}

export function appendOperation(list,op){const next=[...list,op];if(next.length<=60)return next;const evidence=next.filter(x=>['skill-reference','skill-operation','artifact-preview','validation-failed','check-failed'].includes(x.type)).slice(0,20);return [...new Set([...evidence,...next.slice(-40)])];}

const practiceSteps={
 document:[
  'Follow the project README to repeat the run with SkillWalk’s local Docker setup, the environment checked here. Download the checked app source to inspect or adapt it.',
  'In the finished local app, choose a non-sensitive PDF under 10 MB with text, a table and an image.',
  'Ask a question from each type of content, then one the PDF cannot answer. Open the retrieved evidence and compare it with the original PDF.',
  'Work in a separate copy, change one instruction in config.json, restart the app and compare the answers. Your changes have not passed this run’s checks.'
 ],
 presentation:[
  'Watch the original tutorial and read its linked frontend-slides reference. The video uses Claude; this demonstration adapts the workflow to local Gemma.',
  'Download the verified presentation and keep it as your baseline. Use Edit in the finished deck to replace the fictional material with your own.',
  'Save an edited copy, then check its text, navigation and layout in a local browser at desktop and phone sizes.',
  'Compare your version with the tutorial and revise one choice at a time. Edited copies are not re-tested automatically.'
 ],
 website:[
  'Watch the original tutorial and read the linked frontend-design reference. This local demonstration produces HTML/CSS, without the video’s Laravel backend.',
  'Download the verified website and edit a separate copy with your own content. Keep the checked original for comparison.',
  'Open your HTML locally and test keyboard navigation, links and layout at desktop and phone sizes.',
  'Compare one design change with the tutorial, then test it again. Changes to your copy have not passed this run’s checks.'
 ]
};
export function practiceFor(run){
 if(run?.status==='complete'&&run.pipeline==='shared-v1')return {key:'shared:'+run.id,sourceURL:'https://www.youtube.com/watch?v='+run.tutorialId,steps:['Keep the original checked download as a baseline.','Compare the cited tutorial operations and visible source requirements with the completed result.','Make changes in a separate copy and rerun relevant checks; edited copies are not verified automatically.'],downloadURL:'/api/result?id='+encodeURIComponent(run.id)+'&download=1',downloadLabel:run.kind==='document'?'Download checked app source':'Download checked HTML'};
 if(run?.status!=='complete'||typeof run.id!=='string'||!run.id||!Object.hasOwn(practiceSteps,run.kind))return null;
 const source=catalogEntry(run.kind);
 if(run.tutorialId&&run.tutorialId!==source.id)return null;
 return {key:run.kind+':'+run.id,sourceURL:source.url,steps:[...practiceSteps[run.kind]],downloadURL:'/api/result?id='+encodeURIComponent(run.id)+'&download=1',downloadLabel:run.kind==='document'?'Download checked app source':run.kind==='website'?'Download verified website':'Download verified presentation'};
}
