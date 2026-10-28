// Static "chrome" markup (hero text + day/stage filters). Shared by app.js (runtime) and
// scripts/build.mjs (pre-rendered into index.html so nothing above the agenda shifts when JS boots).
import { escapeHTML } from './escape.js';
import { formatDayLabel } from './time.js';

export const ALL_ZONES = 'all';

export function headerTexts(ev) {
  const d = ev.days.map((x) => formatDayLabel(x, 'th').date);
  return {
    tagline: ev.tagline || '',
    meta: `${d[0]} – ${d.at(-1)} 2026 · ${ev.venue.th}`,
    tz: `เวลาทั้งหมดเป็น${ev.timezoneLabel}`,
  };
}

export function dayTabsHTML(ev, day) {
  return ev.days.map((iso, i) => {
    const l = formatDayLabel(iso, 'th');
    return `<button type="button" class="day" data-day="${iso}" aria-pressed="${iso === day}"><small>วันที่ ${i + 1} · ${escapeHTML(l.weekday)}</small><strong>${escapeHTML(l.date)}</strong></button>`;
  }).join('');
}

export function zoneTabsHTML(ev, zone) {
  return [ALL_ZONES, ...ev.zones].map((z) =>
    `<button type="button" class="chip" data-zone="${escapeHTML(z)}" aria-pressed="${z === zone}">${z === ALL_ZONES ? 'ทุกเวที' : escapeHTML(z)}</button>`).join('');
}
