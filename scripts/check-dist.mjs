#!/usr/bin/env node
// Leak gates: run against each build output and against the repo source.
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEGACY_DENYLIST, STAFF_MARKERS, INTERNAL_COLUMNS, UNCONFIRMED_VENUE_TERMS } from './denylist.mjs';

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.cjs', '.css', '.json', '.txt', '.csv', '.svg', '.md', '.toml', '']);

async function walk(dir, base = dir, skip = () => false) {
  const out = [];
  let names;
  try { names = await readdir(dir); } catch { return out; }
  for (const name of names) {
    const p = path.join(dir, name);
    const rel = path.relative(base, p);
    if (skip(rel)) continue;
    if ((await stat(p)).isDirectory()) out.push(...(await walk(p, base, skip)));
    else out.push(rel);
  }
  return out;
}

const pubKey = (u) => (u || '').match(/\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\//)?.[1];

export async function checkDist({ dir, audience, env = process.env }) {
  const violations = [];
  const files = await walk(dir);
  const needles = [...LEGACY_DENYLIST, ...INTERNAL_COLUMNS, ...UNCONFIRMED_VENUE_TERMS];
  if (env.DRAFT_SHEET_ID) needles.push(env.DRAFT_SHEET_ID);
  if (audience === 'attendee') {
    needles.push(...STAFF_MARKERS);
    if (env.STAFF_FAQ_CSV_URL) {
      needles.push(env.STAFF_FAQ_CSV_URL);
      const k = pubKey(env.STAFF_FAQ_CSV_URL);
      if (k) needles.push(k);
    }
  }
  for (const rel of files) {
    const posix = rel.split(path.sep).join('/');
    if (audience === 'attendee' && /staff/i.test(posix)) violations.push({ file: posix, needle: '<filename contains "staff">' });
    if (posix.endsWith('.csv') && !posix.startsWith('fixtures/')) violations.push({ file: posix, needle: '<csv outside fixtures/>' });
    if (env.RELEASE === '1' && posix.startsWith('fixtures/')) violations.push({ file: posix, needle: '<fixtures in release build>' });
    if (!TEXT_EXT.has(path.extname(posix)) && posix !== '_headers') continue;
    const text = await readFile(path.join(dir, rel), 'utf8');
    for (const n of needles) if (n && text.includes(n)) violations.push({ file: posix, needle: n });
  }
  if (!files.includes('index.html')) violations.push({ file: 'index.html', needle: '<missing>' });
  return { ok: violations.length === 0, violations };
}

export async function checkSource({ root }) {
  const violations = [];
  const targets = ['src', 'config', 'scripts', 'tools', 'tests', 'README.md', 'netlify.toml', 'package.json', '.env.example'];
  for (const t of targets) {
    const p = path.join(root, t);
    let files;
    try { files = (await stat(p)).isDirectory() ? (await walk(p, root)) : [t]; } catch { continue; }
    for (const rel of files) {
      const posix = rel.split(path.sep).join('/');
      if (posix === 'scripts/denylist.mjs') continue;
      if (!TEXT_EXT.has(path.extname(posix))) continue;
      const text = await readFile(path.join(root, rel), 'utf8');
      const needles = [...LEGACY_DENYLIST];
      // Unconfirmed venue facts must not be authored in shipped source (tests may name them to assert absence).
      if (posix.startsWith('src/') || posix.startsWith('config/')) needles.push(...UNCONFIRMED_VENUE_TERMS);
      // Real published CSV URLs belong in Netlify env only.
      if (!posix.startsWith('tests/') && /docs\.google\.com\/spreadsheets\/d\/e\/(?!(<|\.\.\.|KEY|\[))[A-Za-z0-9_-]{20,}/.test(text)) violations.push({ file: posix, needle: '<published sheet url>' });
      // Google OAuth tokens / API keys
      if (/ya29\.[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{35}|"refresh_token"\s*:/.test(text)) violations.push({ file: posix, needle: '<google credential>' });
      for (const n of needles) if (text.includes(n)) violations.push({ file: posix, needle: n });
    }
  }
  return { ok: violations.length === 0, violations };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const get = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
  const run = async () => {
    let res;
    let label;
    if (get('--source')) { res = await checkSource({ root: path.resolve(get('--source')) }); label = `source ${get('--source')}`; }
    else {
      const dir = get('--dir') || 'dist';
      const audience = get('--audience') || process.env.AUDIENCE;
      if (!audience) { console.error('check-dist: --audience or AUDIENCE required'); process.exit(1); }
      res = await checkDist({ dir, audience });
      label = `${audience} ${dir}`;
    }
    if (!res.ok) {
      for (const v of res.violations) console.error(`${v.file}: ${v.needle}`);
      console.error(`check FAILED (${label}): ${res.violations.length} violation(s)`);
      process.exit(1);
    }
    console.log(`check ok (${label}): 0 violations`);
  };
  run();
}
