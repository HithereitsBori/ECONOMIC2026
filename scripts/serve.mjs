#!/usr/bin/env node
// Minimal static server for local dev / e2e (no dependencies).
// Applies the site's Netlify-style _headers ("/*" block) so CSP is exercised locally.
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const argv = process.argv.slice(2);
const get = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const dir = path.resolve(get('--dir', 'dist'));
const port = Number(get('--port', 4173));

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

async function siteHeaders(siteRoot) {
  try {
    const txt = await readFile(path.join(siteRoot, '_headers'), 'utf8');
    const out = {};
    let inGlobal = false;
    for (const line of txt.split('\n')) {
      if (!line.trim()) continue;
      if (!/^\s/.test(line)) { inGlobal = line.trim() === '/*'; continue; }
      if (inGlobal) { const i = line.indexOf(':'); out[line.slice(0, i).trim()] = line.slice(i + 1).trim(); }
    }
    return out;
  } catch { return {}; }
}

async function exists(p) { try { return (await stat(p)).isFile(); } catch { return false; } }

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let rel = decodeURIComponent(url.pathname);
  if (rel.includes('..')) { res.writeHead(400).end(); return; }
  if (rel.endsWith('/')) rel += 'index.html';
  let file = path.join(dir, rel);
  // site root = first path segment if it holds an index.html (multi-site e2e root), else dir
  const seg = rel.split('/').filter(Boolean)[0];
  const siteRoot = seg && await exists(path.join(dir, seg, 'index.html')) ? path.join(dir, seg) : dir;
  if (!(await exists(file)) && await exists(path.join(file, 'index.html'))) {
    res.writeHead(301, { Location: url.pathname + '/' }).end(); return;
  }
  const headers = { ...(await siteHeaders(siteRoot)), 'Cache-Control': 'no-cache' };
  if (!(await exists(file))) {
    const nf = path.join(siteRoot, '404.html');
    res.writeHead(404, { ...headers, 'Content-Type': 'text/html; charset=utf-8' });
    res.end(await exists(nf) ? await readFile(nf) : 'Not found');
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`serving ${dir} on http://localhost:${port}`));
