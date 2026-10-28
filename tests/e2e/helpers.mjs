import { readFileSync, mkdirSync } from 'node:fs';
import { expect } from '@playwright/test';

const fx = (n) => readFileSync(new URL(`../fixtures/${n}`, import.meta.url), 'utf8');

/**
 * Mock the published Google Sheets CSVs. Never hits the real Sheet.
 * map: { 1: 'schedule.csv', 2: 'faq-public.csv', 3: 'faq-staff.csv' } (gid -> fixture | 'abort' | 'html' | 500)
 */
export async function mockSheets(page, map = {}) {
  const requests = [];
  const files = { 1: 'schedule.csv', 2: 'faq-public.csv', 3: 'faq-staff.csv', ...map };
  await page.route('https://docs.google.com/**', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url.href);
    const v = files[url.searchParams.get('gid')];
    if (v === 'abort' || v === undefined) return route.abort();
    if (v === 500) return route.fulfill({ status: 500, body: 'err' });
    if (v === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!DOCTYPE html><title>Sign in</title>' });
    return route.fulfill({ status: 200, contentType: 'text/csv; charset=utf-8', body: fx(v) });
  });
  return requests;
}

export function trackConsole(page) {
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

export async function ready(page) {
  await expect(page.locator('html[data-ready="1"]')).toHaveCount(1);
}

export async function shot(page, testInfo, name) {
  mkdirSync('test-results/screens', { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  const base = `test-results/screens/${testInfo.project.name}-${name}`;
  await page.screenshot({ path: `${base}-view.png` });
  return page.screenshot({ path: `${base}.png`, fullPage: true });
}
