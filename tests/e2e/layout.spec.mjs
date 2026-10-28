import { test, expect } from '@playwright/test';
import { mockSheets, ready, shot } from './helpers.mjs';

for (const vp of [{ width: 360, height: 740 }, { width: 390, height: 844 }]) {
  test.describe(`layout ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    for (const site of ['attendee', 'staff']) {
      test(`${site}: no horizontal scroll, tap targets, nav does not cover content`, async ({ page }, testInfo) => {
        await mockSheets(page);
        await page.goto(`/${site}/`);
        await ready(page);
        await expect(page.locator('#schedule-list .card-s').first()).toBeVisible();
        const sw = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(sw[0]).toBeLessThanOrEqual(sw[1]);
        for (const sel of ['.day', '.chip', '#bottom-nav button', '#refresh-btn', '.card-s']) {
          const boxes = await page.locator(sel).evaluateAll((els) => els.filter((e) => e.offsetParent).map((e) => e.getBoundingClientRect().height));
          for (const h of boxes) expect(h, sel).toBeGreaterThanOrEqual(44);
        }
        // long speaker titles wrap inside the viewport
        await page.locator('[data-session="EX-D1-01"]').click();
        const overflow = await page.locator('#session-sheet .person small').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right));
        for (const r of overflow) expect(r).toBeLessThanOrEqual(vp.width);
        await page.keyboard.press('Escape');
        // last item is not hidden behind the bottom nav
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        const last = await page.locator('.foot').boundingBox();
        const nav = await page.locator('#bottom-nav').boundingBox();
        expect(last.y + last.height).toBeLessThanOrEqual(nav.y + 1);
        await page.evaluate(() => window.scrollTo(0, 0));
        await shot(page, testInfo, `${site}-agenda-${vp.width}`);
      });
    }

    for (const site of ['attendee', 'staff']) {
      test(`${site}: visual v2 — compact hero keeps first session above the fold, no yellow, no pill`, async ({ page }) => {
        await mockSheets(page);
        await page.goto(`/${site}/`);
        await ready(page);
        const first = await page.locator('#schedule-list .card-s').first().boundingBox();
        const nav = await page.locator('#bottom-nav').boundingBox();
        expect(first.y + 60, 'first session row visible without scrolling').toBeLessThanOrEqual(nav.y);
        const bad = await page.evaluate(() => {
          const out = [];
          for (const el of document.querySelectorAll('body *')) {
            if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
            const cs = getComputedStyle(el);
            const m = cs.backgroundColor.match(/rgba?\((\d+), (\d+), (\d+)(?:, ([\d.]+))?/);
            if (m && (m[4] === undefined || +m[4] > 0.2) && +m[1] > 200 && +m[2] > 170 && +m[3] < 90) out.push(`yellow bg: ${el.className || el.tagName}`);
            const r = parseFloat(cs.borderTopLeftRadius);
            if (r > 4 && !el.classList.contains('dot')) out.push(`radius ${r}px: ${el.className || el.tagName}`);
          }
          return out;
        });
        expect(bad).toEqual([]);
      });
    }

    test('attendee promo is inline 4th element, never fixed/sticky, no popup within 8s', async ({ page }) => {
      await mockSheets(page);
      await page.goto('/attendee/');
      await ready(page);
      const fourth = page.locator('#schedule-list > *').nth(3);
      await expect(fourth).toHaveClass(/promo-inline/);
      await expect(fourth).toHaveAttribute('data-placeholder', 'true');
      await expect(fourth).toContainText('ตัวอย่าง');
      const pos = await fourth.evaluate((e) => getComputedStyle(e).position);
      expect(['fixed', 'sticky']).not.toContain(pos);
      const box = await fourth.boundingBox();
      expect(Math.abs(box.width / box.height - 16 / 5)).toBeLessThan(0.05);
      await page.waitForTimeout(8000);
      await expect(page.locator('[role="dialog"]:visible, dialog[open]')).toHaveCount(0);
    });
  });
}
