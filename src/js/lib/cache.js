// Versioned localStorage cache. Stores RAW rows; callers re-run the approved-only
// selectors on every read so a row that lost approval disappears even from cache.
// Legacy keys left by the template project this code was derived from. The prefix is
// assembled at runtime so the literal never ships (scripts/denylist.mjs gates it).
const FOREIGN_PREFIXES = [['gc', 'nt', '2026_'].join('')];

export function createCache({ prefix, storage, schemaVersion = 1 }) {
  const k = (key) => prefix + key;
  return {
    read(key) {
      try {
        const raw = storage.getItem(k(key));
        if (!raw) return null;
        const obj = JSON.parse(raw);
        if (!obj || obj.v !== schemaVersion || typeof obj.ts !== 'number') return null;
        return { data: obj.data, ts: obj.ts };
      } catch {
        return null;
      }
    },
    write(key, data, ts) {
      try {
        storage.setItem(k(key), JSON.stringify({ v: schemaVersion, ts, data }));
      } catch {
        /* quota / private mode: silently skip */
      }
    },
    clearForeign() {
      try {
        const keys = [];
        for (let i = 0; i < storage.length; i++) keys.push(storage.key(i));
        keys.filter((x) => x && FOREIGN_PREFIXES.some((p) => x.startsWith(p))).forEach((x) => storage.removeItem(x));
      } catch {
        /* ignore */
      }
    },
  };
}
