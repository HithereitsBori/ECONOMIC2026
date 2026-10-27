import { test, expect } from '@playwright/test';
import { mockSheets, ready, shot } from './helpers.mjs';
import { LEGACY_DENYLIST } from '../../scripts/denylist.mjs';

const LEGACY_KEY = ['gc', 'nt', '2026_v1_schedule'].join('');

test('cached data + network down -> stale banner, agenda kept', async ({ page }) => {
  await mockSheets(page);
  await page.goto('/attendee/');
  await ready(page);
  await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockSheets(page, { 1: 'abort', 2: 'abort' });
  await page.reload();
  await ready(page);
  await expect(page.locator('#fallback-banner')).toBeVisible();
  await expect(page.locator('#fallback-banner')).toContainText('แสดงข้อมูลเมื่อ');
  await expect(page.locator('#statusbar')).toHaveAttribute('data-state', 'offline-stale');
  await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
});

test('goes offline mid-session, manual refresh -> stale banner, agenda kept; back online recovers', async ({ page, context }, testInfo) => {
  await mockSheets(page);
  await page.goto('/attendee/');
  await ready(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await context.setOffline(true);
  await page.locator('#refresh-btn').click();
  await expect(page.locator('#fallback-banner')).toBeVisible();
  await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
  await shot(page, testInfo, 'attendee-offline-stale');
  await context.setOffline(false);
  await mockSheets(page);
  await page.locator('#refresh-btn').click();
  await expect(page.locator('#fallback-banner')).toBeHidden();
  await expect(page.locator('#statusbar')).toHaveAttribute('data-state', 'fresh');
});

test('no cache + network down -> error state with retry', async ({ page }) => {
  await mockSheets(page, { 1: 'abort', 2: 'abort' });
  await page.goto('/attendee/');
  await ready(page);
  await expect(page.locator('#error-state')).toBeVisible();
  await expect(page.locator('#retry-btn')).toBeVisible();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockSheets(page);
  await page.locator('#retry-btn').click();
  await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
});

test('renamed column header mid-event -> banner + previous agenda kept', async ({ page }) => {
  await mockSheets(page);
  await page.goto('/attendee/');
  await ready(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockSheets(page, { 1: 'schedule-bad-headers.csv' });
  await page.locator('#refresh-btn').click();
  await expect(page.locator('#fallback-banner')).toBeVisible();
  await expect(page.locator('#schedule-list .card-s')).toHaveCount(5);
  // last good cache was not overwritten
  const cached = await page.evaluate(() => JSON.parse(localStorage.getItem('ef2026_attendee_v1_schedule')).data.length);
  expect(cached).toBeGreaterThan(5);
});

test('Google sign-in HTML instead of CSV is treated as failure', async ({ page }) => {
  await mockSheets(page, { 1: 'html' });
  await page.goto('/attendee/');
  await ready(page);
  await expect(page.locator('#error-state')).toBeVisible();
});

test('row that lost approval disappears even from cache', async ({ page }) => {
  await mockSheets(page);
  await page.goto('/attendee/');
  await ready(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockSheets(page, { 1: 'schedule-all-review.csv' });
  await page.locator('#refresh-btn').click();
  await expect(page.locator('#agenda-pending-state')).toBeVisible();
  // now offline: the cache holds REVIEW rows -> still nothing rendered
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await mockSheets(page, { 1: 'abort', 2: 'abort' });
  await page.reload();
  await ready(page);
  await expect(page.locator('#schedule-list .card-s')).toHaveCount(0);
  await expect(page.getByText('SHOULD_NOT_RENDER')).toHaveCount(0);
});

test('legacy template cache keys are removed and never shown', async ({ page }) => {
  await page.addInitScript((k) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(k, JSON.stringify({ v: 1, ts: Date.now(), data: [{ session_id: 'L', topic_main: 'LEGACY_SESSION' }] }));
      sessionStorage.setItem('seeded', '1');
    }
  }, LEGACY_KEY);
  await mockSheets(page, { 1: 'abort', 2: 'abort' });
  await page.goto('/attendee/');
  await ready(page);
  await expect(page.getByText('LEGACY_SESSION')).toHaveCount(0);
  expect(await page.evaluate((k) => localStorage.getItem(k), LEGACY_KEY)).toBeNull();
});

test('unconfigured build shows "not connected" state, no mock content', async ({ page }) => {
  const requests = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.goto('/unconfigured/');
  await ready(page);
  await expect(page.locator('#not-configured-state')).toBeVisible();
  await expect(page.locator('#error-state')).toBeHidden();
  await expect(page.locator('#statusbar')).toHaveAttribute('data-state', 'none');
  expect(requests.filter((u) => u.includes('docs.google.com'))).toEqual([]);
  const html = await page.content();
  for (const n of LEGACY_DENYLIST) expect(html).not.toContain(n);
});
