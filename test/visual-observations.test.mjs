import test from 'node:test';import assert from 'node:assert/strict';
import {compareTranscription,coveragePassed,styleObservationReadable,regionInside,inspectCoverage} from '../src/visual-observations.mjs';
test('source transcription compares actual text without accepting lost signs or missing content',()=>{
 const transcript={text:['+1','-1','-3'],uncertain:false};
 assert.equal(compareTranscription(transcript,'+1 -1\n\n-3').matches,true);
 for(const output of ['+1 -1 3','+1 -3','+1 -1 -3 EXTRA'])assert.equal(compareTranscription(transcript,output).matches,false);
 assert.equal(compareTranscription({...transcript,uncertain:true},'+1 -1 -3').matches,false);
 assert.equal(compareTranscription({text:['same','same'],uncertain:false},'same').matches,false);
});
test('coverage excludes browser chrome but rejects omitted application regions',()=>{
 const app={kind:'application-content',insideSelectedRegion:true,description:'Result controls'};
 const browser={kind:'browser-chrome',insideSelectedRegion:false,description:'Address bar'};
 assert.equal(coveragePassed({uncertain:false,regions:[app,browser]}),true);
 assert.equal(coveragePassed({uncertain:false,regions:[app,{...app,insideSelectedRegion:false}]}),false);
 assert.equal(coveragePassed({uncertain:false,regions:[browser]}),false);
 assert.equal(coveragePassed({uncertain:true,regions:[app]}),false);
});
test('explicit uncertainty in style descriptions cannot become a pass',()=>{
 const style={background:'white',foreground:'black',typography:'serif',borders:'gray control borders',layout:'row above number',uncertain:false};
 assert.equal(styleObservationReadable(style),true);
 assert.equal(styleObservationReadable({...style,typography:'unknown'}),false);
});

test('region coverage uses measured containment rather than a model inclusion vote',()=>{
 const selection={x:0,y:0,width:500,height:1000};
 assert.equal(regionInside({x:20,y:30,width:100,height:100},selection),true);
 assert.equal(regionInside({x:700,y:30,width:100,height:100},selection),false);
 assert.equal(regionInside({x:400,y:30,width:200,height:100},selection),false);
 assert.equal(regionInside({x:20,y:30,width:-1,height:100},selection),false);
});

test('invalid geometry in any classified region makes coverage uncertain',async()=>{
 const model=async()=>JSON.stringify({uncertain:false,regions:[{kind:'application-content',bounds:{x:10,y:10,width:100,height:100},description:'result'},{kind:'browser-chrome',bounds:{x:-10,y:0,width:100,height:10},description:'toolbar'}]});
 const result=await inspectCoverage(Buffer.from('fixture'),{x:0,y:0,width:1000,height:1000},{model});
 assert.equal(result.uncertain,true);assert.equal(coveragePassed(result),false);
});
