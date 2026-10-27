// Approved-only selection + normalisation. Rendering code must ONLY consume the
// output of these functions (also for cached rows), never raw sheet rows.
import { normalizeHHMM } from './time.js';
import { safeHttpsUrl } from './escape.js';

const KNOWN_STATUSES = ['ปกติ', 'เลื่อนเวลา', 'เปลี่ยนเวที', 'ยกเลิก', 'เพิ่มใหม่'];

const val = (row, key) => (row && row[key] != null ? String(row[key]) : '');

export function isApproved(row) {
  // Exact match after trimming surrounding whitespace only: 'approved' (lower case) is NOT approved.
  return val(row, 'publication_status').trim() === 'APPROVED';
}
export function isHeld(row) {
  return val(row, 'hold_flag').trim().toUpperCase() === 'HOLD';
}

export function parsePeople(text, role) {
  if (typeof text !== 'string') return [];
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((line) => {
    const i = line.indexOf(' — ');
    if (i === -1) return { name: line, title: '', role };
    return { name: line.slice(0, i).trim(), title: line.slice(i + 3).trim(), role };
  });
}

export function selectPublishedSessions(rows, { eventDays, zones }) {
  const sessions = [];
  const rejected = [];
  for (const row of rows || []) {
    const id = val(row, 'session_id').trim();
    const reject = (reason) => rejected.push({ id, reason });
    if (!isApproved(row)) { reject('not-approved'); continue; }
    if (isHeld(row)) { reject('on-hold'); continue; }
    const date = val(row, 'date').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (eventDays && !eventDays.includes(date))) { reject('bad-date'); continue; }
    const start = normalizeHHMM(val(row, 'start'));
    const end = normalizeHHMM(val(row, 'end'));
    if (!start || !end) { reject('bad-time'); continue; }
    if (end <= start) { reject('end-before-start'); continue; }
    const zone = val(row, 'stage').trim();
    if (zones && !zones.includes(zone)) { reject('unknown-zone'); continue; }
    const title = val(row, 'topic_main').trim();
    if (!title) { reject('missing-title'); continue; }
    const rawStatus = val(row, 'onsite_status').trim();
    const status = KNOWN_STATUSES.includes(rawStatus) ? rawStatus : 'ปกติ';
    sessions.push({
      id, date, start, end, title,
      subtitle: val(row, 'topic_sub').trim(),
      zone, status,
      note: val(row, 'onsite_note').trim(),
      streamUrl: safeHttpsUrl(val(row, 'stream_url')),
      people: [...parsePeople(val(row, 'speakers'), 'Speaker'), ...parsePeople(val(row, 'moderators'), 'Moderator')],
    });
  }
  const zIdx = (z) => (zones ? zones.indexOf(z) : 0);
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start) || zIdx(a.zone) - zIdx(b.zone));
  return { sessions, rejected };
}

export function selectPublishedFaq(rows, audience) {
  const out = [];
  for (const row of rows || []) {
    if (!isApproved(row) || isHeld(row)) continue;
    if (val(row, 'audience').trim().toLowerCase() !== audience) continue;
    const question = val(row, 'question').trim();
    const answer = val(row, 'answer').trim();
    if (!question || !answer) continue;
    const so = Number.parseFloat(val(row, 'sort_order'));
    out.push({
      id: val(row, 'faq_id').trim(),
      category: val(row, 'category').trim(),
      question, answer,
      sortOrder: Number.isFinite(so) ? so : Number.POSITIVE_INFINITY,
    });
  }
  out.sort((a, b) => (a.sortOrder - b.sortOrder) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  return out;
}
