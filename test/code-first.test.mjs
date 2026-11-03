import test from 'node:test';
import assert from 'node:assert/strict';
import {pinnedCreatorBundle,validateReplayState,resolvedReplayEvidence} from '../src/code-first.mjs';
import {comparisonPassed} from '../src/code-first-visual.mjs';
import {sha256} from '../src/util.mjs';
test('code-first checks every retained dependency identity before bundling',()=>{
 const html='<html><body><script src="main.js"></script></body></html>';
 const files=[{id:'m0',name:'index.html',text:html},{id:'m1',name:'main.js',text:'document.title="Pinned";'}].map(f=>({...f,collection:'fixture',revision:'fixed',sha256:sha256(f.text)}));
 assert.match(pinnedCreatorBundle(files[0],files).html,/Pinned/);
 assert.throws(()=>pinnedCreatorBundle(files[0],[files[0],{...files[1],text:'changed'}]),/identity changed/);
 assert.throws(()=>pinnedCreatorBundle(files[0],[files[0]]),/unavailable/);
});
test('state replay accepts only bounded explicit actions and measured selectors',()=>{
 const state={uncertain:false,explanation:'Visible result',actions:[{type:'click',target:'Add'}],observations:[{selector:'#result',text:'1'}]};
 assert.equal(validateReplayState(state,['#result']),state);
 for(const altered of [{...state,uncertain:'false'},{...state,actions:[{type:'eval',target:'code'}]},{...state,actions:Array(13).fill(state.actions[0])},{...state,observations:[{selector:'body',text:'1'}]}])assert.throws(()=>validateReplayState(altered,['#result']));
});
test('separate visual judgments reject uncertainty and conflicting verdicts',()=>{
 const result={matches:true,uncertain:false,differences:[],sourceDescription:'source',outputDescription:'output'};
 assert.equal(Boolean(comparisonPassed(result)),true);
 for(const altered of [{...result,matches:'true'},{...result,uncertain:true},{...result,differences:['Wrong text']},{...result,sourceDescription:''}])assert.equal(Boolean(comparisonPassed(altered)),false);
});
test('visual evidence uses source-discovered actions and retains the original proposal',()=>{
 const state={id:'v1',viewport:{width:600,height:400},actions:[],observations:[{selector:'#result',text:'1'}],uncertain:false,explanation:'Visible state'};
 const result={id:'v1',passed:true,viewport:state.viewport,actions:[{type:'click',target:'Add'}]};
 const evidence=resolvedReplayEvidence(state,result);
 assert.deepEqual(evidence.actions,result.actions);assert.deepEqual(evidence.proposedActions,[]);
 assert.throws(()=>resolvedReplayEvidence(state,{...result,passed:false}));
});
