import { escapeHTML } from './escape.js';

export const FAQ_EMPTY = 'รอข้อมูลยืนยันจากผู้จัดงาน — ระหว่างนี้สอบถามเจ้าหน้าที่ในงาน';

export function renderFaqList(items, { emptyText = FAQ_EMPTY } = {}) {
  if (!items || !items.length) {
    return `<div class="placeholder" data-empty="true"><b>รอข้อมูลยืนยัน</b>${escapeHTML(emptyText)}</div>`;
  }
  return items.map((f) => `
    <details class="faq-item">
      <summary>${f.category ? `<span class="faq-cat">${escapeHTML(f.category)}</span>` : ''}<span class="faq-q">${escapeHTML(f.question)}</span></summary>
      <div class="faq-a">${escapeHTML(f.answer).replace(/\n/g, '<br>')}</div>
    </details>`).join('');
}
