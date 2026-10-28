import { test, expect } from '@playwright/test';
import { mockSheets, trackConsole, ready, shot } from './helpers.mjs';

test.describe('attendee agenda', () => {
  test('approved-only, cancelled badge, escaped XSS, no javascript: link, no CSP errors', async ({ page }, testInfo) => {
    const errors = trackConsole(page);
    await mockSheets(page);
    await page.goto('/attendee/');
    await ready(page);
    await expect(page.locator('#main-content')).toBeVisible();
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
    await expect(page.getByText('SHOULD_NOT_RENDER')).toHaveCount(0);
    const cancelled = page.locator('[data-session="EX-D1-04"]');
    await expect(cancelled).toHaveClass(/status-cancelled/);
    await expect(cancelled.locator('.b-cancel')).toHaveText('ยกเลิก');
    // XSS payload shown as text, never executed
    await expect(page.locator('[data-session="EX-D1-05"] .ttl')).toContainText('<img src=x onerror=');
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
    await page.locator('[data-session="EX-D1-05"]').click();
    await expect(page.locator('#session-sheet')).toBeVisible();
    await expect(page.locator('#session-sheet a[href^="javascript"]')).toHaveCount(0);
    await expect(page.locator('#session-sheet a')).toHaveCount(0);
    await page.locator('#sheet-close').click();
    await expect(page.locator('#session-sheet')).toBeHidden();
    // https stream link is allowed
    await page.locator('[data-session="EX-D1-03"]').click();
    await expect(page.locator('#session-sheet a[href="https://example.com/live"]')).toHaveAttribute('rel', 'noopener');
    await page.keyboard.press('Escape');
    // multi-speaker split + long title wraps
    await page.locator('[data-session="EX-D1-01"]').click();
    await expect(page.locator('#session-sheet .person')).toHaveCount(4);
    await shot(page, testInfo, 'attendee-session-sheet');
    await page.keyboard.press('Escape');
    expect(errors.filter((e) => /Content Security Policy|Refused/.test(e))).toEqual([]);
  });

  test('day and stage filters', async ({ page }) => {
    await mockSheets(page);
    await page.goto('/attendee/');
    await ready(page);
    await page.locator('[data-zone="X Stage"]').click();
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(1);
    await page.locator('[data-day="2026-11-05"]').click();
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(1);
    await expect(page.locator('#schedule-list .card-s .b-move')).toHaveText('เปลี่ยนเวที');
    await page.locator('[data-day="2026-11-06"]').click();
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(0);
    await expect(page.locator('#day-empty')).toBeVisible();
    await expect(page.locator('.promo-inline')).toHaveCount(0); // no lone banner in an empty list
    await page.locator('[data-zone="all"]').click();
    await expect(page.locator('#schedule-list .card-s')).toHaveCount(1);
    await expect(page.locator('#schedule-list > *').nth(1)).toHaveClass(/promo-inline/); // 1 item -> promo at end
  });

  test('speakers tab lists only people from approved sessions; tabs via ?tab=', async ({ page }) => {
    await mockSheets(page);
    await page.goto('/attendee/?tab=speakers');
    await ready(page);
    await expect(page.locator('#tab-speakers')).toBeVisible();
    await expect(page.locator('#speakers-list .sp')).toHaveCount(5);
    await page.locator('#bottom-nav [data-tab="faq"]').click();
    await expect(page).toHaveURL(/tab=faq/);
    await expect(page.locator('#tab-faq')).toBeVisible();
  });
});

test.describe('Bangkok timezone', () => {
  test.use({ timezoneId: 'America/New_York' });
  test('device in New York still shows Bangkok day + live session', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T03:30:00Z')); // 10:30 Bangkok, 23:30 Nov 3 in New York
    await mockSheets(page);
    await page.goto('/attendee/');
    await ready(page);
    await expect(page.locator('[data-day="2026-11-04"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-session="EX-D1-03"]')).toHaveClass(/status-live/);
    await expect(page.locator('[data-session="EX-D1-01"]')).toHaveClass(/status-past/);
    await expect(page.locator('#last-updated')).toContainText('10:30 น.');
  });
  test('Nov 5 in Bangkok while still Nov 4 on device clock', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-04T17:30:00Z')); // 00:30 Nov 5 Bangkok
    await mockSheets(page);
    await page.goto('/attendee/');
    await ready(page);
    await expect(page.locator('[data-day="2026-11-05"]')).toHaveAttribute('aria-pressed', 'true');
  });
});
