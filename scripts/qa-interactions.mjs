// Real Chromium touch dispatch in an isolated test profile; never the owner's
// personal browser. Emulation is not a substitute for physical-device testing.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const [origin = 'http://127.0.0.1:4175', directory = 'validation/joinery-v5-interactions', modulePath] = process.argv.slice(2);
const { chromium } = await import(modulePath ? pathToFileURL(resolve(modulePath)).href : 'playwright');
const output = resolve(directory); await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const reports = [];
for (const width of process.env.QA_FALLBACK_ONLY ? [] : [390, 430]) {
  const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 932 },
    deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage(), cdp = await context.newCDPSession(page);
  const report = { width, checks: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', {
    type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: .7 }]
  });
  async function swipe(direction, kind = 'page', held = false, cancel = false) {
    const rect = await page.locator('.book-curl-canvas').boundingBox();
    const start = rect.x + rect.width * (direction > 0 ? .78 : .10);
    const y = rect.y + rect.height * .44;
    const distance = rect.width * .72;
    await touch('touchStart', start, y);
    if (held) {
      for (const progress of [.2, .5, .3, .8]) {
        await touch('touchMove', start - direction * distance * progress, y);
        await page.waitForTimeout(200);
        const selector = kind === 'cover' ? 'coverProgress' : 'curlProgress';
        const first = await page.locator('.book-object').getAttribute(`data-${selector === 'coverProgress' ? 'cover-progress' : 'curl-progress'}`);
        await page.waitForTimeout(160);
        const second = await page.locator('.book-object').getAttribute(`data-${selector === 'coverProgress' ? 'cover-progress' : 'curl-progress'}`);
        assert.ok(first !== null, `${kind}: direct touch must initiate movement`);
        assert.ok(Math.abs(Number(first) - progress) < .035, `${kind}: ${first} follows ${progress}`);
        assert.equal(first, second, `${kind}: held finger must not advance`);
      }
    } else {
      for (let step = 1; step <= 12; step++) {
        await touch('touchMove', start - direction * distance * .82 * step / 12, y);
        await page.waitForTimeout(18);
      }
    }
    await touch(cancel ? 'touchCancel' : 'touchEnd');
    await page.waitForTimeout(1150);
  }
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    await page.locator('#viewer[data-loaded="true"]').waitFor({ timeout: 90000 });
    for (const space of ['01', '02']) {
      await page.waitForFunction(space => {
        const view = document.querySelector('#viewer');
        return view.dataset.space === space && view.dataset.phase === 'hold';
      }, space, { timeout: 60000 });
      await page.screenshot({ path: resolve(output, `space-${space}-complete-${width}.png`) });
      report[`space${space}`] = await page.locator('#viewer').evaluate(element => ({ ...element.dataset }));
    }
    report.checks.push('both room completion/daylight states and transition observed');
    await page.locator('.diorama-cta').click();
    await page.locator('#portfolioBook').scrollIntoViewIfNeeded();
    await page.locator('#portfolioBook.book-ready').waitFor({ timeout: 90000 });
    await swipe(1, 'cover', true);
    assert.equal(await page.locator('#portfolioBook').getAttribute('data-cover'), 'open');
    report.checks.push('cover direct touch 20/50/reverse30/80%, held, opens on release');
    await swipe(1, 'page', true);
    assert.equal(await page.locator('#bookStatus').textContent(), '02—03 / 06');
    await swipe(1); await swipe(1);
    assert.equal(await page.locator('#bookStatus').textContent(), '06 / 06');
    await swipe(-1); await swipe(-1); await swipe(-1);
    assert.equal(await page.locator('#bookStatus').textContent(), '01 / 06');
    await swipe(1, 'page', false, true);
    assert.equal(await page.locator('#bookStatus').textContent(), '01 / 06');
    report.checks.push('central-page touch, held/reverse curl, 3 next / 3 previous, cancelled turn');
    await page.screenshot({ path: resolve(output, `book-touch-tested-${width}.png`) });
    const rect = await page.locator('.book-curl-canvas').boundingBox();
    // Actual photo cell on the right-hand paper, checked by screenshot and UV.
    await page.touchscreen.tap(rect.x + rect.width * .39, rect.y + rect.height * .32);
    await page.waitForURL('**/projects/bungalow-bukit-taman-segar/');
    report.checks.push('tap real 3D project photo opens correct detail route');
    await page.locator('#projectGallery').scrollIntoViewIfNeeded();
    await page.screenshot({ path: resolve(output, `gallery-${width}.png`) });
    const photos = page.locator('#projectGallery img');
    for (let index = 0; index < await photos.count(); index++) {
      const photo = photos.nth(index); await photo.scrollIntoViewIfNeeded();
      await photo.evaluate(image => image.decode());
      const geometry = await photo.evaluate(image => ({ rendered: image.clientWidth / image.clientHeight,
        native: Number(image.getAttribute('width')) / Number(image.getAttribute('height')) }));
      assert.ok(Math.abs(geometry.rendered - geometry.native) < .02);
    }
    report.checks.push('every gallery photo decodes while scrolling; portrait/landscape aspect preserved');
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors)); report.passed = true;
  } catch (error) { report.passed = false; report.failure = error.stack; }
  reports.push(report); console.log(JSON.stringify(report)); await context.close();
}

for (const mode of ['reduced-motion', 'no-webgl']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2, isMobile: true, hasTouch: true,
    ...(mode === 'reduced-motion' ? { reducedMotion: 'reduce' } : {}) });
  if (mode === 'no-webgl') await context.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      return /webgl/.test(type) ? null : original.call(this, type, ...args);
    };
  });
  const page = await context.newPage(); const report = { mode, checks: [], errors: [] };
  page.on('pageerror', error => report.errors.push(error.message));
  try {
    await page.goto(origin, { waitUntil: 'networkidle' });
    if (mode === 'reduced-motion') {
      await page.waitForFunction(() => document.querySelector('#viewer').dataset.phase === 'reduced');
      assert.equal(await page.locator('#viewer').getAttribute('data-build'), '1.000');
      report.checks.push('static completed lit room under reduced motion');
    } else {
      await page.locator('body.scene-fallback').waitFor();
      assert.equal(await page.locator('.diorama-poster').evaluate(image => image.complete && image.naturalWidth > 0), true);
      assert.equal(await page.locator('.diorama-poster').isVisible(), true);
      assert.equal(await page.locator('.diorama-cta').isVisible(), true);
      report.checks.push('visible real poster and reported WebGL failure; page remains usable');
    }
    await page.screenshot({ path: resolve(output, `${mode}-home.png`) });
    await page.locator('.diorama-cta').click();
    if (mode === 'no-webgl') {
      await page.locator('#portfolioBook.book-fallback').waitFor();
      assert.equal(await page.locator('[data-book-left]').isVisible(), false, 'blank endpaper must not push project below a blank screen');
      await page.locator('[data-book-right]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, 'no-webgl-portfolio.png') });
      await page.locator('[data-book-right] a').click();
      await page.waitForURL('**/projects/bungalow-bukit-taman-segar/');
      report.checks.push('fallback hides blank endpaper, photo/project remains clickable');
    }
    assert.equal(report.errors.length, 0, JSON.stringify(report.errors)); report.passed = true;
  } catch (error) { report.passed = false; report.failure = error.stack; }
  reports.push(report); console.log(JSON.stringify(report)); await context.close();
}
await browser.close();
await writeFile(resolve(output, 'interaction-results.json'), JSON.stringify({ origin, reports }, null, 2));
if (reports.some(result => !result.passed)) process.exitCode = 1;
