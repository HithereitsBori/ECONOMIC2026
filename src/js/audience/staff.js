// Staff-only features. This file is copied ONLY into the staff build (as js/audience.js).
// All staff content comes from the staff sheet (Sheet C) via SITE.urls.staffFaq — nothing hardcoded here.

export async function initAudience(ctx) {
  const { SITE } = ctx;
  ctx.mount.quickInfo.innerHTML = `<div class="placeholder"><b>ข้อมูลสถานที่ / จุดบริการ — รอข้อมูลยืนยัน</b>ยังไม่มีคำตอบที่อนุมัติ ห้ามตอบผู้ร่วมงานด้วยการคาดเดา ให้แจ้งหัวหน้าทีม</div>`;
  // Same public answers also on the staff tab so staff can answer attendees from one screen.
  ctx.loadFaq('publicFaq', SITE.urls.publicFaq, 'public', [ctx.mount.faq, document.getElementById('staff-public-faq')]);
  ctx.loadFaq('staffFaq', SITE.urls.staffFaq, 'staff', document.getElementById('staff-faq'),
    'ยังไม่มีข้อมูลทีมงานที่อนุมัติ — รอข้อมูลยืนยันจากหัวหน้างาน');
}
