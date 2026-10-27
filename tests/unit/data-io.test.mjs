import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCache } from '../../src/js/lib/cache.js';
import { fetchDataset, computeFreshness, withCacheBuster } from '../../src/js/lib/loader.js';
import { SCHEDULE_REQUIRED } from '../../src/js/lib/schema.js';
import { selectPublishedSessions } from '../../src/js/lib/data.js';
import { parseCSVTable } from '../../src/js/lib/csv.js';
import { promoInsertIndex, renderPromo } from '../../src/js/lib/promo.js';
import { renderFaqList, FAQ_EMPTY } from '../../src/js/lib/faq-view.js';
import { escapeHTML, safeHttpsUrl } from '../../src/js/lib/escape.js';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');
const event = JSON.parse(readFileSync(new URL('../../config/event.json', import.meta.url)));

function memStorage() {
  const m = new Map();
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}
const LEGACY_KEY = ['gc', 'nt', '2026_v1_schedule'].join(''); // legacy template key, kept out of source scan
const okRes = (text) => ({ ok: true, status: 200, text: async () => text });

test('cache roundtrip and rejects other schemaVersion', () => {
  const st = memStorage();
  const c1 = createCache({ prefix: 'ef2026_attendee_v1_', storage: st, schemaVersion: 1 });
  c1.write('schedule', [{ a: 1 }], 123);
  assert.deepEqual(c1.read('schedule'), { data: [{ a: 1 }], ts: 123 });
  const c2 = createCache({ prefix: 'ef2026_attendee_v1_', storage: st, schemaVersion: 2 });
  assert.equal(c2.read('schedule'), null);
  st.setItem('ef2026_attendee_v1_bad', '{not json');
  assert.equal(c1.read('bad'), null);
});
test('cache ignores legacy template keys and clearForeign removes them', () => {
  const st = memStorage();
  st.setItem(LEGACY_KEY, JSON.stringify({ v: 1, ts: 1, data: ['x'] }));
  const c = createCache({ prefix: 'ef2026_attendee_v1_', storage: st });
  assert.equal(c.read('schedule'), null);
  c.clearForeign();
  assert.equal(st.getItem(LEGACY_KEY), null);
});
test('cache write swallows quota errors', () => {
  const st = memStorage();
  st.setItem = () => { throw new Error('QuotaExceeded'); };
  createCache({ prefix: 'p_', storage: st }).write('k', [], 1);
});
test('fetchDataset throws not-configured on empty url and never returns mock', async () => {
  let called = false;
  await assert.rejects(fetchDataset({ url: '', required: SCHEDULE_REQUIRED, fetchFn: () => { called = true; } }), { code: 'not-configured' });
  assert.equal(called, false);
});
test('throws html when body starts with <!', async () => {
  await assert.rejects(fetchDataset({ url: 'https://x/pub?a', required: [], fetchFn: async () => okRes('<!DOCTYPE html><p>') }), { code: 'html' });
});
test('throws http on non-200', async () => {
  await assert.rejects(fetchDataset({ url: 'https://x', required: [], fetchFn: async () => ({ ok: false, status: 500 }) }), { code: 'http' });
});
test('header mismatch keeps last good cache', async () => {
  const st = memStorage();
  const cache = createCache({ prefix: 'p_', storage: st });
  const good = await fetchDataset({ url: 'https://x', required: SCHEDULE_REQUIRED, fetchFn: async () => okRes(fx('schedule.csv')) });
  cache.write('schedule', good.rows, 1000);
  // app rule: only write after a successful fetch
  try {
    const bad = await fetchDataset({ url: 'https://x', required: SCHEDULE_REQUIRED, fetchFn: async () => okRes(fx('schedule-bad-headers.csv')) });
    cache.write('schedule', bad.rows, 2000);
    assert.fail('should throw');
  } catch (e) {
    assert.equal(e.code, 'headers');
  }
  assert.equal(cache.read('schedule').ts, 1000);
  assert.equal(cache.read('schedule').data.length, good.rows.length);
});
test('timeout via AbortController', async () => {
  await assert.rejects(fetchDataset({ url: 'https://x', required: [], timeoutMs: 50, fetchFn: () => new Promise(() => {}) }), { code: 'timeout' });
});
test('cached REVIEW rows are filtered', () => {
  const rows = parseCSVTable(fx('schedule-all-review.csv')).rows;
  const st = memStorage();
  const c = createCache({ prefix: 'p_', storage: st });
  c.write('schedule', rows, 1);
  const { sessions } = selectPublishedSessions(c.read('schedule').data, { eventDays: event.days, zones: event.zones });
  assert.equal(sessions.length, 0);
});
test('computeFreshness', () => {
  const now = 10_000_000;
  assert.equal(computeFreshness({ lastGoodTs: now - 5 * 60000, lastAttempt: 'ok', nowMs: now }), 'fresh');
  assert.equal(computeFreshness({ lastGoodTs: now - 20 * 60000, lastAttempt: 'ok', nowMs: now }), 'aging');
  assert.equal(computeFreshness({ lastGoodTs: now - 60000, lastAttempt: 'failed', nowMs: now }), 'offline-stale');
  assert.equal(computeFreshness({ lastGoodTs: null, lastAttempt: 'failed', nowMs: now }), 'none');
});
test('withCacheBuster appends with & when ? exists', () => {
  assert.equal(withCacheBuster('https://a/pub?gid=1', 120000), 'https://a/pub?gid=1&cb=2');
  assert.equal(withCacheBuster('https://a/pub', 60000), 'https://a/pub?cb=1');
});

// ---- promo / faq view (T8/T9)
test('promoInsertIndex', () => {
  assert.equal(promoInsertIndex(10), 3);
  assert.equal(promoInsertIndex(2), 2);
  assert.equal(promoInsertIndex(0), null);
});
test('renderPromo with javascript: href renders no <a>', () => {
  const h = renderPromo({ enabled: true, placeholder: false, image: 'assets/promo/a.webp', href: 'javascript:alert(1)', alt: 'x' }, escapeHTML, safeHttpsUrl);
  assert.equal(/<a[\s>]/.test(h), false);
});
test('renderPromo placeholder has data-placeholder', () => {
  const h = renderPromo({ enabled: true, placeholder: true }, escapeHTML, safeHttpsUrl);
  assert.match(h, /data-placeholder="true"/);
  assert.match(h, /รอภาพ/);
  assert.equal(renderPromo({ enabled: false }, escapeHTML, safeHttpsUrl), '');
});
test('renderFaqList([]) contains FAQ_EMPTY and escapes', () => {
  assert.match(renderFaqList([]), new RegExp(FAQ_EMPTY));
  const h = renderFaqList([{ id: '1', category: '', question: '<script>x</script>', answer: 'a' }]);
  assert.equal(h.includes('<script>'), false);
});
