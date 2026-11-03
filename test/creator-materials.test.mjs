import test from 'node:test';
import assert from 'node:assert/strict';
import {creatorLinks, bundleCreatorHTML, readPublicText} from '../src/creator-materials.mjs';
test('creator sources are bounded public links, not arbitrary tutorial-controlled URLs', async () => {
  assert.deepEqual(creatorLinks('https://github.com/example/demo https://localhost/private https://example.net/script'), ['https://github.com/example/demo']);
  await assert.rejects(() => readPublicText('http://127.0.0.1/secret'), /Unsupported/);
  await assert.rejects(() => readPublicText('https://user:password@api.github.com/repos/a/b'), /Unsupported/);
});
test('creator HTML bundling preserves content and isolates repository namespaces', () => {
  const entry = {collection: 'first', name: 'demo/index.html', text: '<html><head><link rel="stylesheet" href="style.css"></head><body>Hello<script src="app.js"></script></body></html>'};
  const files = [entry, {collection: 'first', name: 'demo/style.css', text: 'body{color:red}'}, {collection: 'first', name: 'demo/app.js', text: 'console.log("hello")'}, {collection: 'second', name: 'demo/style.css', text: 'body{color:blue}'}];
  const bundled = bundleCreatorHTML(entry, files);
  assert.match(bundled, /color:red/); assert.doesNotMatch(bundled, /color:blue|src=|href=/);
  assert.throws(() => bundleCreatorHTML(entry, [entry, files[2], files[3]]), /unavailable/);
  assert.throws(() => bundleCreatorHTML({...entry, text: entry.text.replace('style.css', 'https://example.net/style.css')}, files), /external/);
});
