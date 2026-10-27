// Column contracts for the published (Publish_*) tabs of Sheet B / C.
export const SCHEDULE_REQUIRED = [
  'session_id', 'stage', 'date', 'start', 'end', 'topic_main', 'publication_status', 'hold_flag',
];
export const FAQ_REQUIRED = [
  'faq_id', 'audience', 'category', 'question', 'answer', 'publication_status', 'hold_flag',
];

export function checkHeaders(headers, required) {
  const set = new Set((headers || []).map((h) => String(h).trim()));
  const missing = required.filter((r) => !set.has(r));
  return { ok: missing.length === 0, missing };
}
