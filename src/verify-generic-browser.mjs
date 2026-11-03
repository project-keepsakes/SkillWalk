import {checkSourceContract} from './contract-browser-checks.mjs';
import fs from 'node:fs/promises';
import http from 'node:http';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const plan = JSON.parse(await fs.readFile('/input/plan.json', 'utf8'));
const html = await fs.readFile('/input/website.html');
const report = {checks: [], errors: [], blocked: [], isolation: {network: 'none', browserSandbox: true}};
const event = (type, data = {}) => console.log('@@SKILLWALK ' + JSON.stringify({type, ...data}));
const server = http.createServer((req, res) => {
  res.setHeader('content-type', 'text/html');
  res.setHeader('content-security-policy', "sandbox allow-scripts; default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'");
  res.end(html);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, page;
try {
  browser = await chromium.launch({headless: true, chromiumSandbox: true});
  const context = await browser.newContext({viewport: {width: 1280, height: 800}, serviceWorkers: 'block'});
  await context.route('**/*', route => {
    if (route.request().url() === origin + '/') return route.continue();
    report.blocked.push(route.request().url());
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
  await page.screencast.start({
    size: {width: 1280, height: 800},
    onFrame: ({data, timestamp, viewportWidth, viewportHeight}) => event('browser-frame', {
      image: data.toString('base64'), timestamp, width: viewportWidth, height: viewportHeight
    })
  });
  event('browser-start', {capture: 'Isolated Chromium'});
  await page.goto(origin + '/');
  if (plan.content) await checkSourceContract(page, plan, label => { report.checks.push(label); event('check', {check: label}); });
  for (const check of plan.checks || []) {
    if (check.type === 'click_console') {
      const escaped = RegExp.escape(check.target);
      const target = page.getByRole('button', {name: new RegExp('^' + escaped + '$', 'i')});
      assert.equal(await target.count(), 1, 'Missing button label: ' + check.target);
      const pending = page.waitForEvent('console', {predicate: message =>
        message.type() === 'log' && message.text() === check.expected, timeout: 5000});
      await Promise.all([pending, target.click({timeout: 3000})]);
      const label = 'Clicked ' + check.target + '; console: ' + check.expected;
      report.checks.push(label);
      event('check', {check: label});
      continue;
    }
    if (check.type === 'click') {
      const alreadyVisible = await page.getByText(check.expected, {exact: true}).first().isVisible().catch(() => false);
      assert.equal(alreadyVisible, false, 'Interaction result was already visible');
      await page.getByRole('button', {name: check.target, exact: true}).click();
    }
    assert.ok(await page.getByText(check.expected, {exact: true}).first().isVisible(),
      'Missing visible source requirement: ' + check.expected);
    const label = (check.type === 'click' ? 'Clicked ' + check.target + '; visible: ' : 'Visible: ') + check.expected;
    report.checks.push(label);
    event('check', {check: label});
  }
  await page.screenshot({path: '/output/generic-desktop.png', fullPage: true});
  for (const width of [1280, 390]) {
    await page.setViewportSize({width, height: 800});
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert.ok(overflow <= 2, 'Horizontal overflow at ' + width);
    report.checks.push('No horizontal overflow at ' + width);
  }
  assert.deepEqual(report.errors, [], 'JavaScript errors');
  assert.deepEqual(report.blocked, [], 'External requests');
  await page.screenshot({path: '/output/generic.png', fullPage: true});
  report.passed = true;
} catch (error) {
  report.passed = false;
  report.failure = error.message;
  event('check-failed', {failure: error.message});
  process.exitCode = 1;
} finally {
  await page?.screencast.stop().catch(() => {});
  event('browser-end');
  await browser?.close();
  server.close();
  await fs.writeFile('/output/generic-report.json', JSON.stringify(report, null, 2));
}
