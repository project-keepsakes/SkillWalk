// Controlled browser negative controls, deliberately unrelated to any tutorial.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {checkSourceContract} from './contract-browser-checks.mjs';
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage();
  const contract = {content: [{selector: 'h1', text: 'Independent fixture'}],
    structure: [{selector: 'ul > li', minimum: 2}], styles: [{selector: 'h1', property: 'color', value: 'blue'}, {selector: 'ul', property: 'border-top-width', value: '2px'}], interactions: []};
  const html = '<h1 style="color:blue">Independent fixture</h1><ul style="border:2px solid black"><li>A</li><li>B</li></ul>';
  await page.setContent(html); await checkSourceContract(page, contract, () => {});
  for (const [before, after, expected] of [['color:blue', 'color:red', /Source style/], ['2px solid black', '2px solid solid', /Source style/], ['Independent fixture', 'Placeholder', /Missing source content/], ['color:blue', 'color:blue;display:none', /Missing source content/], ['<li>B</li>', '', /Missing source structure/]]) {
    await page.setContent(html.replace(before, after));
    await assert.rejects(() => checkSourceContract(page, contract, () => {}), expected);
  }
  const transition={content:[],structure:[],styles:[],interactions:[{type:'click',target:'Increment',resultSelector:'#counter',expected:'1'}]};
  const counter='<p>1</p><p id="counter">0</p><button>Increment</button><p id="other">unchanged</p>';
  await page.setContent(counter+'<script>document.querySelector("button").addEventListener("click",()=>document.querySelector("#counter").textContent="1")</script>');
  await checkSourceContract(page,transition,()=>{});
  await page.setContent(counter.replace('id="counter">0','id="counter">1')+'<script>document.querySelector("button").addEventListener("click",()=>document.querySelector("#other").textContent="changed")</script>');
  await assert.rejects(()=>checkSourceContract(page,transition,()=>{}),/already visible/);
  const title={content:[{selector:'title',text:'Source title'}],structure:[],styles:[],interactions:[]};
  await page.setContent('<title>Source title</title><p>Visible content</p>');await checkSourceContract(page,title,()=>{});
  await page.setContent('<title>Incorrect title</title><p>Visible content</p>');await assert.rejects(()=>checkSourceContract(page,title,()=>{}),/Incorrect source document title/);
  console.log(JSON.stringify({passed: true, controls: ['correct fixture', 'wrong color', 'invalid border', 'wrong content', 'hidden content', 'missing structure','scoped result transition','unrelated change with preexisting result']}));
} finally { await browser.close(); }
