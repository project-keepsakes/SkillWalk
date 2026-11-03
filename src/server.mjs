import {releaseCompatibility,releaseScopeMessage,historicalExperiment} from './release-scope.mjs';
import {GenericRun} from './generic-run.mjs';
import {DocumentRun} from './document-run.mjs';
import{previewFiles}from './workspace.mjs';
import {verifiedContent}from './result-integrity.mjs';
import {createReadStream} from 'node:fs';
import http from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';import {randomBytes} from 'node:crypto';import {fileURLToPath} from 'node:url';import {root,artifacts,readJSON,sha256} from './util.mjs';import {assessBrief} from './readiness.mjs';import {LocalRun} from './ui-runner.mjs';


import {tutorialId,reviewedTutorial,sourceFolder,originalId,compatibilityFor} from './tutorials.mjs';import{previewTutorial}from './acquire.mjs';import{FrontendRun}from './frontend-run.mjs';export{tutorialId};

const web=path.join(root,'web');
const makeRun=(kind,id,notify,tutorial,pipeline)=>pipeline==='shared-v1'||kind==='generic'?new GenericRun(id,notify,tutorial):kind==='document'?new DocumentRun(id,notify):kind==='website'?new FrontendRun(id,notify):new LocalRun(id,notify);


export function createApp({runFactory=makeRun,restore=true}={}){const token=randomBytes(24).toString('hex');const clients=new Set();const runs=new Map();let current=null,busy=false,closing=false;


 const restoring=(async()=>{if(!restore)return;try{let saved;try{saved=await readJSON(path.join(artifacts,'last-run.json'));}catch{saved={...await readJSON(path.join(artifacts,'last-completed-run.json')),status:'complete'};}if(!/^live-\d+-[a-f0-9]{6}$/.test(saved.id)||!['complete','failed','stopped'].includes(saved.status))return;const run=runFactory(saved.kind,saved.id,publish,saved.tutorialId,saved.pipeline);if(saved.pipeline==='shared-v1'){try{run.plan=await readJSON(path.join(run.dir,'output/plan.json'));run.configureArtifact();}catch(error){if(saved.status==='complete'||error.code!=='ENOENT')throw error;}}if(saved.status==='complete'){const proof=await readJSON(path.join(run.dir,'result.json'));await verifiedContent(path.join(run.dir,'output',run.artifactName||'presentation.html'),proof);run.checks=proof.checks||[];}run.status=saved.status;run.stage=saved.stage||(saved.status==='complete'?'Presentation checks passed':'The prior local attempt stopped. Retry the approved demo when ready.');run.failure=saved.failure||null;try{run.plan=await readJSON(path.join(run.dir,'output/plan.json'));}catch{}try{const demo=await readJSON(path.join(run.dir,'output/demo-brief.json'));run.demoBrief=demo.brief;run.demoSource=demo.provenance;}catch{}try{run.previews=(await readJSON(path.join(run.dir,'output/previews.json'))).styles;run.choice=(await readJSON(path.join(run.dir,'output/choice.json'))).id;}catch{}await run.restoreWorkspace();run.ready=true;runs.set(run.id,run);current=run;}catch{}})();
 const publish=e=>{const payload='data: '+JSON.stringify({...e,runId:current?.id})+'\n\n';for(const c of clients){if(c.writableLength>2000000&&e.type==='browser-frame')continue;c.write(payload);}};


 const work=(run,fn)=>{busy=true;void(async()=>{try{await fn();}catch(error){await run.fail(error);}finally{try{await run.saveWorkspace();if(['complete','failed','stopped'].includes(run.status))await fs.writeFile(path.join(artifacts,'last-run.json'),JSON.stringify({id:run.id,status:run.status,stage:run.stage,failure:run.failure,pipeline:run.pipeline,kind:run.kind||'presentation',tutorialId:run.tutorialId||originalId}));if(run.status==='complete')await fs.writeFile(path.join(artifacts,'last-completed-run.json'),JSON.stringify({id:run.id,pipeline:run.pipeline,kind:run.kind||'presentation',tutorialId:run.tutorialId||originalId}));}catch(error){await run.fail(Error('Local run state could not be saved: '+error.message));}finally{busy=false;}}})();};



 const app=http.createServer(async(req,res)=>{const host=`127.0.0.1:${app.address().port}`;const origin=`http://${host}`;const send=(status,value)=>{res.writeHead(status,{'content-type':'application/json'});res.end(JSON.stringify(value));};


 try{await restoring;if(closing){send(503,{error:'The local server is shutting down.'});return;}if(req.headers.host!==host){send(403,{error:'Use the loopback address shown by the local server.'});return;}const url=new URL(req.url,origin);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');


 if(req.method==='POST'){if(req.headers.origin!==origin||req.headers['x-skillwalk-token']!==token){send(403,{error:'Local request rejected.'});return;}let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>100000){send(413,{error:'Presentation content is too large.'});return;}}let data;try{data=JSON.parse(body||'{}');}catch{send(400,{error:'Invalid request.'});return;}


 if(url.pathname==='/api/preview'){const id=tutorialId(data.url||''),known=releaseCompatibility(id);if(!known.available){send(422,{error:known.message});return;}const meta=await previewTutorial(data.url),kind=known.kind,compatibility=known;send(200,{id,kind,title:meta.title,creator:meta.creator,duration:meta.duration,compatibility});return;}

 if(url.pathname==='/api/analyze'){const tutorial=tutorialId(data.url||''),compatibility=releaseCompatibility(tutorial);if(!compatibility.available){send(422,{error:compatibility.message});return;}const entry={id:tutorial,kind:compatibility.kind};if(busy){send(409,{error:'A local step is already running.'});return;}busy=true;try{await current?.close?.();const id='live-'+Date.now()+'-'+randomBytes(3).toString('hex');const run=runFactory(entry.kind,id,publish,entry.id,compatibility.pipeline);runs.set(id,run);current=run;publish({type:'snapshot',reason:'run-replaced',run:run.view()});work(run,()=>run.analyze());send(202,{id,kind:entry.kind,tutorialId:entry.id,run:run.view()});}catch(error){busy=false;throw error;}return;}


 if(url.pathname==='/api/execute'){if(historicalExperiment(current)){send(422,{error:releaseScopeMessage});return;}if(!current||data.id!==current.id||current.status!=='review'||busy){send(409,{error:'Analyze and review this video before starting execution.'});return;}const readiness=current.kind!=='presentation'?{ready:Boolean(current.demoBrief)}:assessBrief(data.brief);if(!readiness.ready){send(422,{error:'More information is needed.',...readiness});return;}work(current,()=>current.execute(data.brief));send(202,{id:current.id});return;}


 if(url.pathname==='/api/retry'){if(historicalExperiment(current)){send(422,{error:releaseScopeMessage});return;}if(!current||data.id!==current.id||busy||!['failed','stopped'].includes(current.status)||!current.plan?.supported){send(409,{error:'Only a stopped or failed execution with a valid analyzed plan can be retried.'});return;}const brief=await readJSON(path.join(current.dir,'brief.json'));if(current.kind==='presentation'&&!assessBrief(brief).ready){send(422,{error:'Return to Tutorial to prepare a complete demo first.'});return;}work(current,()=>current.retry());send(202,{id:current.id});return;}

 if(url.pathname==='/api/open-document'){if(historicalExperiment(current)){send(422,{error:releaseScopeMessage});return;}if(busy||current?.kind!=='document'||data.id!==current.id||current.status!=='complete'){send(409,{error:'Finish the document workflow before opening its local app.'});return;}busy=true;try{await verifiedContent(path.join(current.dir,'output',current.artifactName),await readJSON(path.join(current.dir,'result.json')));const appURL=await current.openApp();send(200,{appURL});}finally{busy=false;}return;}

 if(url.pathname==='/api/choose'){if(!current||data.id!==current.id||!busy){send(409,{error:'No style choice is open.'});return;}try{current.choose(data.style);send(202,{selected:current.choice});}catch(e){send(409,{error:e.message});}return;}

 if(url.pathname==='/api/stop'){if(!current||data.id!==current.id){send(404,{error:'Run not found.'});return;}if(['complete','failed','stopped'].includes(current.status)){send(409,{error:'This run has already finished; it cannot be stopped.'});return;}if(current.requestStop)await current.requestStop();else current.stopping=true;current.resolveChoice?.(null);current.event('stop-requested',{message:'Stopping after the current step. An in-flight model call may finish first.'});send(200,{stopping:true});return;}send(404,{error:'Unknown action.'});return;}


 if(req.method!=='GET'){send(405,{error:'Method not allowed.'});return;}


 if(url.pathname==='/api/state'){send(200,{run:current?.view()||null,busy});return;}


 if(url.pathname==='/api/events'){res.writeHead(200,{'content-type':'text/event-stream','connection':'keep-alive','cache-control':'no-cache'});res.write('data: '+JSON.stringify({type:'snapshot',run:current?.view()||null})+'\n\n');clients.add(res);const interval=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{clients.delete(res);clearInterval(interval);});return;}


 if(url.pathname==='/api/samples'){send(200,{coding:await readJSON(path.join(root,'examples/workshop-brief.json')),repair:await readJSON(path.join(root,'examples/repair-cafe-brief.json'))});return;}


 if(url.pathname==='/api/result'){const run=runs.get(url.searchParams.get('id'));if(!run||run.status!=='complete'){send(409,{error:'Only a verified result can be opened.'});return;}const proof=await readJSON(path.join(run.dir,'result.json'));let content;try{content=await verifiedContent(path.join(run.dir,'output',run.artifactName||'presentation.html'),proof);run.checks=proof.checks||[];}catch(e){send(409,{error:e.message});return;}if(run.kind==='document'){if(url.searchParams.has('download')){res.setHeader('content-type','application/zip');res.setHeader('content-disposition','attachment; filename="document-app.zip"');res.end(content);}else send(200,{kind:'document',appURL:run.view().appURL,checks:run.checks});return;}res.setHeader('Content-Security-Policy',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");res.setHeader('content-type','text/html; charset=utf-8');if(url.searchParams.has('download'))res.setHeader('content-disposition','attachment; filename="'+(run.artifactName||'presentation.html')+'"');res.end(content);return;}



 if(url.pathname==='/api/preview-artifact'){const run=runs.get(url.searchParams.get('id')),file=url.searchParams.get('file'),hash=url.searchParams.get('hash');if(!run||!previewFiles.test(file||'')||run.previewArtifact?.file!==file||run.previewArtifact.hash!==hash){send(409,{error:'This complete local preview is not available.'});return;}const bytes=await fs.readFile(path.join(run.dir,'output',file));if(sha256(bytes)!==hash){send(409,{error:'The preview changed. Wait for the latest saved file.'});return;}res.setHeader('Content-Security-Policy',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");res.setHeader('content-type','text/html; charset=utf-8');res.end(bytes);return;}
 if(url.pathname==='/tutorial-catalog.mjs'){res.setHeader('content-type','text/javascript');res.end(await fs.readFile(path.join(root,'src/tutorial-catalog.mjs')));return;}
 if(url.pathname==='/workspace.mjs'){res.setHeader('content-type','text/javascript');res.end(await fs.readFile(path.join(root,'src/workspace.mjs')));return;}
 if(url.pathname==='/api/cover'){const run=runs.get(url.searchParams.get('id'));const style=url.searchParams.get('style');if(!run||!run.previews.some(p=>p.id===style)){send(409,{error:'Generated covers are not available for this run.'});return;}res.setHeader('Content-Security-Policy',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'");res.setHeader('content-type','text/html; charset=utf-8');res.end(await fs.readFile(path.join(run.dir,'output',`preview-${style}.html`)));return;}

 if(url.pathname==='/readiness.mjs'){res.setHeader('content-type','text/javascript');res.end(await fs.readFile(path.join(root,'src/readiness.mjs')));return;}


 if(url.pathname==='/source/tutorial.mp4'){const file=path.join(sourceFolder(url.searchParams.get('id')||originalId),'tutorial.mp4');const stat=await fs.stat(file);let start=0,end=stat.size-1;if(req.headers.range){const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range);if(!match){res.writeHead(416,{'content-range':`bytes */${stat.size}`}).end();return;}start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;if(start>end||start>=stat.size){res.writeHead(416,{'content-range':`bytes */${stat.size}`}).end();return;}res.statusCode=206;res.setHeader('content-range',`bytes ${start}-${end}/${stat.size}`);}res.setHeader('content-type','video/mp4');res.setHeader('accept-ranges','bytes');res.setHeader('content-length',end-start+1);createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);return;}
 const assets={'/':'index.html','/tutorial':'index.html','/execution':'index.html','/run-messages.mjs':'run-messages.mjs','/countdown.mjs':'countdown.mjs','/app.js':'app.js','/styles.css':'styles.css','/favicon.svg':'favicon.svg','/assets/instrument-serif.ttf':'assets/instrument-serif.ttf','/assets/manrope.ttf':'assets/manrope.ttf','/assets/experimental-counter.png':'assets/experimental-counter.png'};const file=assets[url.pathname];if(!file){send(404,{error:'Not found.'});return;}res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; media-src 'self'; frame-src 'self' http://127.0.0.1:4180 https://www.youtube-nocookie.com; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");const ext=path.extname(file);res.setHeader('content-type',({'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf'})[ext]);let content=await fs.readFile(path.join(web,file));if(ext==='.html')content=Buffer.from(content.toString().replace('__TOKEN__',token));res.end(content);


 }catch(e){if(!res.headersSent)send(400,{error:e.message});else res.end();}});app.shutdown=async()=>{closing=true;if(current&&!['complete','failed','stopped'].includes(current.status)){current.stopping=true;current.resolveChoice?.(null);}for(const client of clients)client.end();clients.clear();await Promise.all([...runs.values()].map(run=>run.close?.()));await new Promise(resolve=>{app.close(resolve);app.closeAllConnections();});};app.on('close',()=>{for(const run of runs.values())run.close?.().catch(()=>{});});return app;}


if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){const port=Number(process.env.PORT||4179);const app=createApp();let stopping=false;for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;try{await app.shutdown();}finally{process.exit(0);}});app.listen(port,'127.0.0.1',()=>console.log(`SkillWalk local UI: http://127.0.0.1:${app.address().port}`));}
