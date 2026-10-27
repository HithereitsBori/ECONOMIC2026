// Output escaping. Every value that comes from a Sheet must pass through escapeHTML
// before reaching innerHTML; every URL must pass safeHttpsUrl / safeAssetPath.

const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHTML(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => MAP[c]);
}

export function safeHttpsUrl(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v) return null;
  try {
    const u = new URL(v);
    if (u.protocol !== 'https:') return null;
    return u.href;
  } catch {
    return null;
  }
}

export function safeAssetPath(value) {
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (!v.startsWith('assets/')) return null;
  if (v.includes('..') || v.includes('\\') || v.includes(':')) return null;
  if (!/\.(webp|jpg|png|svg)$/i.test(v)) return null;
  return encodeURI(v);
}
