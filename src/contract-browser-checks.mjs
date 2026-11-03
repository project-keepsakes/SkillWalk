import assert from 'node:assert/strict';

export async function checkSourceContract(page, contract, record) {
  for (const item of contract.content) {
    const clean = value => value.replace(/\s+/g, ' ').trim();
    if(item.selector==='title') {
      assert.equal(clean(await page.title()),clean(item.text),'Incorrect source document title');
      record('Source document title: '+item.text);
      continue;
    }
    const candidates = page.locator(item.selector);
    let matched = false;
    for (let i = 0; i < await candidates.count(); i++) {
      const candidate = candidates.nth(i);
      if (await candidate.isVisible() && clean(await candidate.innerText()).includes(clean(item.text))) { matched = true; break; }
    }
    assert.ok(matched, `Missing source content in ${item.selector}: ${item.text}`);
    record(`Source content: ${item.text}`);
  }
  for (const item of contract.structure) {
    assert.ok(await page.locator(item.selector).count() >= item.minimum, `Missing source structure: ${item.selector} (minimum ${item.minimum})`);
    record(`Source structure: ${item.selector}`);
  }
  for (const item of contract.styles) {
    const values = await page.locator(item.selector).evaluateAll((elements, rule) => elements.map(element => {
      const actual = getComputedStyle(element).getPropertyValue(rule.property);
      const probe = document.createElement('span');
      if (rule.property.endsWith('-width') && rule.property.startsWith('border-')) probe.style.borderStyle = 'solid';
      probe.style.setProperty(rule.property, rule.value);
      if (!probe.style.getPropertyValue(rule.property)) return {actual, expected: 'INVALID SOURCE CSS'};
      element.parentElement.append(probe);
      const expected = getComputedStyle(probe).getPropertyValue(rule.property);
      probe.remove();
      return {actual, expected};
    }), item);
    assert.ok(values.length, `Missing styled source element: ${item.selector}`);
    for (const value of values) assert.equal(value.actual, value.expected,
      `Source style ${item.selector} ${item.property}: expected ${value.expected}, got ${value.actual}`);
    record(`Source style: ${item.selector} ${item.property} = ${item.value}`);
  }
  for (const item of contract.interactions) {
    const result=page.locator(item.resultSelector||'body').getByText(item.expected,{exact:true});
    if(item.type!=='click_console') {
      let visible=false;
      for(let i=0;i<await result.count();i++)visible ||= await result.nth(i).isVisible();
      assert.equal(visible,false,'Expected source result was already visible before the action: '+item.expected);
    }
    if (item.type === 'keypress') {
      await page.keyboard.press(item.target);
    } else {
      const target = page.getByRole('button', {name: new RegExp('^' + RegExp.escape(item.target) + '$', 'i')});
      assert.equal(await target.count(), 1, 'Missing unique source button: ' + item.target);
      if (item.type === 'click_console') {
        const log = page.waitForEvent('console', {predicate: message => message.type() === 'log' && message.text() === item.expected, timeout: 5000});
        await Promise.all([log, target.click({timeout: 3000})]);
        record(`Source interaction: ${item.target} logs ${item.expected}`);
        continue;
      }
      const before = await page.locator('body').innerText();
      await target.click({timeout: 3000});
      await page.waitForFunction(previous => document.body.innerText !== previous, before, {timeout: 3000});
    }
    assert.ok(await result.first().isVisible(), 'Missing source interaction result: ' + item.expected);
    record(`Source interaction: ${item.target} shows ${item.expected}`);
  }
}
