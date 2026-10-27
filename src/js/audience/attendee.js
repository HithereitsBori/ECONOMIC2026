// Attendee-only features: public FAQ, survey tab + CTA, inline 16:5 promo.
import { promoInsertIndex, renderPromo } from './lib/promo.js';

const QUICK_INFO = (venueEscaped) => `
  <dl>
    <dt>วันงาน</dt><dd>4–6 พฤศจิกายน 2026</dd>
    <dt>สถานที่</dt><dd>${venueEscaped}</dd>
  </dl>
  <div class="placeholder"><b>แผนผังและข้อมูลจุดบริการ — รอข้อมูลยืนยัน</b>ระหว่างนี้สอบถามเจ้าหน้าที่ในงาน</div>`;

function surveyBlock(ctx, compact) {
  const { SITE, escapeHTML, safeHttpsUrl } = ctx;
  const url = safeHttpsUrl(SITE.survey.url);
  const btn = url
    ? `<a class="btn" href="${escapeHTML(url)}" target="_blank" rel="noopener" data-survey-link>ตอบแบบสอบถาม</a>`
    : '<button type="button" class="btn" disabled aria-disabled="true">แบบสอบถาม — รอลิงก์จากทีมงาน</button>';
  return compact
    ? `<div><b>ช่วยบอกเราหน่อย</b><span>ความเห็นของคุณช่วยพัฒนางานครั้งต่อไป</span></div>${btn}`
    : `<h2>แบบสอบถามหลังงาน</h2><p>ความเห็นของคุณช่วยพัฒนางานครั้งต่อไป</p>${url ? '' : '<p class="placeholder-inline">รอลิงก์แบบฟอร์มที่อนุมัติ</p>'}${btn}`;
}

export async function initAudience(ctx) {
  const { SITE, escapeHTML, safeHttpsUrl } = ctx;
  ctx.mount.quickInfo.innerHTML = QUICK_INFO(escapeHTML(SITE.event.venue.th));

  // Survey: tab + CTA at the end of the agenda (no popup).
  const section = document.getElementById('survey-section');
  const cta = document.getElementById('survey-cta');
  if (SITE.survey.enabled) {
    section.innerHTML = surveyBlock(ctx, false);
    cta.innerHTML = surveyBlock(ctx, true);
  } else {
    section.innerHTML = '<h2>แบบสอบถาม</h2><p>ยังไม่เปิดให้ตอบ</p>';
    document.querySelector('#bottom-nav [data-tab="survey"]')?.setAttribute('hidden', '');
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-survey-link]')) ctx.track('survey_click'); if (e.target.closest('[data-promo-link]')) ctx.track('promo_click'); });

  // Promo: inline after the 3rd visible session, recomputed on every agenda render.
  ctx.onScheduleRendered((list, items) => {
    list.querySelectorAll('.promo-inline').forEach((n) => n.remove());
    if (cta && SITE.survey.enabled) cta.hidden = items.length === 0;
    const idx = promoInsertIndex(items.length);
    const html = renderPromo(SITE.promo, escapeHTML, safeHttpsUrl);
    if (idx === null || !html) return;
    const ref = list.children[idx] || null;
    const tpl = document.createElement('template');
    tpl.innerHTML = html.trim();
    list.insertBefore(tpl.content.firstElementChild, ref);
  });

  ctx.loadFaq('publicFaq', SITE.urls.publicFaq, 'public', ctx.mount.faq);
}
