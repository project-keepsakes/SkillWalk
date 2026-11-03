// Controlled real-server/browser regression; no video acquisition or model calls.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {createApp} from './server.mjs';
import {GenericRun} from './generic-run.mjs';

const errors = [];
let executions = 0;
class ControlledRun extends GenericRun {
  async analyze() {
    this.plan = {supported: true, summary: 'Controlled source-derived HTML task', steps: [
      {action: 'Create a local checklist', timestamp: 12, quote: 'Add a checklist', sourceKind: 'caption'},
      {action: 'Arrange checklist controls', timestamp: 24, quote: 'A checklist beside a button', sourceKind: 'frame-observation'}
    ]};
    // This is the actual generic brief shape: it has neither slides nor kind.
    this.demoBrief = {title: 'Controlled checklist'};
    this.demoSource = 'Controlled fixture; no source or model evidence';
    this.state('review', 'Controlled plan ready');
  }
  async execute() {
    executions++;
    this.state('generating', 'Controlled execution accepted');
  }
  async saveWorkspace() {}
}
const app = createApp({restore: false,
  runFactory: (_, id, notify, tutorial) => new ControlledRun(id, notify, tutorial)});
let browser;
try {
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${app.address().port}`;
  const html = await (await fetch(origin)).text();
  const token = html.match(/name="skillwalk-token" content="([a-f0-9]+)"/)[1];
  const response = await fetch(origin + '/api/analyze', {method: 'POST', headers: {
    origin, 'x-skillwalk-token': token, 'content-type': 'application/json'
  }, body: JSON.stringify({url: 'https://youtu.be/abcdefghijk'})});
  assert.equal(response.status, 202);
  browser = await chromium.launch({channel: 'msedge', headless: true});
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin + '/execution');
  await page.waitForTimeout(300);
  assert.deepEqual(errors, [], 'Generic snapshot must render without presentation-field errors');
  assert.equal(await page.locator('#run-title').innerText(), 'Controlled checklist');
  assert.equal(await page.locator('#customize').isVisible(), false);
  assert.equal(await page.locator('#run-now').isEnabled(), true);
  assert.doesNotMatch(await page.locator('#execution-page').innerText(), /Cover previews/);
  assert.match(await page.locator('#plan li').nth(0).textContent(), /Video caption 0:12/);
  assert.match(await page.locator('#plan li').nth(1).textContent(), /Model interpretation of video frame 0:24/);
  // Reconnect before approval pauses; approval then needs no form/style input.
  assert.equal(executions, 0);
  await page.locator('#run-now').click();
  await page.waitForFunction(() => document.querySelector('#stage').textContent === 'Controlled execution accepted');
  assert.equal(executions, 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#stage').textContent === 'Controlled execution accepted');
  assert.equal(executions, 1);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({passed: true, evidence: 'Controlled real-server/browser generic review, approval and reconnect; no inference', executions, errors}));
} finally {
  await browser?.close();
  await app.shutdown();
}
