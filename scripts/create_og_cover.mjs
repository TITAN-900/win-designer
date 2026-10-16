// Deterministic text-only social cover using the site's existing licensed font.
// Usage: node scripts/create_og_cover.mjs /path/to/playwright/index.mjs
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const { chromium } = await import(pathToFileURL(resolve(process.argv[2])).href);
const font = await readFile(resolve(root, 'assets/fonts/manrope-latin-wght-normal.woff2'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async encodedFont => {
    const face = new FontFace('CoverManrope', `url(data:font/woff2;base64,${encodedFont})`, { weight: '200 800' });
    await face.load(); document.fonts.add(face);
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 630;
    const context = canvas.getContext('2d');
    context.fillStyle = '#F5F1E8'; context.fillRect(0, 0, 1200, 630);
    context.font = '650 88px CoverManrope';
    context.letterSpacing = '7px';
    context.fillStyle = '#292A27';
    const text = 'WIN JOINERY', metrics = context.measureText(text);
    // Centre the actual ink bounds, not the font's asymmetric baseline box.
    const x = 600 + (metrics.actualBoundingBoxLeft - metrics.actualBoundingBoxRight) / 2;
    const y = 315 + (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;
    context.fillText(text, x, y);
    return canvas.toDataURL('image/png').split(',')[1];
  }, font.toString('base64'));
  const destination = resolve(root, 'public/images/social/win-joinery-og-v1.png');
  await mkdir(resolve(root, 'public/images/social'), { recursive: true });
  await writeFile(destination, Buffer.from(png, 'base64'));
  console.log(destination);
} finally { await browser.close(); }
