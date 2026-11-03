import fs from 'node:fs/promises';
import http from 'node:http';
import {chromium} from 'playwright';
// Independent of the host process: an interrupted analysis cannot leave a
// tutorial script running indefinitely in its detached Docker workload.
const deadline=setTimeout(()=>{console.error('Creator reference exceeded its isolated time budget');process.exit(124);},45000);
const html=await fs.readFile('/input/source-reference.html');
const server=http.createServer((req,res)=>{
  res.setHeader('content-type','text/html');
  res.setHeader('content-security-policy',"sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'");
  res.end(html);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
let browser;
try {
  browser=await chromium.launch({headless:true,chromiumSandbox:true});
  const context=await browser.newContext({viewport:{width:1280,height:800},serviceWorkers:'block'});
  const errors=[],blocked=[];
  await context.route('**/*',route=>route.request().url()===origin+'/'?route.continue():(blocked.push(route.request().url()),route.abort()));
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(origin+'/');
  const facts=await page.evaluate(()=>{
    const selector=element=>{
      if(element.id && document.querySelectorAll('#'+CSS.escape(element.id)).length===1)return '#'+CSS.escape(element.id);
      const parts=[];let node=element;
      while(node&&node!==document.documentElement){
        const tag=node.tagName.toLowerCase(),siblings=[...(node.parentElement?.children||[])].filter(n=>n.tagName===node.tagName);
        parts.unshift(tag+':nth-of-type('+(siblings.indexOf(node)+1)+')');node=node.parentElement;
      }
      return 'html > '+parts.join(' > ');
    };
    const elements=[...document.querySelectorAll('body, h1,h2,h3,h4,h5,h6,p,li,dt,dd,th,td,caption,label,button,input,select,a,table')]
      .filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height&&getComputedStyle(e).visibility==='visible').slice(0,32);
    const content=[{selector:'title',text:document.title},...elements.filter(e=>e!==document.body&&!e.querySelector('p,li,dt,dd,th,td,button,label')).map(e=>({selector:selector(e),text:e.innerText?.trim()||''}))].filter(e=>e.text&&e.text.length<=1500).slice(0,32);
    const styled=elements.slice(0,6);
    const properties=['color','background-color','font-family','font-size','border-top-width'];
    return {content,structure:elements.map(e=>({selector:selector(e),minimum:1})),styles:styled.flatMap(e=>properties.map(property=>({selector:selector(e),property,value:getComputedStyle(e).getPropertyValue(property)}))),buttons:[...document.querySelectorAll('button')].map(e=>e.innerText)};
  });
  if(errors.length||blocked.length)throw Error('Creator reference needs unsupported runtime: '+[...errors,...blocked].join('; '));
  await page.screenshot({path:'/output/source-reference.png',fullPage:true});
  await fs.writeFile('/output/source-reference-facts.json',JSON.stringify(facts,null,2));
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));clearTimeout(deadline);}
