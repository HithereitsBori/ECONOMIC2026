// EF2026 onsite guide — shared DOM app for both audiences.
// Audience-specific features live in ./audience.js (attendee.js OR staff.js copied at build time).
import { SITE } from './site-config.js';
import { escapeHTML, safeHttpsUrl } from './lib/escape.js';
import { bangkokNow, sessionTiming, formatBangkokTime, formatDayLabel, defaultDay } from './lib/time.js';
import { SCHEDULE_REQUIRED, FAQ_REQUIRED } from './lib/schema.js';
import { selectPublishedSessions, selectPublishedFaq } from './lib/data.js';
import { createCache } from './lib/cache.js';
import { fetchDataset, computeFreshness } from './lib/loader.js';
import { renderFaqList, FAQ_EMPTY } from './lib/faq-view.js';
import { initAudience } from './audience.js';

const $ = (id) => document.getElementById(id);
const ev = SITE.event;
const ALL = 'all';

const cache = createCache({ prefix: SITE.cachePrefix, storage: safeStorage(), schemaVersion: 1 });
const state = {
  day: null, zone: ALL, tab: 'agenda',
  sessions: [], scheduleLoaded: false,
  datasets: {}, // key -> { url, required, onData, lastGoodTs, lastAttempt, error }
  failures: 0,
};
const scheduleHooks = [];

function safeStorage() {
  try { const k = '__ef_probe'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return localStorage; } catch { /* private mode */ }
  const m = new Map();
  return { get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

// ---------- data loading (cache -> render -> fetch; never a mock fallback)
async function runDataset(key) {
  const d = state.datasets[key];
  const cached = cache.read(key);
  if (cached && d.lastGoodTs == null) { d.lastGoodTs = cached.ts; d.onData({ rows: cached.data, ts: cached.ts, from: 'cache' }); }
  try {
    const table = await fetchDataset({ url: d.url, required: d.required });
    const ts = Date.now();
    cache.write(key, table.rows, ts);
    d.lastGoodTs = ts; d.lastAttempt = 'ok'; d.error = null;
    d.onData({ rows: table.rows, ts, from: 'network' });
  } catch (error) {
    d.lastAttempt = 'failed'; d.error = error;
    const c = cache.read(key);
    d.onData({ rows: c ? c.data : null, ts: c ? c.ts : null, from: 'cache', error });
  }
  updateStatus();
}

function loadAndWatch(key, url, required, onData) {
  state.datasets[key] = { url, required, onData, lastGoodTs: null, lastAttempt: null, error: null };
  return runDataset(key);
}

async function refreshAll() {
  const btn = $('refresh-btn');
  btn.disabled = true;
  $('statusbar').dataset.state = 'loading';
  await Promise.all(Object.keys(state.datasets).map(runDataset));
  btn.disabled = false;
  const failed = Object.values(state.datasets).some((d) => d.lastAttempt === 'failed' && d.error?.code !== 'not-configured');
  state.failures = failed ? state.failures + 1 : 0;
}

function scheduleNextRefresh() {
  const backoff = Math.min(2 ** state.failures, 6);
  const delay = Math.min(SITE.refreshMs * backoff, 30 * 60000) + Math.floor(Math.random() * 60000);
  setTimeout(async () => {
    if (document.visibilityState === 'visible') await refreshAll();
    scheduleNextRefresh();
  }, delay);
}

// ---------- status bar + fallback banner (driven by the schedule feed)
function updateStatus() {
  const d = state.datasets.schedule;
  if (!d) return;
  const bar = $('statusbar');
  const text = $('status-text');
  const small = $('last-updated');
  const banner = $('fallback-banner');
  const tz = ev.timezoneLabel;
  if (d.error?.code === 'not-configured') {
    bar.dataset.state = 'none'; text.textContent = 'ยังไม่ได้เชื่อมข้อมูล'; small.textContent = tz; banner.hidden = true; return;
  }
  const f = computeFreshness({ lastGoodTs: d.lastGoodTs, lastAttempt: d.lastAttempt, nowMs: Date.now() });
  const at = d.lastGoodTs ? `${formatBangkokTime(d.lastGoodTs)} น.` : '';
  bar.dataset.state = f;
  if (f === 'fresh') { text.textContent = 'ข้อมูลล่าสุด'; small.textContent = `อัปเดต ${at} · ${tz}`; }
  else if (f === 'aging') { text.textContent = 'ข้อมูลอาจไม่ล่าสุด'; small.textContent = `อัปเดต ${at} · กดรีเฟรช`; }
  else if (f === 'offline-stale') { text.textContent = 'เชื่อมต่อไม่ได้'; small.textContent = `ใช้ข้อมูลเมื่อ ${at} · ${tz}`; }
  else { text.textContent = 'โหลดไม่สำเร็จ'; small.textContent = tz; }
  if (f === 'offline-stale') {
    banner.hidden = false;
    banner.innerHTML = `<b>⚠️ เชื่อมต่อข้อมูลล่าสุดไม่ได้ — แสดงข้อมูลเมื่อ ${escapeHTML(at)}</b>กดรีเฟรชเพื่อลองใหม่ เวลา/สถานะอาจไม่เป็นปัจจุบัน`;
  } else banner.hidden = true;
}

// ---------- header / filters
function renderHeader() {
  $('event-tagline').textContent = ev.tagline || '';
  const d = ev.days.map((x) => formatDayLabel(x, 'th').date);
  $('event-meta').textContent = `${d[0]} – ${d.at(-1)} 2026 · ${ev.venue.th}`;
  $('tz-label').textContent = `เวลาทั้งหมดเป็น${ev.timezoneLabel}`;
  if (SITE.fixtures) $('fixtures-banner').hidden = false;
}

function renderFilters() {
  $('day-tabs').innerHTML = ev.days.map((iso, i) => {
    const l = formatDayLabel(iso, 'th');
    return `<button type="button" class="day" data-day="${iso}" aria-pressed="${iso === state.day}"><small>วันที่ ${i + 1} · ${escapeHTML(l.weekday)}</small><strong>${escapeHTML(l.date)}</strong></button>`;
  }).join('');
  $('zone-tabs-schedule').innerHTML = [ALL, ...ev.zones].map((z) =>
    `<button type="button" class="chip" data-zone="${escapeHTML(z)}" aria-pressed="${z === state.zone}">${z === ALL ? 'ทุกเวที' : escapeHTML(z)}</button>`).join('');
}

// ---------- agenda
const STATUS_BADGE = {
  'เลื่อนเวลา': 'b-move', 'เปลี่ยนเวที': 'b-move', 'ยกเลิก': 'b-cancel', 'เพิ่มใหม่': 'b-new',
};

function visibleSessions() {
  return state.sessions.filter((s) => s.date === state.day && (state.zone === ALL || s.zone === state.zone));
}

function sessionCard(s, now) {
  const timing = sessionTiming(s, now);
  const badges = [`<span class="badge b-stage">${escapeHTML(s.zone)}</span>`];
  if (timing === 'live') badges.push('<span class="badge b-live">กำลังจัด</span>');
  if (STATUS_BADGE[s.status]) badges.push(`<span class="badge ${STATUS_BADGE[s.status]}">${escapeHTML(s.status)}</span>`);
  const speakers = s.people.filter((p) => p.role === 'Speaker').map((p) => escapeHTML(p.name)).join(', ');
  return `<button type="button" class="card-s status-${timing}${s.status === 'ยกเลิก' ? ' status-cancelled' : ''}" data-session="${escapeHTML(s.id)}">
    <span class="t">${escapeHTML(s.start)}<small>– ${escapeHTML(s.end)}</small></span>
    <span class="body">
      <span class="ttl">${escapeHTML(s.title)}</span>
      ${s.subtitle ? `<span class="sub">${escapeHTML(s.subtitle)}</span>` : ''}
      ${speakers ? `<span class="people-line">${speakers}</span>` : ''}
      <span class="row">${badges.join('')}</span>
      ${s.note ? `<span class="note">${escapeHTML(s.note)}</span>` : ''}
    </span>
  </button>`;
}

function renderSchedule() {
  const list = $('schedule-list');
  const items = visibleSessions();
  const now = bangkokNow();
  list.innerHTML = items.map((s) => sessionCard(s, now)).join('');
  $('day-empty').hidden = items.length > 0;
  scheduleHooks.forEach((cb) => { try { cb(list, items); } catch (e) { console.error(e); } });
}

function showAgendaState(which) {
  for (const id of ['loading-state', 'not-configured-state', 'agenda-pending-state', 'error-state', 'main-content']) $(id).hidden = id !== which;
}

function onSchedule({ rows, error }) {
  if (!rows) {
    if (error?.code === 'not-configured') showAgendaState('not-configured-state');
    else showAgendaState('error-state');
    state.sessions = []; renderSpeakers(); notifyEmpty();
    return;
  }
  // Approved-only filter runs on every read, cached rows included.
  state.sessions = selectPublishedSessions(rows, { eventDays: ev.days, zones: ev.zones }).sessions;
  if (!state.sessions.length) { showAgendaState('agenda-pending-state'); renderSpeakers(); notifyEmpty(); return; }
  showAgendaState('main-content');
  renderSchedule();
  renderSpeakers();
}
function notifyEmpty() { $('schedule-list').innerHTML = ''; scheduleHooks.forEach((cb) => { try { cb($('schedule-list'), []); } catch (e) { console.error(e); } }); }

// ---------- speakers (derived from APPROVED sessions only; attendee template has the mount)
function renderSpeakers() {
  const el = $('speakers-list');
  if (!el) return;
  const map = new Map();
  for (const s of state.sessions) for (const p of s.people) {
    const k = p.name;
    if (!map.has(k)) map.set(k, { ...p, sessions: [] });
    map.get(k).sessions.push(s);
  }
  if (!map.size) { el.innerHTML = '<div class="placeholder"><b>รอข้อมูลยืนยัน</b>รายชื่อผู้พูดจะแสดงเมื่อ Agenda ได้รับการยืนยัน</div>'; return; }
  el.innerHTML = [...map.values()].map((p) => `
    <div class="sp">
      <span class="avatar" aria-hidden="true">${escapeHTML([...p.name.replace(/^\[ตัวอย่าง\]\s*/, '')][0] || '?')}</span>
      <span class="sp-body"><b>${escapeHTML(p.name)}</b>${p.title ? `<small>${escapeHTML(p.title)}</small>` : ''}
      <span class="sp-sessions">${p.sessions.map((s) => `${escapeHTML(formatDayLabel(s.date).date)} ${escapeHTML(s.start)} · ${escapeHTML(s.zone)}`).join('<br>')}</span></span>
    </div>`).join('');
}

// ---------- session bottom sheet
let lastFocus = null;
function openSheet(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  const people = s.people.map((p) => `<div class="person"><span class="avatar" aria-hidden="true">${escapeHTML([...p.name.replace(/^\[ตัวอย่าง\]\s*/, '')][0] || '?')}</span><div><b>${escapeHTML(p.name)}</b>${p.title ? `<small>${escapeHTML(p.title)}</small>` : ''}<span class="role">${p.role === 'Moderator' ? 'ผู้ดำเนินรายการ' : 'ผู้พูด'}</span></div></div>`).join('');
  const stream = s.streamUrl ? `<a class="btn" href="${escapeHTML(s.streamUrl)}" target="_blank" rel="noopener">รับชมออนไลน์</a>` : '';
  $('session-sheet-content').innerHTML = `
    <p class="sheet-meta">${escapeHTML(formatDayLabel(s.date).date)} · ${escapeHTML(s.start)}–${escapeHTML(s.end)} น. · ${escapeHTML(s.zone)}</p>
    <h2 id="sheet-title">${escapeHTML(s.title)}</h2>
    ${s.subtitle ? `<p class="sub">${escapeHTML(s.subtitle)}</p>` : ''}
    ${s.status !== 'ปกติ' ? `<p><span class="badge ${STATUS_BADGE[s.status] || ''}">${escapeHTML(s.status)}</span></p>` : ''}
    ${s.note ? `<p class="note">${escapeHTML(s.note)}</p>` : ''}
    ${people}${stream}`;
  lastFocus = document.activeElement;
  $('session-sheet').hidden = false; $('session-backdrop').hidden = false;
  $('sheet-close').focus();
}
function closeSheet() {
  $('session-sheet').hidden = true; $('session-backdrop').hidden = true;
  if (lastFocus) lastFocus.focus();
}

// ---------- tabs
function setTab(tab, push = true) {
  const tabs = [...document.querySelectorAll('section.tab')].map((s) => s.dataset.tab);
  if (!tabs.includes(tab)) tab = 'agenda';
  state.tab = tab;
  document.querySelectorAll('section.tab').forEach((s) => { s.hidden = s.dataset.tab !== tab; });
  document.querySelectorAll('#bottom-nav button').forEach((b) => { if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (push) {
    const u = new URL(location.href);
    if (tab === 'agenda') u.searchParams.delete('tab'); else u.searchParams.set('tab', tab);
    history.replaceState(null, '', u);
  }
  window.scrollTo(0, 0);
}

// ---------- GA4 (only when a valid id is configured; default off)
function initAnalytics() {
  if (!/^G-[A-Z0-9]{6,}$/.test(SITE.ga4Id || '')) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); };
  window.gtag('js', new Date());
  window.gtag('config', SITE.ga4Id, { audience: SITE.audience });
  const s = document.createElement('script');
  s.async = true; s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(SITE.ga4Id)}`;
  document.head.appendChild(s);
}
const track = (name, params = {}) => { if (typeof window.gtag === 'function') window.gtag('event', name, params); };

// ---------- shared FAQ helper for audience modules
function loadFaq(key, url, audience, mounts, emptyText = FAQ_EMPTY) {
  const els = (Array.isArray(mounts) ? mounts : [mounts]).filter(Boolean);
  if (!els.length) return Promise.resolve();
  els.forEach((m) => { m.innerHTML = '<div class="skel-card"><div class="skel"></div></div>'; });
  // FAQ failures are isolated: they never affect the agenda feed.
  return loadAndWatch(key, url, FAQ_REQUIRED, ({ rows }) => {
    const html = renderFaqList(rows ? selectPublishedFaq(rows, audience) : [], { emptyText });
    els.forEach((m) => { m.innerHTML = html; });
  });
}

// ---------- boot
function bindEvents() {
  $('day-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-day]'); if (!b) return; state.day = b.dataset.day; renderFilters(); renderSchedule(); });
  $('zone-tabs-schedule').addEventListener('click', (e) => { const b = e.target.closest('[data-zone]'); if (!b) return; state.zone = b.dataset.zone; renderFilters(); renderSchedule(); });
  $('schedule-list').addEventListener('click', (e) => { const b = e.target.closest('[data-session]'); if (b) openSheet(b.dataset.session); });
  $('sheet-close').addEventListener('click', closeSheet);
  $('session-backdrop').addEventListener('click', closeSheet);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('session-sheet').hidden) closeSheet(); });
  $('bottom-nav').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  $('refresh-btn').addEventListener('click', refreshAll);
  $('retry-btn').addEventListener('click', refreshAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && state.scheduleLoaded) updateStatus(); });
}

async function boot() {
  cache.clearForeign();
  state.day = defaultDay(ev.days, bangkokNow());
  renderHeader();
  renderFilters();
  bindEvents();
  initAnalytics();
  setTab(new URLSearchParams(location.search).get('tab') || 'agenda', false);

  const ctx = {
    SITE, cache, escapeHTML, safeHttpsUrl, bangkokNow, formatBangkokTime, track,
    loadAndWatch, loadFaq,
    mount: { faq: $('faq-public'), quickInfo: $('quick-info') },
    onScheduleRendered(cb) { scheduleHooks.push(cb); },
  };
  try { await initAudience(ctx); } catch (e) { console.error('audience init failed', e); }

  await loadAndWatch('schedule', SITE.urls.schedule, SCHEDULE_REQUIRED, onSchedule);
  state.scheduleLoaded = true;
  // live/past highlight follows Bangkok time
  setInterval(() => { if (state.sessions.length && !$('main-content').hidden) renderSchedule(); updateStatus(); }, 60000);
  scheduleNextRefresh();
  document.documentElement.dataset.ready = '1';
}

boot();
