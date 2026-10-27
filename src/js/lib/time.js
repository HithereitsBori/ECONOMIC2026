// Asia/Bangkok time helpers. Never use the device clock's local timezone directly:
// attendees' phones may be set to another zone.

export const TZ = 'Asia/Bangkok';

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

export function bangkokNow(now = new Date()) {
  const p = Object.fromEntries(partsFmt.formatToParts(now).map((x) => [x.type, x.value]));
  return { iso: `${p.year}-${p.month}-${p.day}`, hhmm: `${p.hour}:${p.minute}` };
}

export function normalizeHHMM(t) {
  if (typeof t !== 'string') return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}

export function sessionTiming(s, now) {
  if (s.status === 'ยกเลิก') return 'cancelled';
  if (s.date < now.iso) return 'past';
  if (s.date > now.iso) return 'upcoming';
  if (now.hhmm >= s.end) return 'past';
  if (now.hhmm >= s.start) return 'live';
  return 'upcoming';
}

const hmFmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

export function formatBangkokTime(ts) {
  return hmFmt.format(new Date(ts));
}

export function formatDayLabel(iso, locale = 'th') {
  // Noon UTC keeps the calendar day stable when rendered in Asia/Bangkok.
  const d = new Date(`${iso}T05:00:00Z`);
  const loc = locale === 'en' ? 'en-GB' : 'th-TH';
  const weekday = new Intl.DateTimeFormat(loc, { timeZone: TZ, weekday: 'short' }).format(d);
  const date = new Intl.DateTimeFormat(loc, { timeZone: TZ, day: 'numeric', month: 'short' }).format(d);
  return { weekday, date };
}

export function defaultDay(eventDays, now) {
  if (eventDays.includes(now.iso)) return now.iso;
  if (now.iso < eventDays[0]) return eventDays[0];
  return eventDays.at(-1);
}
