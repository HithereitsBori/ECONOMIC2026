import { test, expect } from '@playwright/test';
import { ready } from './helpers.mjs';

// Lighthouse gate guard (QA t_205ada71): no render-blocking third-party CSS and no layout shift
// while the app boots and inserts data. Lighthouse itself is run manually (README → Performance).
for (const site of ['fixtures', 'fixtures-staff']) {
  test(`${site}: boot + data insertion CLS < 0.1, no third-party font/CSS requests`, async ({ page }) => {
    const external = [];
    page.on('request', (r) => { if (!r.url().startsWith('http://localhost')) external.push(r.url()); });
    await page.addInitScript(() => {
      window.__cls = 0;
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto(`/${site}/`);
    await ready(page);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__cls)).toBeLessThan(0.1);
    expect(external).toEqual([]);
    expect(await page.locator('link[rel="stylesheet"]').count()).toBe(0); // CSS is inlined
  });
}
