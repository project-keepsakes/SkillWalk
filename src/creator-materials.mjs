import path from 'node:path';
import {json, sha256} from './util.mjs';

const allowedHosts = new Set(['api.github.com', 'raw.githubusercontent.com', 'codepen.io']);
export async function readPublicText(url, limit = 131072) {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !allowedHosts.has(target.hostname) || target.username || target.password || target.port) throw Error('Unsupported creator-material URL');
  const response = await fetch(target, {redirect: 'error', headers: {'accept': 'application/vnd.github+json', 'user-agent': 'SkillWalk-local-source-reader'}, signal: AbortSignal.timeout(20000)});
  if (!response.ok) throw Error('Creator material HTTP ' + response.status);
  let size = 0; const chunks = [];
  for await (const chunk of response.body) { size += chunk.length; if (size > limit) throw Error('Creator material exceeds source limit'); chunks.push(chunk); }
  return Buffer.concat(chunks).toString('utf8');
}

export function creatorLinks(description) {
  return [...new Set((description || '').match(/https:\/\/(?:github\.com|codepen\.io)\/[^\s<>"\)]+/g) || [])].slice(0, 4);
}

export async function acquireCreatorMaterials(metadata, output) {
  const files = [], failures = [];
  const add = (url, name, text, revision, collection) => files.push({id: 'm' + files.length, url, name, text, revision, collection, sha256: sha256(text)});
  for (const link of creatorLinks(metadata.description)) {
    try {
      const url = new URL(link), parts = url.pathname.split('/').filter(Boolean);
      if (url.hostname === 'codepen.io') {
        if (!/^[\w-]+$/.test(parts[0]) || parts[1] !== 'pen' || !/^[a-zA-Z0-9]+$/.test(parts[2])) continue;
        for (const ext of ['html', 'css', 'js']) {
          const fileURL = `https://codepen.io/${parts[0]}/pen/${parts[2]}.${ext}`;
          const text = await readPublicText(fileURL);
          if (/challenge-platform|Just a moment|Access denied/i.test(text)) throw Error('Creator source is not publicly accessible');
          add(fileURL, 'index.' + ext, text, 'content-sha256', link);
        }
        continue;
      }
      const [owner, repo, kind, ref, ...scope] = parts;
      if (![owner, repo].every(p => /^[\w.-]+$/.test(p || ''))) continue;
      if (kind && !['blob', 'tree'].includes(kind)) throw Error('Unsupported GitHub creator path');
      const api = `https://api.github.com/repos/${owner}/${repo}`;
      const commit = JSON.parse(await readPublicText(api + '/commits/' + encodeURIComponent(ref || 'HEAD'))).sha;
      if (!/^[a-f0-9]{40}$/.test(commit)) throw Error('Creator revision could not be pinned');
      const pending = [{file: scope.join('/'), depth: 0}];
      let visited = 0;
      while (pending.length && files.length < 16 && visited++ < 6) {
        const item = pending.shift();
        const listing = JSON.parse(await readPublicText(api + '/contents/' + item.file.split('/').map(encodeURIComponent).join('/') + '?ref=' + commit));
        const entries = (Array.isArray(listing) ? listing : [listing]).sort((a, b) => /^(?:SKILL|README|index)\./i.test(b.name) - /^(?:SKILL|README|index)\./i.test(a.name));
        for (const entry of entries) {
          if (files.length >= 16) break;
          if (entry.type === 'dir' && item.depth < 1 && !/node_modules|\.git|assets|images/i.test(entry.name)) pending.push({file: entry.path, depth: item.depth + 1});
          if (entry.type !== 'file' || entry.size > 131072 || !/\.(?:html?|css|js|md|py|txt)$/i.test(entry.name)) continue;
          const raw = `https://raw.githubusercontent.com/${owner}/${repo}/${commit}/${entry.path.split('/').map(encodeURIComponent).join('/')}`;
          add(raw, entry.path, await readPublicText(raw), commit, `${owner}/${repo}@${commit}`);
        }
      }
    } catch (error) { failures.push({url: link, reason: error.message}); }
  }
  const result = {files, failures};
  await json(path.join(output, 'creator-materials.json'), result);
  return result;
}

export function bundleCreatorHTML(entry, files) {
  const map = new Map(files.filter(file => file.collection === entry.collection).map(file => [file.name, file.text]));
  const resolve = value => {
    if (/^[a-z]+:|^\/\//i.test(value)) throw Error('Creator HTML requires external assets');
    const name = path.posix.normalize(path.posix.join(path.posix.dirname(entry.name), value));
    if (name.startsWith('../') || !map.has(name)) throw Error('Required creator file is unavailable: ' + value);
    return map.get(name);
  };
  let html = entry.text.replace(/<link\b[^>]*\brel=["']stylesheet["'][^>]*>/gi, tag => {
    const href = tag.match(/\bhref=["']([^"']+)["']/i)?.[1];
    if (!href) throw Error('Missing stylesheet path');
    return '<style>' + resolve(href).replace(/<\/style/gi, '<\\/style') + '</style>';
  });
  html = html.replace(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/script>/gi, (_, src) => '<script>' + resolve(src).replace(/<\/script/gi, '<\\/script') + '</script>');
  if (!/<html\b/i.test(html)) html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + (map.get('index.css') || '') + '</style></head><body>' + html + '<script>' + (map.get('index.js') || '') + '</script></body></html>';
  return html;
}
