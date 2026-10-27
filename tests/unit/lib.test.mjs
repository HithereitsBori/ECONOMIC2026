import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { parseCSVTable } from '../../src/js/lib/csv.js';
import { escapeHTML, safeHttpsUrl, safeAssetPath } from '../../src/js/lib/escape.js';
import { bangkokNow, normalizeHHMM, sessionTiming, defaultDay, formatBangkokTime } from '../../src/js/lib/time.js';
import { checkHeaders, SCHEDULE_REQUIRED } from '../../src/js/lib/schema.js';
import { selectPublishedSessions, selectPublishedFaq, parsePeople } from '../../src/js/lib/data.js';

const event = JSON.parse(readFileSync(new URL('../../config/event.json', import.meta.url)));
const opts = { eventDays: event.days, zones: event.zones };
const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

// ---- csv / escape (T1)
test('parses quoted comma and newline', () => {
  const t = parseCSVTable('a,b\n"x,1","line1\nline2"');
  assert.deepEqual(t.rows[0], { a: 'x,1', b: 'line1\nline2' });
});
test('strips BOM and CRLF', () => {
  const t = parseCSVTable('\uFEFFa,b\r\n1,2\r\n');
  assert.deepEqual(t.headers, ['a', 'b']);
  assert.deepEqual(t.rows, [{ a: '1', b: '2' }]);
});
test('returns headers when zero data rows', () => {
  assert.deepEqual(parseCSVTable('a,b\n'), { headers: ['a', 'b'], rows: [] });
  assert.deepEqual(parseCSVTable(''), { headers: [], rows: [] });
});
test('skips blank rows', () => {
  assert.equal(parseCSVTable('a,b\n1,2\n,\n\n3,4\n').rows.length, 2);
});
test('escapes <img onerror>', () => {
  assert.equal(escapeHTML('<img src=x onerror="a(\'1\')">'), '&lt;img src=x onerror=&quot;a(&#39;1&#39;)&quot;&gt;');
  assert.equal(escapeHTML(null), '');
});
test('safeHttpsUrl rejects javascript: and http:', () => {
  assert.equal(safeHttpsUrl('javascript:alert(1)'), null);
  assert.equal(safeHttpsUrl('http://example.com'), null);
  assert.equal(safeHttpsUrl('https://example.com/a'), 'https://example.com/a');
});
test('safeAssetPath rejects ../ and https://', () => {
  assert.equal(safeAssetPath('assets/../x.png'), null);
  assert.equal(safeAssetPath('https://x.com/a.png'), null);
  assert.equal(safeAssetPath('assets/promo/a b.webp'), 'assets/promo/a%20b.webp');
});

// ---- time (T2)
test('bangkokNow 03:30Z -> 10:30 same day', () => {
  assert.deepEqual(bangkokNow(new Date('2026-11-04T03:30:00Z')), { iso: '2026-11-04', hhmm: '10:30' });
});
test('bangkokNow crosses midnight', () => {
  assert.deepEqual(bangkokNow(new Date('2026-11-03T17:05:00Z')), { iso: '2026-11-04', hhmm: '00:05' });
});
test('bangkokNow is independent of process TZ', () => {
  const mod = new URL('../../src/js/lib/time.js', import.meta.url).href;
  const out = execFileSync(process.execPath, ['--input-type=module', '-e',
    `import {bangkokNow,formatBangkokTime} from '${mod}'; console.log(JSON.stringify([bangkokNow(new Date('2026-11-04T03:30:00Z')), formatBangkokTime(Date.parse('2026-11-04T03:30:00Z'))]))`],
  { env: { ...process.env, TZ: 'America/New_York' } }).toString();
  assert.deepEqual(JSON.parse(out), [{ iso: '2026-11-04', hhmm: '10:30' }, '10:30']);
  assert.equal(formatBangkokTime(Date.parse('2026-11-04T03:30:00Z')), '10:30');
});
test('normalizeHHMM', () => {
  assert.equal(normalizeHHMM('9:00'), '09:00');
  assert.equal(normalizeHHMM('9:00:00'), '09:00');
  for (const bad of ['25:00', '', 'abc', '9:7']) assert.equal(normalizeHHMM(bad), null);
});
test('sessionTiming live/past/upcoming/cancelled', () => {
  const s = { date: '2026-11-04', start: '10:00', end: '11:00', status: 'ปกติ' };
  assert.equal(sessionTiming(s, { iso: '2026-11-04', hhmm: '10:00' }), 'live');
  assert.equal(sessionTiming(s, { iso: '2026-11-04', hhmm: '11:00' }), 'past');
  assert.equal(sessionTiming(s, { iso: '2026-11-04', hhmm: '09:59' }), 'upcoming');
  assert.equal(sessionTiming(s, { iso: '2026-11-05', hhmm: '08:00' }), 'past');
  assert.equal(sessionTiming({ ...s, status: 'ยกเลิก' }, { iso: '2026-11-04', hhmm: '10:30' }), 'cancelled');
});
test('defaultDay before/during/after event', () => {
  assert.equal(defaultDay(event.days, { iso: '2026-10-28' }), '2026-11-04');
  assert.equal(defaultDay(event.days, { iso: '2026-11-05' }), '2026-11-05');
  assert.equal(defaultDay(event.days, { iso: '2026-11-09' }), '2026-11-06');
});

// ---- schema / data (T3)
const sched = parseCSVTable(fx('schedule.csv'));
const { sessions, rejected } = selectPublishedSessions(sched.rows, opts);
const byId = Object.fromEntries(sessions.map((s) => [s.id, s]));
const reason = (id) => rejected.find((r) => r.id === id)?.reason;

test('only APPROVED and non-HOLD rows survive', () => {
  assert.equal(sessions.some((s) => s.title.includes('SHOULD_NOT_RENDER')), false);
  assert.equal(reason('EX-D1-06'), 'not-approved');
  assert.equal(reason('EX-D1-07'), 'on-hold');
});
test('lowercase approved is rejected as not-approved', () => assert.equal(reason('EX-D1-08'), 'not-approved'));
test('rejects non-ISO dates', () => assert.equal(reason('EX-D1-09'), 'bad-date'));
test('accepts 9:00:00 as 09:00', () => assert.equal(byId['EX-D1-02'].start, '09:00'));
test('rejects end<=start', () => assert.equal(reason('EX-D1-10'), 'end-before-start'));
test('rejects unknown zone', () => assert.equal(reason('EX-D1-11'), 'unknown-zone'));
test('cancelled row is kept with status ยกเลิก', () => assert.equal(byId['EX-D1-04'].status, 'ยกเลิก'));
test('empty onsite_status -> ปกติ', () => assert.equal(byId['EX-D1-02'].status, 'ปกติ'));
test('javascript: stream url becomes null', () => {
  assert.equal(byId['EX-D1-05'].streamUrl, null);
  assert.equal(byId['EX-D1-03'].streamUrl, 'https://example.com/live');
});
test('splits multiline speakers', () => {
  const sp = byId['EX-D1-01'].people.filter((p) => p.role === 'Speaker');
  assert.equal(sp.length, 3);
  assert.equal(sp[1].name, '[ตัวอย่าง] ผู้พูด ข');
  assert.equal(sp[1].title, '[ตัวอย่าง] ผู้อำนวยการ');
  assert.equal(sp[2].title, '');
  assert.equal(byId['EX-D1-01'].people.filter((p) => p.role === 'Moderator').length, 1);
  assert.deepEqual(parsePeople('\n\nA — B\n', 'Speaker'), [{ name: 'A', title: 'B', role: 'Speaker' }]);
});
test('title is not escaped here (escape happens at render)', () => assert.match(byId['EX-D1-05'].title, /<img/));
test('sessions sorted by date, start, zone', () => {
  const keys = sessions.map((s) => s.date + s.start + event.zones.indexOf(s.zone));
  assert.deepEqual(keys, [...keys].sort());
});
test('checkHeaders reports missing hold_flag', () => {
  assert.deepEqual(checkHeaders(SCHEDULE_REQUIRED.filter((h) => h !== 'hold_flag'), SCHEDULE_REQUIRED), { ok: false, missing: ['hold_flag'] });
});
test('FAQ filters and sorts', () => {
  const faq = selectPublishedFaq(parseCSVTable(fx('faq-public.csv')).rows, 'public');
  assert.deepEqual(faq.map((f) => f.id), ['PUB-02', 'PUB-10']); // 2 before 10; no-answer, REVIEW, audience mismatch dropped
  const staff = selectPublishedFaq(parseCSVTable(fx('faq-staff.csv')).rows, 'staff');
  assert.deepEqual(staff.map((f) => f.id), ['STF-01']);
  assert.equal(selectPublishedFaq(parseCSVTable(fx('faq-staff.csv')).rows, 'public').length, 0);
});
test('all-review fixture -> sessions []', () => {
  const r = selectPublishedSessions(parseCSVTable(fx('schedule-all-review.csv')).rows, opts);
  assert.equal(r.sessions.length, 0);
});
