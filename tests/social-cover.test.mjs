import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const imagePath = '/images/social/win-joinery-og-v1.png';
test('homepage social cover is a deployed 1200 by 630 PNG', () => {
  const source = readFileSync('public' + imagePath);
  assert.equal(source.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(source.readUInt32BE(16), 1200);
  assert.equal(source.readUInt32BE(20), 630);
  assert.deepEqual(readFileSync('dist' + imagePath), source);
});

test('homepage and its home fragment share the same text-only OG and Twitter image', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const image = 'https://win-joinery.vercel.app' + imagePath;
  for (const tag of ['og:image', 'og:image:secure_url']) {
    assert.ok(html.includes(`property="${tag}" content="${image}"`));
  }
  assert.ok(html.includes(`name="twitter:image" content="${image}"`));
  assert.match(html, /property="og:image:width" content="1200"/);
  assert.match(html, /property="og:image:height" content="630"/);
  assert.match(html, /property="og:image:type" content="image\/png"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  for (const url of ['https://win-joinery.vercel.app/', 'https://win-joinery.vercel.app/#home']) {
    assert.equal(new URL(url).pathname, '/');
  }
  assert.equal((html.match(/property="og:image" /g) || []).length, 1);
  assert.equal((html.match(/name="twitter:image" /g) || []).length, 1);
});
