// Additional release checks in isolated browsers: resize, vertical touch scroll,
// and a real failed GLB request. This does not connect to a personal profile.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const [origin, directory, modulePath] = process.argv.slice(2);
const { chromium } = await import(pathToFileURL(resolve(modulePath)).href);
const output = resolve(directory); await mkdir(output, { recursive: true });
const reports = [];
for (const mode of ['edge-resize', 'vertical-touch', 'failed-model']) {
  const report = { mode, checks: [], errors: [] };
  let browser;
  try {
    browser = await chromium.launch({ channel: mode === 'edge-resize' ? 'msedge' : 'chrome', headless: true });
    const context = await browser.newContext({
      viewport: mode === 'edge-resize' ? { width: 1440, height: 900 } : { width: 390, height: 844 },
      deviceScaleFactor: 2, isMobile: mode !== 'edge-resize', hasTouch: mode !== 'edge-resize'
    });
    const page = await context.newPage();
    page.on('pageerror', error => report.errors.push(error.message));
    if (mode === 'failed-model') await page.route('**/3d/space-01/*.glb', route => route.abort('failed'));
    await page.goto(origin, { waitUntil: 'networkidle' });
    if (mode === 'failed-model') {
      await page.locator('body.scene-fallback').waitFor();
      assert.equal(await page.locator('.diorama-poster').isVisible(), true);
      assert.ok(await page.locator('.diorama-poster').evaluate(image => image.complete && image.naturalWidth > 0));
      assert.equal(await page.locator('#error').isVisible(), true);
      assert.ok((await page.locator('#error-detail').textContent()).trim());
      await page.locator('.diorama-cta').click();
      await page.locator('#portfolioBook.book-ready').waitFor({ timeout: 90000 });
      report.checks.push('failed room GLB shows loaded poster and concrete error; independent book still loads');
    } else {
      await page.locator('#viewer[data-loaded="true"]').waitFor({ timeout: 90000 });
      if (mode === 'edge-resize') {
        for (const width of [1440, 360, 430, 768, 1920]) {
          await page.setViewportSize({ width, height: width >= 1000 ? 900 : 844 });
          await page.waitForTimeout(350);
          assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
          const size = await page.locator('#viewer').boundingBox();
          assert.ok(size.width > 200 && size.height > 200);
          assert.equal(await page.locator('.brand').isVisible(), true);
        }
        await page.locator('.diorama-cta').click();
        await page.locator('#portfolioBook.book-ready').waitFor({ timeout: 90000 });
        await page.locator('.minimal-footer a').click();
        await page.waitForTimeout(900);
        assert.ok(await page.evaluate(() => scrollY < 20));
        report.checks.push('installed Edge: 1440/360/430/768/1920 live resize, no overflow, footer returns home');
      } else {
        await page.locator('.diorama-cta').click();
        await page.locator('#portfolioBook.book-ready').waitFor({ timeout: 90000 });
        await page.locator('#bookNext').click();
        await page.waitForFunction(() => document.querySelector('#portfolioBook').dataset.cover === 'open');
        await page.locator('.book-curl-canvas').evaluate(canvas => window.scrollTo({
          top: scrollY + canvas.getBoundingClientRect().top - 150, behavior: 'instant'
        }));
        await page.waitForTimeout(200);
        const rect = await page.locator('.book-curl-canvas').boundingBox();
        const x = rect.x + rect.width * .5, y = rect.y + rect.height * .3;
        const before = await page.evaluate(() => scrollY);
        const cdp = await context.newCDPSession(page);
        const send = (type, dy = 0) => cdp.send('Input.dispatchTouchEvent', {
          type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: y + dy, id: 1 }]
        });
        await send('touchStart');
        for (let step = 1; step <= 10; step++) { await send('touchMove', step * 20); await page.waitForTimeout(25); }
        await send('touchEnd'); await page.waitForTimeout(500);
        const after = await page.evaluate(() => scrollY);
        report.scroll = { before, after, rect, start: { x, y } };
        assert.ok(after < before - 50, `vertical touch must scroll upward: ${before} -> ${after}`);
        assert.equal(await page.locator('#bookStatus').textContent(), '01 / 06');
        report.checks.push('vertical touch over actual open page scrolls website without turning page or opening project');
      }
    }
    await page.screenshot({ path: resolve(output, `${mode}.png`) });
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors)); report.passed = true;
  } catch (error) { report.passed = false; report.failure = error.stack; }
  finally { await browser?.close(); }
  reports.push(report); console.log(JSON.stringify(report));
}
await writeFile(resolve(output, 'release-edge-results.json'), JSON.stringify({ origin, reports }, null, 2));
if (reports.some(report => !report.passed)) process.exitCode = 1;
