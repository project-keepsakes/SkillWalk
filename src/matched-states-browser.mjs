import {createRequire} from 'node:module';
import {estimateRecordingScale,preservesVisibleSemantics} from './recording-scale.mjs';
const {PNG,jpegjs}=createRequire(import.meta.url)('./node_modules/playwright-core/lib/utilsBundle.js');
import fs from 'node:fs/promises';
import http from 'node:http';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const deadline=setTimeout(()=>process.exit(124),90000);
const plan=JSON.parse(await fs.readFile('/input/plan.json','utf8'));
const pages={'/source':await fs.readFile('/input/source-reference.html'),'/output':await fs.readFile('/input/website.html')};
const report={passed:false,states:[],sourceHash:hash(pages['/source']),artifactHash:hash(pages['/output']),contractHash:hash(await fs.readFile('/input/plan.json')),scope:'Pinned source implementation versus output; not video fidelity'};
const server=http.createServer((req,res)=>{
 if(!pages[req.url])return res.writeHead(404).end();
 res.setHeader('content-type','text/html');
 res.setHeader('content-security-policy',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'");res.end(pages[req.url]);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
async function capture(state,kind,probe=false){
 const context=await browser.newContext({viewport:state.viewport,deviceScaleFactor:state.captureScale||1,serviceWorkers:'block',reducedMotion:'reduce'});
 const problems=[];
 try{
  await context.route('**/*',r=>r.request().url()===origin+'/'+kind?r.continue():(problems.push('External request'),r.abort()));
  const page=await context.newPage();page.setDefaultTimeout(3000);
  page.on('pageerror',e=>problems.push(e.message));page.on('console',m=>{if(m.type()==='error')problems.push(m.text());});
  await page.goto(origin+'/'+kind);await page.evaluate(()=>document.fonts.ready);
  for(const action of state.actions){
   if(action.type==='click'){const control=page.getByRole('button',{name:action.target,exact:true});if(await control.count()!==1)throw Error('State button is missing or ambiguous');await control.click();}
   else await page.keyboard.press(action.target);
  }
  const observed=[];
  for(const observation of state.observations){
   const target=page.locator(observation.selector);if(await target.count()!==1||!await target.isVisible())throw Error('Source state selector is missing or ambiguous: '+observation.selector);
   observed.push({selector:observation.selector,text:(await target.innerText()).trim()});
  }
  const matches=observed.every((o,i)=>o.text===state.observations[i].text.trim());
  if(probe){if(problems.length)throw Error(problems.join('; '));return {observed,matches};}
  if(!matches)throw Error('Source state text mismatch');
  // Focus rings must not differ solely because the last action used a mouse.
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
  const snapshot=await page.evaluate(()=>{
   const elements=[...document.querySelectorAll('body,body *')].filter(e=>!['SCRIPT','STYLE','NOSCRIPT'].includes(e.tagName)&&e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility==='visible');
   if(elements.length>256)throw Error('Page exceeds bounded comparison');
   return elements.map(e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,id:e.id,text:e.innerText,value:e.value??null,checked:e.checked??null,box:[r.x,r.y,r.width,r.height].map(n=>Math.round(n*100)/100),style:Object.fromEntries(['color','background-color','font-family','font-size','font-weight','line-height','text-align','border-top-width','border-top-style','border-top-color','padding-top','padding-left','margin-top','display'].map(p=>[p,s.getPropertyValue(p)]))};});
  });
  const screenshot=state.id+'-'+kind+(state.captureScale?'-scaled':'')+'.png';
  const bytes=await page.screenshot({path:'/output/'+screenshot,animations:'disabled',caret:'hide'});
  if(problems.length)throw Error(problems.join('; '));
  return {snapshot,screenshot,screenshotHash:hash(bytes)};
 }finally{await context.close();}
}
try{
 browser=await chromium.launch({headless:true,chromiumSandbox:true});
 if(!Array.isArray(plan.replayStates)||!plan.replayStates.length)throw Error('No approved replay states');
 for(const state of plan.replayStates){
  const result={id:state.id,viewport:state.viewport,actions:state.actions,observations:state.observations};report.states.push(result);
  let resolved=state;
  try{result.source=await capture(state,'source');}catch(initial){
   // Discover actions only against pinned SOURCE and fixed video observations.
   // Never inspect a candidate to change the target state or expected content.
   const queue=[[]],seen=new Set();let found=null,probes=0;
   const buttons=plan.replayButtons||[];
   while(buttons.length&&queue.length&&probes<48){
    const actions=queue.shift();probes++;
    let probe;try{probe=await capture({...state,actions},'source',true);}catch{break;}
    if(probe.matches){found=actions;break;}
    const key=JSON.stringify(probe.observed);if(seen.has(key))continue;seen.add(key);
    if(actions.length<12)for(const target of buttons)queue.push([...actions,{type:'click',target}]);
   }
   result.sourceSearch={probes,budget:48,initialFailure:initial.message};
   if(!found){result.failure='Reference state unresolved: '+initial.message;continue;}
   result.proposedActions=state.actions;result.actions=found;resolved={...state,actions:found};
   try{result.source=await capture(resolved,'source');}catch(e){result.failure='Discovered source state was not reproducible: '+e.message;continue;}
  }
  if(plan.sourceVideoId){
   const crop=await fs.readFile('/input/source-crop-'+state.id+'.jpg');
   if(hash(crop)!==state.cropHash)throw Error('Crop changed inside replay');
   const hypothesis=estimateRecordingScale(PNG.sync.read(await fs.readFile('/output/'+result.source.screenshot)),jpegjs.decode(crop));
   result.recordingScale=hypothesis;
   if(hypothesis.applied){
    result.nativeSource=result.source;
    const nativeSnapshot=result.source.snapshot;
    resolved={...resolved,viewport:{width:Math.floor(state.viewport.width/hypothesis.scale),height:Math.floor(state.viewport.height/hypothesis.scale)},captureScale:hypothesis.scale};
    result.captureViewport=resolved.viewport;result.captureScale=hypothesis.scale;
    try{result.source=await capture(resolved,'source');}catch(e){result.failure='Scaled source capture failed: '+e.message;continue;}
    if(!preservesVisibleSemantics(nativeSnapshot,result.source.snapshot)){result.failure='Recording-scale hypothesis changes visible source content or styles; source viewport is unresolved';continue;}
   }
  }
  try{result.output=await capture(resolved,'output');}catch(e){result.failure='Output state failed: '+e.message;continue;}
  result.domMatches=JSON.stringify(result.source.snapshot)===JSON.stringify(result.output.snapshot);
  const a=PNG.sync.read(await fs.readFile('/output/'+result.source.screenshot)),b=PNG.sync.read(await fs.readFile('/output/'+result.output.screenshot));
  let different=0;
  if(a.width!==b.width||a.height!==b.height)different=Infinity;
  else for(let i=0;i<a.data.length;i+=4)if(a.data[i]!==b.data[i]||a.data[i+1]!==b.data[i+1]||a.data[i+2]!==b.data[i+2]||a.data[i+3]!==b.data[i+3])different++;
  // Chromium produced a one-pixel raster difference for identical DOM/style.
  // Keep this fixed, tiny allowance explicit; semantic/geometry checks stay exact.
  result.pixelDifferences=Number.isFinite(different)?different:null;result.pixelTolerance=4;
  result.pixelsMatch=different<=4;
  result.passed=result.domMatches&&result.pixelsMatch;
  if(!result.passed)result.failure='Matched source implementation and output differ';
 }
 report.passed=report.states.length>0&&report.states.every(s=>s.passed===true);
}catch(e){report.failure=e.message;}finally{
 await browser?.close();await new Promise(r=>server.close(r));clearTimeout(deadline);
 await fs.writeFile('/output/matched-states.json',JSON.stringify(report,null,2));
}
if(!report.passed)process.exitCode=1;
