// Inline 16:5 promo slot for the attendee agenda (never sticky / popup, never on staff).

export function promoInsertIndex(sessionCount) {
  if (!sessionCount) return null;
  return sessionCount >= 3 ? 3 : sessionCount;
}

export function renderPromo(promo, escapeHTML, safeHttpsUrl) {
  if (!promo || !promo.enabled) return '';
  if (promo.placeholder) {
    return `<aside class="promo-inline" data-placeholder="true" aria-label="พื้นที่ประชาสัมพันธ์ (ตัวอย่าง)">
      <span class="tag-sample">ตัวอย่าง</span>
      <div class="promo-ph"><b>พื้นที่ประชาสัมพันธ์ THE STANDARD — รอภาพ</b><small>ขนาด 16:5 (960×300 px) · รอ creative และลิงก์ปลายทางที่อนุมัติ</small></div>
    </aside>`;
  }
  const img = `<img src="${escapeHTML(promo.image)}" alt="${escapeHTML(promo.alt || '')}" width="960" height="300" loading="lazy" decoding="async">`;
  const href = safeHttpsUrl(promo.href);
  const inner = href ? `<a href="${escapeHTML(href)}" target="_blank" rel="noopener" data-promo-link>${img}</a>` : img;
  return `<aside class="promo-inline" aria-label="ประชาสัมพันธ์">${inner}</aside>`;
}
