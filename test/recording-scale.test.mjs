import test from 'node:test';import assert from 'node:assert/strict';
import {estimateRecordingScale,preservesVisibleSemantics} from '../src/recording-scale.mjs';
function fixture(w,h,color=255){const width=200,height=200,data=new Uint8Array(width*height*4).fill(color);for(let y=10;y<10+h;y++)for(let x=10;x<10+w;x++){const i=(y*width+x)*4;data[i]=data[i+1]=data[i+2]=0;data[i+3]=255;}return {width,height,data};}
test('source-only scale hypothesis accepts uniform scaling and rejects changed proportions',()=>{
 assert.equal(estimateRecordingScale(fixture(20,30),fixture(40,60)).scale,2);
 assert.equal(estimateRecordingScale(fixture(20,30),fixture(60,40)).applied,false);
 assert.equal(estimateRecordingScale(fixture(20,30),fixture(40,60,80)).applied,false);
});
test('scale capture cannot hide content or change styles at a responsive breakpoint',()=>{
 const before=[{tag:'BUTTON',id:'a',text:'Add',style:{display:'block',color:'black'},box:[8,8,30,20]}];
 assert.equal(preservesVisibleSemantics(before,[{...before[0],box:[16,16,60,40]}]),true);
 assert.equal(preservesVisibleSemantics(before,[]),false);
 assert.equal(preservesVisibleSemantics(before,[{...before[0],style:{display:'block',color:'red'}}]),false);
});
