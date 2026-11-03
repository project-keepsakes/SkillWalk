import test from 'node:test';
import assert from 'node:assert/strict';
import {creatorReference} from '../src/creator-reference.mjs';
import {documentSourcePassed} from '../src/source-review-verdict.mjs';
test('creator style guidance reaches a bounded prompt with truncation disclosed',()=>{
  const files=[{id:'m0',name:'README.md',text:'R'.repeat(9000)},{id:'m1',name:'SKILL.md',text:'S'.repeat(10000)},{id:'m2',name:'STYLE_PRESETS.md',text:'Use source typography'},{id:'m3',name:'main.js',text:'not guidance'}];
  const result=creatorReference(files,8010);
  assert.deepEqual(result.selected.map(item=>item.id),['m1','m2']);
  assert.equal(result.selected.reduce((sum,item)=>sum+item.text.length,0),8010);
  assert.equal(result.selected[0].truncated,true);assert.equal(result.selected[1].truncated,true);
  assert.deepEqual(result.omitted,['m0']);assert.match(result.mode,/no native skill invocation/);
});
test('optional omissions retain explicit coverage without overriding required document operations',()=>{
  const plan={requirements:[{}, {required:false}],steps:[{}, {required:false}]};
  const verdicts=[{index:0,met:true,evidence:'Actual extraction and runtime evidence'},{index:1,met:false,evidence:'Optional hosting omitted; local delivery used'}];
  const review={requirements:verdicts,steps:verdicts,uncertain:false,stylingMatches:true,missingOperations:[]};
  assert.equal(documentSourcePassed(review,plan),true);
  assert.equal(documentSourcePassed({...review,requirements:[verdicts[1]]},plan),false);
  assert.equal(documentSourcePassed({...review,steps:[{...verdicts[0],met:false},verdicts[1]]},plan),false);
  assert.equal(documentSourcePassed({...review,steps:[verdicts[0],{...verdicts[1],evidence:''}]},plan),false);
});
