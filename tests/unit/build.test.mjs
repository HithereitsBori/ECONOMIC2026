import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renderTemplate, buildSiteConfig, build } from '../../scripts/build.mjs';
import { checkDist, checkSource } from '../../scripts/check-dist.mjs';
import { LEGACY_DENYLIST, UNCONFIRMED_VENUE_TERMS } from '../../scripts/denylist.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const event = JSON.parse(await readFile(path.join(ROOT, 'config/event.json'), 'utf8'));
const tmp = () => mkdtemp(path.join(process.env.TMPDIR || os.tmpdir(), 'ef-build-'));

const PUB = (key, gid) => `https://docs.google.com/spreadsheets/d/e/${key}/pub?gid=${gid}&single=true&output=csv`;
const ENV = {
  SCHEDULE_CSV_URL: PUB('TESTPUBLIC', 1),
  PUBLIC_FAQ_CSV_URL: PUB('TESTPUBLIC', 2),
  STAFF_FAQ_CSV_URL: PUB('STAFFSENTINEL', 3),
};

test('renderTemplate keeps own block and strips the other audience', () => {
  const tpl = 'a<!-- @if staff -->S<!-- @endif -->b<!-- @if attendee -->A<!-- @endif -->c';
  assert.equal(renderTemplate(tpl, 'attendee'), 'abAc');
  assert.equal(renderTemplate(tpl, 'staff'), 'aSbc');
});
test('renderTemplate throws on unclosed / nested markers', () => {
  assert.throws(() => renderTemplate('<!-- @if staff -->x', 'attendee'), /unclosed/);
  assert.throws(() => renderTemplate('<!-- @if staff --><!-- @if attendee --><!-- @endif --><!-- @endif -->', 'staff'), /nested/);
});
test('buildSiteConfig attendee never includes staffFaq even if STAFF_FAQ_CSV_URL set', () => {
  const s = buildSiteConfig('attendee', ENV, event);
  assert.equal('staffFaq' in s.urls, false);
  assert.equal(JSON.stringify(s).includes('STAFFSENTINEL'), false);
  assert.equal(buildSiteConfig('staff', ENV, event).urls.staffFaq, ENV.STAFF_FAQ_CSV_URL);
});
test('rejects non-google csv url', () => {
  assert.throws(() => buildSiteConfig('attendee', { SCHEDULE_CSV_URL: 'https://evil.example/x.csv' }, event), /Publish to web/);
});
test('rejects staff url sharing public pub key', () => {
  assert.throws(() => buildSiteConfig('staff', { ...ENV, STAFF_FAQ_CSV_URL: PUB('TESTPUBLIC', 9) }, event), /different spreadsheet/);
});
test('RELEASE=1 gates', () => {
  assert.throws(() => buildSiteConfig('attendee', { ...ENV, RELEASE: '1', PROMO_DISABLED: '1' }, event), /SURVEY_URL/);
  assert.throws(() => buildSiteConfig('attendee', { ...ENV, RELEASE: '1', SURVEY_DISABLED: '1' }, event), /PROMO_IMAGE/);
  assert.throws(() => buildSiteConfig('attendee', { ...ENV, RELEASE: '1', SURVEY_DISABLED: '1', PROMO_DISABLED: '1' }, event, { fixtures: true }), /fixtures/);
  assert.throws(() => buildSiteConfig('staff', { RELEASE: '1' }, event), /SCHEDULE_CSV_URL/);
  assert.doesNotThrow(() => buildSiteConfig('attendee', { ...ENV, RELEASE: '1', SURVEY_URL: 'https://forms.example/x', PROMO_DISABLED: '1' }, event));
});
test('invalid GA4 / javascript survey url are dropped', () => {
  const s = buildSiteConfig('attendee', { GA4_ID: 'bad', SURVEY_URL: 'javascript:alert(1)', PROMO_HREF: 'javascript:x' }, event);
  assert.equal(s.ga4Id, '');
  assert.equal(s.survey.url, '');
  assert.equal(s.promo.href, '');
  assert.equal(s.promo.placeholder, true);
});

test('attendee build: staff files absent, audience.js is attendee module, fixtures exclude faq-staff', async () => {
  const out = await tmp();
  const { files } = await build({ audience: 'attendee', outDir: out, env: ENV, fixtures: true });
  assert.equal(files.some((f) => /staff/i.test(f)), false);
  assert.equal(files.includes('fixtures/faq-staff.csv'), false);
  assert.equal(await readFile(path.join(out, 'js/audience.js'), 'utf8'), await readFile(path.join(ROOT, 'src/js/audience/attendee.js'), 'utf8'));
  const html = await readFile(path.join(out, 'index.html'), 'utf8');
  assert.equal(html.includes('staff-faq'), false);
  assert.equal(html.includes('@if'), false);
});
test('staff build writes _headers with noindex + no-referrer and includes staff mount', async () => {
  const out = await tmp();
  await build({ audience: 'staff', outDir: out, env: ENV });
  const h = await readFile(path.join(out, '_headers'), 'utf8');
  assert.match(h, /X-Robots-Tag: noindex/);
  assert.match(h, /Referrer-Policy: no-referrer/);
  assert.match(await readFile(path.join(out, 'index.html'), 'utf8'), /id="staff-faq"/);
  assert.equal(existsSync(path.join(out, 'fixtures')), false);
});

test('attendee build with STAFF_FAQ_CSV_URL set has zero violations', async () => {
  const out = await tmp();
  await build({ audience: 'attendee', outDir: out, env: ENV });
  const r = await checkDist({ dir: out, audience: 'attendee', env: ENV });
  assert.deepEqual(r.violations, []);
});
test('planted legacy GA4 id in a dist file -> violation', async () => {
  const out = await tmp();
  await build({ audience: 'attendee', outDir: out, env: ENV });
  await writeFile(path.join(out, 'js/extra.js'), `const id = '${LEGACY_DENYLIST[1]}';`);
  const r = await checkDist({ dir: out, audience: 'attendee', env: ENV });
  assert.equal(r.ok, false);
  assert.equal(r.violations[0].file, 'js/extra.js');
});
test('staff sheet key planted in attendee -> violation; staff.js filename -> violation', async () => {
  const out = await tmp();
  await build({ audience: 'attendee', outDir: out, env: ENV });
  await writeFile(path.join(out, 'js/staff.js'), 'x');
  await writeFile(path.join(out, 'js/leak.js'), 'fetch("STAFFSENTINEL")');
  const r = await checkDist({ dir: out, audience: 'attendee', env: ENV });
  const needles = r.violations.map((v) => v.needle);
  assert.ok(needles.includes('<filename contains "staff">'));
  assert.ok(needles.includes('STAFFSENTINEL'));
});
test('staff dist containing staffFaq -> ok', async () => {
  const out = await tmp();
  await build({ audience: 'staff', outDir: out, env: ENV });
  assert.match(await readFile(path.join(out, 'js/site-config.js'), 'utf8'), /staffFaq/);
  assert.equal((await checkDist({ dir: out, audience: 'staff', env: ENV })).ok, true);
});
test('DRAFT_SHEET_ID in output -> violation', async () => {
  const out = await tmp();
  await build({ audience: 'staff', outDir: out, env: ENV });
  await writeFile(path.join(out, 'x.txt'), 'DRAFTID123');
  assert.equal((await checkDist({ dir: out, audience: 'staff', env: { DRAFT_SHEET_ID: 'DRAFTID123' } })).ok, false);
});
test('repo source passes legacy/credential scan', async () => {
  const r = await checkSource({ root: ROOT });
  assert.deepEqual(r.violations, []);
});
test('source scan: src/ has no unconfirmed venue facts', async () => {
  const walk = async (d) => (await readdir(d, { withFileTypes: true })).flatMap((e) => (e.isDirectory() ? [] : [path.join(d, e.name)]));
  const dirs = ['src', 'src/js', 'src/js/lib', 'src/js/audience', 'config'].map((d) => path.join(ROOT, d));
  for (const d of dirs) for (const f of await walk(d)) {
    const t = await readFile(f, 'utf8');
    for (const w of UNCONFIRMED_VENUE_TERMS) assert.equal(t.includes(w), false, `${f} contains ${w}`);
  }
});
test('no chatbot / AI button in template', async () => {
  const t = await readFile(path.join(ROOT, 'src/index.html'), 'utf8');
  assert.equal(/chat|แชท/i.test(t) || /\bAI\b/.test(t), false);
});
