import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const imagePath = '/images/social/win-joinery-og-v2.jpg';
test('homepage social cover preserves the approved customer JPEG byte-for-byte', () => {
  const source = readFileSync('public' + imagePath);
  assert.equal(source.subarray(0, 2).toString('hex'), 'ffd8');
  assert.equal(createHash('sha256').update(source).digest('hex'),
    'cdbd0b73cc437fc048e21225001729e655f0711722b8b2737f9547a1d44fab45');
  let dimensions;
  for (let offset = 2; offset < source.length;) {
    assert.equal(source[offset], 0xff);
    const marker = source[offset + 1], length = source.readUInt16BE(offset + 2);
    if (marker === 0xc0 || marker === 0xc2) {
      dimensions = [source.readUInt16BE(offset + 7), source.readUInt16BE(offset + 5)];
      break;
    }
    offset += 2 + length;
  }
  assert.deepEqual(dimensions, [1280, 669]);
  assert.deepEqual(readFileSync('dist' + imagePath), source);
});

test('homepage and its home fragment share the approved versioned OG and Twitter image', () => {
  const html = readFileSync('dist/index.html', 'utf8');
  const image = 'https://win-joinery.vercel.app' + imagePath;
  for (const tag of ['og:image', 'og:image:secure_url']) {
    assert.ok(html.includes(`property="${tag}" content="${image}"`));
  }
  assert.ok(html.includes(`name="twitter:image" content="${image}"`));
  assert.match(html, /property="og:image:width" content="1280"/);
  assert.match(html, /property="og:image:height" content="669"/);
  assert.match(html, /property="og:image:type" content="image\/jpeg"/);
  assert.match(html, /property="og:image:alt" content="WIN JOINERY SDN BHD"/);
  assert.doesNotMatch(html, /win-joinery-og-v1\.png/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  for (const url of ['https://win-joinery.vercel.app/', 'https://win-joinery.vercel.app/#home']) {
    assert.equal(new URL(url).pathname, '/');
  }
  assert.equal((html.match(/property="og:image" /g) || []).length, 1);
  assert.equal((html.match(/name="twitter:image" /g) || []).length, 1);
});
