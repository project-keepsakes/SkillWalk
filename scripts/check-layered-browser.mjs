// Controlled calibration only: these fixtures are not unfamiliar tutorial acceptance.
import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';
import {inspectCreatorRender} from '../src/creator-render.mjs';import {compareLayeredImages} from '../src/layered-images.mjs';import {sha256,json} from '../src/util.mjs';
const root=path.resolve('.artifacts/layered-browser-controls');await fs.mkdir(root,{recursive:true});
async function render(name,value,color){const output=path.join(root,name);await fs.mkdir(output,{recursive:true});const text=`<!doctype html><html><head><title>Verifier control</title><style>body{background:${color};color:black;font:28px Arial;margin:24px}button{font:28px Arial;margin-right:80px}p{margin-top:50px}</style></head><body><button>Add</button><button>Subtract</button><p>${value}</p></body></html>`;const entry={id:'m0',name:'index.html',text,sha256:sha256(text),revision:'fixed',collection:'control'};await inspectCreatorRender(entry,[entry],output);return path.join(output,'source-reference.png');}
const reference=await render('correct','-3','white');const results=[];
for(const [name,value,color,expected] of [['correct','-3','white',true],['wrong-value','3','white',false],['wrong-color','-3','orange',false]]){
 const candidate=name==='correct'?reference:await render(name,value,color);
 const result=await compareLayeredImages({reference,creator:reference,candidate,browserText:'Add Subtract '+value,neighbors:[reference,reference]},root);
 results.push({name,...result});await json(path.join(root,'results.json'),results);console.log(JSON.stringify({name,passed:result.passed,content:result.content.status,appearance:result.appearance.status,temporal:result.temporal?.status,error:result.error}));assert.equal(result.passed,expected);if(expected)assert.equal(result.temporal.status,'passed');
}

const temporal=await compareLayeredImages({reference,creator:reference,candidate:reference,browserText:'Add Subtract -3',neighbors:[reference,path.join(root,'wrong-value/source-reference.png')]},root);
assert.equal(temporal.passed,true);assert.equal(temporal.temporal.status,'unverified');
await json(path.join(root,'temporal-negative.json'),temporal);
console.log(JSON.stringify({name:'changed-neighbor-state',crop:true,temporal:temporal.temporal.status}));
