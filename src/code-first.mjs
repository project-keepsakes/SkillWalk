import {bundleCreatorHTML} from './creator-materials.mjs';
import {artifactIssues} from './artifact.mjs';
import {sha256} from './util.mjs';

export function pinnedCreatorBundle(entry, files) {
 if(!entry?.collection||!entry.revision)throw Error('Creator source must be pinned');
 const selected=files.filter(file=>file.collection===entry.collection);
 for(const file of selected)if(file.revision!==entry.revision||sha256(file.text)!==file.sha256)throw Error('Creator source identity changed: '+file.name);
 const html=bundleCreatorHTML(entry,selected),issues=artifactIssues(html);
 if(issues.length)throw Error('Creator source cannot run offline: '+issues.join('; '));
 return {html,manifest:{entry:entry.id,collection:entry.collection,revision:entry.revision,htmlHash:sha256(html),files:selected.map(({id,name,sha256})=>({id,name,sha256}))}};
}

export const stateSchema=selectors=>({type:'object',additionalProperties:false,properties:{
 actions:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,properties:{type:{type:'string',enum:['click','keypress']},target:{type:'string'}},required:['type','target']}},
 observations:{type:'array',minItems:1,maxItems:16,items:{type:'object',additionalProperties:false,properties:{selector:{type:'string',enum:selectors},text:{type:'string'}},required:['selector','text']}},
 uncertain:{type:'boolean'},explanation:{type:'string'}},required:['actions','observations','uncertain','explanation']});

export function validateReplayState(state,selectors){
 if(state?.uncertain!==false||typeof state.explanation!=='string'||!state.explanation.trim())throw Error('Source interaction state is uncertain');
 if(!Array.isArray(state.actions)||state.actions.length>12||!Array.isArray(state.observations)||!state.observations.length||state.observations.length>16)throw Error('Invalid source state bounds');
 for(const a of state.actions)if(!['click','keypress'].includes(a.type)||typeof a.target!=='string'||!a.target.trim()||a.target.length>120||a.type==='keypress'&&!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter','Space','Tab','Escape'].includes(a.target))throw Error('Unsupported state action');
 for(const o of state.observations)if(!selectors.includes(o.selector)||typeof o.text!=='string'||!o.text.trim()||o.text.length>1500)throw Error('Invalid source state observation');
 return state;
}

export function resolvedReplayEvidence(state,result){
 if(result?.passed!==true||result.id!==state.id||JSON.stringify(result.viewport)!==JSON.stringify(state.viewport))throw Error('Resolved replay does not match the approved reference');
 validateReplayState({...state,actions:result.actions},state.observations.map(o=>o.selector));
 return {viewport:result.viewport,captureViewport:result.captureViewport||result.viewport,captureScale:result.captureScale||1,recordingScale:result.recordingScale||null,actions:result.actions,proposedActions:state.actions};
}
