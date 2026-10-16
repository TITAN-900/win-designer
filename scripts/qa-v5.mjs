// Isolated browser acceptance checks. Never connects to a personal browser profile.
// Usage: node scripts/qa-v5.mjs <origin> <output-directory> <playwright-module>
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const origin = process.argv[2] || 'http://127.0.0.1:4175';
const output = resolve(process.argv[3] || 'validation/joinery-v5');
const modulePath = process.argv[4];
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const projectPath = '/projects/bungalow-bukit-taman-segar/';

for (const size of [
  { width: 390, height: 844, dpr: 3, mobile: true },
  { width: 430, height: 932, dpr: 3, mobile: true },
  { width: 768, height: 1024, dpr: 2, mobile: true },
  { width: 1920, height: 1080, dpr: 1, mobile: false }
]) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: size.dpr,
    isMobile: size.mobile, hasTouch: size.mobile });
  const page = await context.newPage();
  const record = { ...size, errors: [], failedRequests: [], badResponses: [], checks: [] };
  page.on('pageerror', error => record.errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') record.errors.push(message.text()); });
  page.on('requestfailed', request => {
    if (!request.failure()?.errorText?.includes('ERR_ABORTED')) record.failedRequests.push({ url: request.url(), error: request.failure() });
  });
  page.on('response', response => { if (response.status() >= 400) record.badResponses.push({ url: response.url(), status: response.status() }); });
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('#viewer[data-loaded="true"]').waitFor({ timeout: 90000 });
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('.brand-wordmark').first().textContent(), 'WIN JOINERY');
    assert.equal(await page.locator('h1').count(), 1);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `home-${size.width}.png`) });
    record.checks.push('home, fonts, model load, single H1, no overflow');
    if (size.width <= 768) {
      const menu = page.locator('.menu-toggle');
      await menu.click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'true');
      await page.locator('.nav-links a[href="#portfolio"]').click();
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      record.checks.push('mobile menu opens and link closes it');
    } else await page.locator('.diorama-cta').click();
    const book = page.locator('#portfolioBook');
    await book.scrollIntoViewIfNeeded();
    await page.locator('.book-curl-canvas').waitFor({ timeout: 90000 });
    await page.waitForFunction(() => document.querySelector('#portfolioBook').classList.contains('book-ready'), { timeout: 90000 });
    await page.screenshot({ path: resolve(output, `book-closed-${size.width}.png`) });
    assert.equal(await book.getAttribute('data-cover'), 'closed');
    await page.locator('#bookNext').click();
    await page.waitForFunction(() => document.querySelector('#portfolioBook').dataset.cover === 'open');
    await page.waitForFunction(() => !document.querySelector('#bookNext').disabled);
    await page.screenshot({ path: resolve(output, `book-open-${size.width}.png`) });
    assert.equal(await book.getAttribute('data-capacity'), '24');
    assert.equal(await book.getAttribute('data-empty-slots'), '23');
    assert.equal((await page.locator('#bookStatus').textContent()).trim(), '01 / 06');
    record.checks.push('closed cover, open, first project right page, 6 pages / 24 slots / 23 incoming');
    record.book = await page.locator('.book-object').evaluate(element => ({ ...element.dataset }));
    for (let index = 0; index < 3; index++) {
      await page.locator('#bookNext').click();
      await page.waitForFunction(() => !document.querySelector('#bookPrevious').disabled);
    }
    assert.equal((await page.locator('#bookStatus').textContent()).trim(), '06 / 06');
    for (let index = 0; index < 3; index++) {
      await page.locator('#bookPrevious').click();
      await page.waitForFunction(() => !document.querySelector('#bookNext').disabled);
    }
    assert.equal((await page.locator('#bookStatus').textContent()).trim(), '01 / 06');
    record.checks.push('three forward and three backward page turns');
    await page.goto(origin + projectPath, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('#projectTitle').textContent(), 'BUNGALOW BUKIT TAMAN SEGAR');
    assert.equal(await page.locator('[data-lightbox-src]').count(), 39);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: resolve(output, `project-${size.width}.png`) });
    await page.locator('.project-hero-media').click();
    await page.locator('#lightbox.is-open').waitFor();
    await page.locator('[data-lightbox-next]').click();
    assert.ok((await page.locator('#lightboxImage').getAttribute('src')).includes('bungalow-01.jpeg'));
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#lightbox').getAttribute('aria-hidden'), 'true');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#projectTitle').textContent(), 'BUNGALOW BUKIT TAMAN SEGAR');
    record.checks.push('project direct load/refresh, all 39 photos, lightbox next/close, no overflow');
    const requests = await page.evaluate(() => performance.getEntriesByType('resource').map(item => item.name));
    assert.ok(!requests.some(url => /win-design-logo|livingroom\d*\.jpg|hero-condo/.test(url)));
    assert.equal(record.errors.length, 0, JSON.stringify(record.errors));
    assert.equal(record.failedRequests.length, 0, JSON.stringify(record.failedRequests));
    assert.equal(record.badResponses.length, 0, JSON.stringify(record.badResponses));
    record.passed = true;
  } catch (error) { record.passed = false; record.failure = error.stack; }
  results.push(record);
  console.log(JSON.stringify(record));
  await writeFile(resolve(output, 'browser-results.json'), JSON.stringify({ origin, results }, null, 2));
  await context.close();
}
await browser.close();
if (results.some(result => !result.passed)) process.exitCode = 1;
