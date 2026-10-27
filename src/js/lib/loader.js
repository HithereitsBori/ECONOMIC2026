// Guarded CSV fetch. There is deliberately NO mock fallback: an empty URL throws
// 'not-configured' and the UI shows a "not connected" state instead.
import { parseCSVTable } from './csv.js';
import { checkHeaders } from './schema.js';

function fail(code, message) {
  const e = new Error(message || code);
  e.code = code;
  return e;
}

export function withCacheBuster(url, nowMs) {
  const cb = Math.floor(nowMs / 60000);
  return url + (url.includes('?') ? '&' : '?') + 'cb=' + cb;
}

export async function fetchDataset({ url, required, fetchFn = globalThis.fetch, timeoutMs = 10000, nowMs = Date.now(), cacheBust = true }) {
  if (!url) throw fail('not-configured', 'data url not configured');
  const ctrl = new AbortController();
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => { ctrl.abort(); rej(fail('timeout')); }, timeoutMs);
  });
  try {
    const target = cacheBust && /^https:/.test(url) ? withCacheBuster(url, nowMs) : url;
    const res = await Promise.race([fetchFn(target, { signal: ctrl.signal, cache: 'no-store' }), timeout]);
    if (!res || !res.ok) throw fail('http', `HTTP ${res && res.status}`);
    const text = await Promise.race([res.text(), timeout]);
    if (/^\s*<(!|html)/i.test(text)) throw fail('html', 'got HTML instead of CSV');
    const table = parseCSVTable(text);
    const chk = checkHeaders(table.headers, required);
    if (!chk.ok) throw fail('headers', 'missing columns: ' + chk.missing.join(', '));
    return table;
  } catch (e) {
    if (e && e.code) throw e;
    if (e && e.name === 'AbortError') throw fail('timeout');
    throw fail('http', String(e && e.message));
  } finally {
    clearTimeout(timer);
  }
}

export function computeFreshness({ lastGoodTs, lastAttempt, nowMs, ttlMs = 900000 }) {
  if (lastGoodTs == null) return 'none';
  if (lastAttempt === 'failed') return 'offline-stale';
  return nowMs - lastGoodTs <= ttlMs ? 'fresh' : 'aging';
}
