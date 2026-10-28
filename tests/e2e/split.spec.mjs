import { test, expect } from '@playwright/test';
import { mockSheets, ready, shot } from './helpers.mjs';

test.describe('audience split', () => {
  test('attendee never requests or contains staff data', async ({ page, request }) => {
    const reqs = await mockSheets(page);
    const all = [];
    page.on('request', (r) => all.push(r.url()));
    await page.goto('/attendee/');
    await ready(page);
    for (const tab of ['speakers', 'faq', 'survey']) await page.locator(`#bottom-nav [data-tab="${tab}"]`).click();
    await expect(page.locator('#faq-public .faq-item')).toHaveCount(2);
    expect(reqs.some((u) => u.includes('TESTSTAFF'))).toBe(false);
    expect(all.some((u) => /staff/i.test(u))).toBe(false);
    await expect(page.locator('#staff-faq, #staff-only-bar, [data-tab="staff"]')).toHaveCount(0);
    const html = await page.content();
    expect(html).not.toMatch(/STAFF_FIXTURE|STAFF ONLY|staffFaq/);
    for (const p of ['/attendee/js/staff.js', '/attendee/js/audience/staff.js', '/attendee/fixtures/faq-staff.csv']) {
      expect((await request.get(p)).status(), p).toBe(404);
    }
    const cfg = await (await request.get('/attendee/js/site-config.js')).text();
    expect(cfg).not.toMatch(/TESTSTAFF|staffFaq/);
    const fx = await request.get('/fixtures/fixtures/faq-staff.csv');
    expect(fx.status()).toBe(404);
  });

  test('staff site: bar, staff FAQ, no promo/survey', async ({ page }, testInfo) => {
    await mockSheets(page);
    await page.goto('/staff/');
    await ready(page);
    await expect(page.locator('#staff-only-bar')).toBeVisible();
    await expect(page.locator('#staff-only-bar')).toContainText('ไม่มีรหัสผ่าน');
    await expect(page.locator('.promo-inline, #survey-section, #survey-cta, [data-tab="survey"]')).toHaveCount(0);
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
    await shot(page, testInfo, 'staff-agenda');
    await page.locator('#bottom-nav [data-tab="staff"]').click();
    await expect(page.locator('#staff-faq')).toContainText('STAFF_FIXTURE_QUESTION');
    await expect(page.getByText('SHOULD_NOT_RENDER_STAFF_HOLD')).toHaveCount(0);
    await expect(page.locator('#staff-public-faq .faq-item')).toHaveCount(2);
    await shot(page, testInfo, 'staff-area');
  });

  test('staff FAQ failure does not break the agenda', async ({ page }) => {
    await mockSheets(page, { 3: 500 });
    await page.goto('/staff/');
    await ready(page);
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
    await page.locator('#bottom-nav [data-tab="staff"]').click();
    await expect(page.locator('#staff-faq')).toContainText('รอข้อมูลยืนยัน');
  });
});

test.describe('approval state as of today (all rows REVIEW)', () => {
  test('attendee shows pending state, not error, no promo, no mock', async ({ page }, testInfo) => {
    await mockSheets(page, { 1: 'schedule-all-review.csv', 2: 'faq-public-all-review.csv' });
    await page.goto('/attendee/');
    await ready(page);
    await expect(page.locator('#agenda-pending-state')).toBeVisible();
    await expect(page.locator('#agenda-pending-state')).toContainText('Agenda กำลังรอการยืนยันจากทีมงาน');
    await expect(page.locator('#error-state')).toBeHidden();
    await expect(page.locator('.promo-inline')).toHaveCount(0);
    await expect(page.locator('#fixtures-banner')).toBeHidden();
    await expect(page.locator('#survey-cta')).toBeHidden();
    await expect(page.getByText('SHOULD_NOT_RENDER')).toHaveCount(0);
    await shot(page, testInfo, 'attendee-all-review');
    await page.locator('#bottom-nav [data-tab="faq"]').click();
    await expect(page.locator('#faq-public')).toContainText('รอข้อมูลยืนยันจากผู้จัดงาน');
    await expect(page.locator('#faq-public .faq-item')).toHaveCount(0);
    await page.locator('#bottom-nav [data-tab="speakers"]').click();
    await expect(page.locator('#speakers-list')).toContainText('รอข้อมูลยืนยัน');
  });
});

test.describe('FAQ + survey placeholders', () => {
  test('FAQ order, escaping, placeholders', async ({ page }, testInfo) => {
    await mockSheets(page);
    await page.goto('/attendee/?tab=faq');
    await ready(page);
    const qs = page.locator('#faq-public .faq-q');
    await expect(qs).toHaveCount(2);
    await expect(qs.nth(0)).toContainText('ลำดับ 2');
    await expect(qs.nth(0)).toContainText('<script>');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await expect(page.getByText('SHOULD_NOT_RENDER')).toHaveCount(0);
    await expect(page.locator('#quick-info')).toContainText('รอข้อมูลยืนยัน');
    await shot(page, testInfo, 'attendee-faq');
    await page.locator('#bottom-nav [data-tab="survey"]').click();
    const btn = page.locator('#survey-section button[disabled]');
    await expect(btn).toHaveText('แบบสอบถาม — รอลิงก์จากทีมงาน');
    await shot(page, testInfo, 'attendee-survey');
  });
});

test.describe('fixtures preview mode', () => {
  // The shareable preview must read as an editorial demo: no adversarial/test payloads, no emoji in the title.
  const FORBIDDEN = /<script|<img|onerror|__xss|9:00:00|Google Sheet|STAFF_FIXTURE|SHOULD_NOT_RENDER|javascript:/i;
  const EMOJI = /\p{Extended_Pictographic}/u;
  for (const [site, tabs] of [['fixtures', ['agenda', 'speakers', 'faq', 'survey']], ['fixtures-staff', ['agenda', 'faq', 'staff']]]) {
    test(`${site}: every tab is free of test payloads; title has no emoji`, async ({ page }) => {
      await page.goto(`/${site}/`);
      await ready(page);
      expect(await page.title()).not.toMatch(EMOJI);
      for (const tab of tabs) {
        await page.locator(`#bottom-nav [data-tab="${tab}"]`).click();
        await expect(page.locator(`#tab-${tab}`)).toBeVisible();
        expect(await page.locator('body').innerText(), tab).not.toMatch(FORBIDDEN);
      }
      const csv = await (await page.request.get(`/${site}/fixtures/schedule.csv`)).text();
      expect(csv).not.toMatch(FORBIDDEN);
      await page.locator('#bottom-nav [data-tab="faq"]').click();
      await expect(page.locator('#quick-info')).toContainText('รอข้อมูลยืนยัน');
    });
  }
  test('labelled sample banner and no Google requests', async ({ page }, testInfo) => {
    const google = [];
    page.on('request', (r) => { if (r.url().includes('docs.google.com')) google.push(r.url()); });
    await page.goto('/fixtures/');
    await ready(page);
    await expect(page.locator('#fixtures-banner')).toBeVisible();
    await expect(page.locator('#fixtures-banner')).toContainText('ข้อมูลตัวอย่าง');
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
    expect(google).toEqual([]);
    await shot(page, testInfo, 'attendee-fixtures');
    await page.locator('#bottom-nav [data-tab="faq"]').click();
    await expect(page.locator('#faq-public .faq-item')).toHaveCount(2);
    await shot(page, testInfo, 'attendee-fixtures-faq');
  });
  test('staff fixtures preview', async ({ page }, testInfo) => {
    await page.goto('/fixtures-staff/?tab=staff');
    await ready(page);
    await expect(page.locator('#fixtures-banner')).toBeVisible();
    await expect(page.locator('#staff-faq')).toContainText('[ตัวอย่าง] คำถามสำหรับทีมงาน');
    await shot(page, testInfo, 'staff-fixtures-area');
  });
});
