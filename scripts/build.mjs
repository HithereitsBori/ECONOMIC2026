#!/usr/bin/env node
// Single-template build: one codebase -> attendee OR staff static site.
// Data URLs come only from env (Netlify site env). Staff URLs are never read for attendee.
import { readFile, writeFile, mkdir, rm, cp, readdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { escapeHTML } from '../src/js/lib/escape.js';
import { bangkokNow, defaultDay } from '../src/js/lib/time.js';
import { headerTexts, dayTabsHTML, zoneTabsHTML, ALL_ZONES } from '../src/js/lib/chrome.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIENCES = ['attendee', 'staff'];
const PUB_RE = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/e\/([A-Za-z0-9_-]+)\/pub\?/;
// Every self-hosted face is preloaded: with font-display: optional a face that misses the ~100ms
// block period is skipped for that page view (no swap = no CLS), so non-preloaded Thai faces would
// silently fall back to the device font. Total ≈250 KB, cached long-term (fonts are immutable).
const FONT_DIR = 'src/assets/fonts';

// Conservative CSS minifier (comments + whitespace only; never touches selector combinators).
export function minifyCSS(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

export function renderTemplate(html, audience) {
  if (!AUDIENCES.includes(audience)) throw new Error(`unknown audience ${audience}`);
  const re = /<!--\s*@(if\s+(\w+)|endif)\s*-->/g;
  let out = '';
  let last = 0;
  let open = null;
  let m;
  while ((m = re.exec(html))) {
    if (m[2]) {
      if (open) throw new Error(`nested @if at ${m.index}`);
      if (!AUDIENCES.includes(m[2])) throw new Error(`unknown @if ${m[2]}`);
      out += html.slice(last, m.index);
      open = { aud: m[2], start: re.lastIndex };
    } else {
      if (!open) throw new Error(`@endif without @if at ${m.index}`);
      if (open.aud === audience) out += html.slice(open.start, m.index);
      open = null;
    }
    last = re.lastIndex;
  }
  if (open) throw new Error('unclosed @if marker');
  return out + html.slice(last);
}

function pubKey(url) {
  const m = url.match(PUB_RE);
  return m ? m[1] : null;
}

function checkCsvUrl(name, url) {
  if (!url) return '';
  if (!pubKey(url)) throw new Error(`${name} must be a Google Sheets "Publish to web" CSV URL (https://docs.google.com/spreadsheets/d/e/<key>/pub?...)`);
  return url;
}

function assetOrHttps(v) {
  if (!v) return '';
  if (/^https:\/\//.test(v)) { try { return new URL(v).href; } catch { return ''; } }
  if (v.startsWith('assets/') && !v.includes('..') && /\.(webp|jpg|png|svg)$/i.test(v)) return encodeURI(v);
  return '';
}

export function buildSiteConfig(audience, env, event, { fixtures = false } = {}) {
  if (!AUDIENCES.includes(audience)) throw new Error(`unknown audience ${audience}`);
  const urls = {
    schedule: checkCsvUrl('SCHEDULE_CSV_URL', env.SCHEDULE_CSV_URL || ''),
    publicFaq: checkCsvUrl('PUBLIC_FAQ_CSV_URL', env.PUBLIC_FAQ_CSV_URL || ''),
  };
  if (audience === 'staff') {
    const staff = checkCsvUrl('STAFF_FAQ_CSV_URL', env.STAFF_FAQ_CSV_URL || '');
    const keys = [urls.schedule, urls.publicFaq].filter(Boolean).map(pubKey);
    if (staff && keys.includes(pubKey(staff))) throw new Error('STAFF_FAQ_CSV_URL must come from a different spreadsheet (pub key) than the public feeds');
    urls.staffFaq = staff;
  }
  if (fixtures) {
    urls.schedule = 'fixtures/schedule.csv';
    urls.publicFaq = 'fixtures/faq-public.csv';
    if (audience === 'staff') urls.staffFaq = 'fixtures/faq-staff.csv';
  }
  const isAtt = audience === 'attendee';
  const surveyUrl = /^https:\/\//.test(env.SURVEY_URL || '') ? new URL(env.SURVEY_URL).href : '';
  const promoImage = assetOrHttps(env.PROMO_IMAGE || '');
  const site = {
    audience,
    buildId: env.BUILD_ID || env.COMMIT_REF?.slice(0, 7) || 'local',
    fixtures: Boolean(fixtures),
    event,
    urls,
    ga4Id: /^G-[A-Z0-9]{6,}$/.test(env.GA4_ID || '') ? env.GA4_ID : '',
    survey: { url: isAtt ? surveyUrl : '', enabled: isAtt && env.SURVEY_DISABLED !== '1' },
    promo: {
      enabled: isAtt && env.PROMO_DISABLED !== '1',
      placeholder: !promoImage,
      image: promoImage,
      href: /^https:\/\//.test(env.PROMO_HREF || '') ? env.PROMO_HREF : '',
      alt: env.PROMO_ALT || '',
    },
    cachePrefix: `ef2026_${audience}_v1_`,
    refreshMs: 300000,
  };
  if (env.RELEASE === '1') {
    if (fixtures) throw new Error('RELEASE=1: fixtures are not allowed in a release build');
    if (!urls.schedule) throw new Error('RELEASE=1: SCHEDULE_CSV_URL is required');
    if (isAtt && site.survey.enabled && !site.survey.url) throw new Error('RELEASE=1: set SURVEY_URL or SURVEY_DISABLED=1');
    if (isAtt && site.promo.enabled && site.promo.placeholder) throw new Error('RELEASE=1: set PROMO_IMAGE or PROMO_DISABLED=1');
  }
  return site;
}

function headersFile(audience) {
  const csp = [
    "default-src 'self'",
    "connect-src 'self' https://docs.google.com https://*.googleusercontent.com https://www.google-analytics.com https://*.google-analytics.com",
    "img-src 'self' data: https:",
    "script-src 'self' https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
  return `/*
  X-Robots-Tag: noindex, nofollow
  Content-Security-Policy: ${csp}
  Referrer-Policy: ${audience === 'staff' ? 'no-referrer' : 'strict-origin-when-cross-origin'}
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Permissions-Policy: camera=(), microphone=(), geolocation=()
/index.html
  Cache-Control: no-cache
/
  Cache-Control: no-cache
/js/*
  Cache-Control: no-cache
/styles.css
  Cache-Control: no-cache
/assets/fonts/*
  Cache-Control: public, max-age=31536000, immutable
`;
}

async function listFiles(dir, base = dir) {
  const out = [];
  for (const name of await readdir(dir)) {
    const p = path.join(dir, name);
    if ((await stat(p)).isDirectory()) out.push(...(await listFiles(p, base)));
    else out.push(path.relative(base, p));
  }
  return out.sort();
}

export async function build({ audience, outDir, env = process.env, fixtures = false, root = ROOT }) {
  if (!AUDIENCES.includes(audience)) throw new Error(`AUDIENCE must be attendee|staff (got ${audience})`);
  const event = JSON.parse(await readFile(path.join(root, 'config/event.json'), 'utf8'));
  const site = buildSiteConfig(audience, env, event, { fixtures });
  const out = path.resolve(outDir);
  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, 'js/lib'), { recursive: true });
  const css = minifyCSS(await readFile(path.join(root, 'src/fonts.css'), 'utf8') + '\n' + await readFile(path.join(root, 'src/styles.css'), 'utf8'));

  await writeFile(path.join(out, 'styles.css'), css);
  await cp(path.join(root, 'src/js/app.js'), path.join(out, 'js/app.js'));
  for (const f of await readdir(path.join(root, 'src/js/lib'))) {
    if (f.endsWith('.js')) await cp(path.join(root, 'src/js/lib', f), path.join(out, 'js/lib', f));
  }
  await cp(path.join(root, `src/js/audience/${audience}.js`), path.join(out, 'js/audience.js'));
  if (existsSync(path.join(root, 'src/assets'))) {
    await cp(path.join(root, 'src/assets'), path.join(out, 'assets'), {
      recursive: true,
      // promo creative is attendee-only
      filter: (src) => !(audience === 'staff' && src.includes(`${path.sep}promo`)),
    });
  }
  await writeFile(path.join(out, 'js/site-config.js'), `// generated by scripts/build.mjs — do not edit\nexport const SITE = ${JSON.stringify(site, null, 2)};\n`);
  // Flatten the ES module waterfall: every module is fetched in parallel with app.js.
  const modules = (await listFiles(path.join(out, 'js'))).filter((f) => f.endsWith('.js') && f !== 'app.js').map((f) => `js/${f.split(path.sep).join('/')}`);
  const fonts = existsSync(path.join(root, FONT_DIR)) ? (await readdir(path.join(root, FONT_DIR))).filter((f) => f.endsWith('.woff2')).sort() : [];
  const headAssets = [
    ...fonts.map((f) => `<link rel="preload" href="assets/fonts/${f}" as="font" type="font/woff2" crossorigin>`),
    ...modules.map((m) => `<link rel="modulepreload" href="${m}">`),
    `<style>${css}</style>`,
  ].join('\n');
  const t = headerTexts(event);
  const day0 = defaultDay(event.days, bangkokNow());
  const tpl = await readFile(path.join(root, 'src/index.html'), 'utf8');
  const html = renderTemplate(tpl, audience)
    .replaceAll('{{EVENT_NAME}}', event.name)
    .replaceAll('{{SITE_TITLE}}', audience === 'staff' ? `[STAFF] ${event.shortName} — คู่มือทีมงาน` : `${event.shortName} — คู่มือผู้เข้าร่วมงาน`)
    .replaceAll('{{BUILD_ID}}', site.buildId)
    .replace('{{TAGLINE}}', escapeHTML(t.tagline))
    .replace('{{META}}', escapeHTML(t.meta))
    .replace('{{TZ}}', escapeHTML(t.tz))
    .replace('{{DAY_TABS}}', dayTabsHTML(event, day0))
    .replace('{{ZONE_TABS}}', zoneTabsHTML(event, ALL_ZONES))
    .replace('{{FIXTURES_HIDDEN}}', fixtures ? '' : ' hidden')
    .replace('{{HEAD_ASSETS}}', () => headAssets);
  if (/\{\{[A-Z_]+\}\}/.test(html)) throw new Error(`unreplaced placeholder ${html.match(/\{\{[A-Z_]+\}\}/)[0]}`);
  await writeFile(path.join(out, 'index.html'), html);
  const notFound = await readFile(path.join(root, 'src/404.html'), 'utf8');
  await writeFile(path.join(out, '404.html'), notFound.replaceAll('{{EVENT_NAME}}', event.name));
  await writeFile(path.join(out, '_headers'), headersFile(audience));
  await writeFile(path.join(out, 'robots.txt'), 'User-agent: *\nDisallow: /\n');
  if (fixtures) {
    await mkdir(path.join(out, 'fixtures'), { recursive: true });
    const names = ['schedule.csv', 'faq-public.csv', ...(audience === 'staff' ? ['faq-staff.csv'] : [])];
    // Preview uses clean editorial demo data only; adversarial XSS/odd-format/HOLD cases stay in
    // tests/fixtures/*.csv and are only fed to unit tests and mocked e2e runs.
    for (const n of names) await cp(path.join(root, 'tests/fixtures/preview', n), path.join(out, 'fixtures', n));
  }
  return { files: await listFiles(out), site };
}

function parseArgs(argv) {
  const a = { fixtures: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--audience') a.audience = argv[++i];
    else if (argv[i] === '--out') a.out = argv[++i];
    else if (argv[i] === '--fixtures') a.fixtures = true;
  }
  return a;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = parseArgs(process.argv.slice(2));
  const audience = args.audience || process.env.AUDIENCE;
  if (!audience) { console.error('error: pass --audience attendee|staff or set AUDIENCE'); process.exit(1); }
  const env = { ...process.env };
  if (!env.BUILD_ID) { try { env.BUILD_ID = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { /* not a git checkout */ } }
  build({ audience, outDir: args.out || 'dist', env, fixtures: args.fixtures || env.FIXTURES === '1' })
    .then(({ files }) => console.log(`built ${audience}${args.fixtures || env.FIXTURES === '1' ? ' (fixtures)' : ''} -> ${args.out || 'dist'} (${files.length} files)`))
    .catch((e) => { console.error('build failed:', e.message); process.exit(1); });
}
