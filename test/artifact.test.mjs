import {test} from 'node:test';import assert from 'node:assert/strict';import {normalizeHTML,artifactIssues} from '../src/artifact.mjs';
test('inert CSS policy commentary does not cause a false network rejection',()=>{
 const wrap=css=>'<html><head><style>'+css+'</style></head><body>Local</body></html>';
 assert.deepEqual(artifactIssues(wrap('/* No @import url() as per instructions to remove external network calls */ body{color:black}')),[]);
 assert.ok(artifactIssues(wrap('/* comment */ @import "https://example.com/font.css";')).length);
 assert.ok(artifactIssues(wrap('body{content:"/*";background:url(https://example.com/image.png)}')).length);
 assert.ok(artifactIssues(wrap('/* </style><script src="https://example.com/run.js"></script><style> */')).length);
 assert.ok(artifactIssues(wrap('/* unclosed </style><iframe src="/x"></iframe><style>')).length);
 for(const prefix of ['<script>const x="<style>/*";</script>', '<!-- <style>/* -->', '<div data-note="<style>/*">', '<head><title><style>/*</title></head>']){
  assert.ok(artifactIssues('<html>'+prefix+'<script src="https://example.com/x.js"></script>*/</style></html>').length);
 }
 for(const endTag of ['</style data-x>','</style/>','</style\nfoo>','</style\ffoo>']){
  assert.ok(artifactIssues(wrap('/* '+endTag+'<script>fetch(String.fromCharCode(47,47,101,118,105,108))</script> */')).length);
 }
 for(const tag of ['style-x','style:example']){
  assert.ok(artifactIssues('<html><head><'+tag+'>/* <script>fetch(String.fromCharCode(47,47,101,118,105,108))</script> */ </style></head><body></body></html>').length);
 }
});
test('reject the actual generated remote-font regression',()=>{assert.ok(artifactIssues('<!doctype html><html><head><link rel="stylesheet" href="https://api.fontshare.com/v2/css?f=DejaVu"></head></html>').some(x=>x.includes('Unsupported network')));});
test('allow local inline presentation markup without altering it',()=>{const html='<!doctype html><html><style>body{font-family:"DejaVu Serif",serif}</style><body><section>Local</section><script>document.body.dataset.ready="true"</script></body></html>';assert.deepEqual(artifactIssues(html),[]);assert.equal(normalizeHTML('```html\n'+html+'\n```'),html);});
test('reject incomplete artifacts and active external embedding',()=>{assert.ok(artifactIssues('<html><body>unfinished').length);assert.ok(artifactIssues('<html><iframe src="/x"></iframe></html>').length);});

test('ordinary onboarding text and quoted attribute values are not executable handlers',()=>{assert.deepEqual(artifactIssues('<html><body><p data-note="onboarding = 10 min">onboarding = 10 min</p></body></html>'),[]);});

test('encoded executable links are rejected while local SVG references remain valid',()=>{assert.ok(artifactIssues('<html><body><a href="java&#x73;cript&#58;alert(1)">x</a></body></html>').length);assert.deepEqual(artifactIssues('<html><body><svg><use href="#local-shape"></use></svg></body></html>'),[]);});
