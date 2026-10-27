// CSV parser (RFC4180: quoted fields, embedded commas and newlines, BOM, CRLF).
// parseCSVTable(text) -> { headers: string[], rows: Record<string,string>[] }

function parseRecords(text) {
  const records = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else inQuotes = false;
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') { continue; }
    if (c === '\n') { row.push(field); records.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); records.push(row); }
  return records;
}

export function parseCSVTable(text) {
  if (typeof text !== 'string' || text.trim() === '') return { headers: [], rows: [] };
  const clean = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const records = parseRecords(clean);
  if (!records.length) return { headers: [], rows: [] };
  const headers = records[0].map((h) => h.trim());
  const rows = [];
  for (const rec of records.slice(1)) {
    if (rec.every((v) => v.trim() === '')) continue;
    const obj = {};
    headers.forEach((h, i) => { if (h) obj[h] = rec[i] ?? ''; });
    rows.push(obj);
  }
  return { headers, rows };
}
