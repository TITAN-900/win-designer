import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const audit = JSON.parse(readFileSync('assets/data/bungalow-photo-audit.json', 'utf8'));
const context = { window: {} };
vm.runInNewContext(readFileSync('assets/data/projects.js', 'utf8'), context);
const data = context.window.WIN_DESIGN_DATA;
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');
const asset = (src) => readFileSync(`public${src}`);

// Read the dimensions directly from delivered files, rather than trusting the
// HTML/audit dimensions. Full decoding and pixel-duplicate checks are performed
// by the preparation script; the source SHA ties this test to those decoded files.
function jpegDimensions(buffer) {
  assert.equal(buffer.readUInt16BE(0), 0xffd8, 'JPEG SOI must be present');
  assert.equal(buffer.readUInt16BE(buffer.length - 2), 0xffd9, 'JPEG EOI must be present');
  let offset = 2;
  while (offset < buffer.length) {
    assert.equal(buffer[offset++], 0xff, 'JPEG segment marker must be valid');
    while (buffer[offset] === 0xff) offset++;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = buffer.readUInt16BE(offset);
    assert.ok(length >= 2 && offset + length <= buffer.length, 'JPEG segment must fit');
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { width: buffer.readUInt16BE(offset + 5), height: buffer.readUInt16BE(offset + 3) };
    }
    offset += length;
  }
  throw new Error('JPEG dimensions were not found');
}

function webpDimensions(buffer) {
  assert.equal(buffer.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buffer.toString('ascii', 8, 12), 'WEBP');
  assert.equal(buffer.readUInt32LE(4) + 8, buffer.length, 'WebP container must be complete');
  for (let offset = 12; offset + 8 < buffer.length;) {
    const type = buffer.toString('ascii', offset, offset + 4);
    const length = buffer.readUInt32LE(offset + 4);
    const start = offset + 8;
    assert.ok(start + length <= buffer.length, 'WebP chunk must fit');
    if (type === 'VP8 ') {
      assert.equal(buffer.toString('hex', start + 3, start + 6), '9d012a');
      return { width: buffer.readUInt16LE(start + 6) & 0x3fff, height: buffer.readUInt16LE(start + 8) & 0x3fff };
    }
    if (type === 'VP8X') {
      return { width: buffer.readUIntLE(start + 4, 3) + 1, height: buffer.readUIntLE(start + 7, 3) + 1 };
    }
    offset = start + length + (length % 2);
  }
  throw new Error('WebP dimensions were not found');
}

test('customer audit retains all 39 valid, unique photographs with no corrupt or non-image items', () => {
  assert.equal(audit.items, 39);
  assert.equal(audit.images.length, 39);
  assert.equal(audit.validUniqueImages, 39);
  assert.equal(audit.duplicates, 0);
  assert.equal(audit.unreadable, 0);
  assert.equal(audit.nonImages, 0);
  assert.equal(new Set(audit.images.map((image) => image.sha256)).size, 39);
  assert.equal(new Set(audit.images.map((image) => image.pixelSha256)).size, 39);
  for (const image of audit.images) {
    assert.equal(image.status, 'valid');
    assert.match(image.sha256, /^[0-9a-f]{64}$/);
    assert.match(image.pixelSha256, /^[0-9a-f]{64}$/);
  }
});

test('all 39 full-resolution delivery photographs are byte-identical to audited customer originals', () => {
  let total = 0;
  for (const image of audit.images) {
    const full = image.delivery.at(-1);
    const bytes = asset(full.src);
    assert.match(full.src, /\.jpeg$/);
    assert.equal(sha256(bytes), image.sha256, image.source);
    assert.equal(bytes.length, image.sourceBytes, image.source);
    assert.deepEqual(jpegDimensions(bytes), { width: image.width, height: image.height });
    assert.equal(full.width, image.width);
    assert.equal(full.height, image.height);
    total += bytes.length;
  }
  assert.equal(total, audit.sourceBytes);
});

test('all 39 mobile candidates are real, smaller WebP files with uncropped aspect ratios', () => {
  for (const image of audit.images) {
    assert.equal(image.delivery.length, 2);
    const mobile = image.delivery[0];
    const bytes = asset(mobile.src);
    assert.match(mobile.src, /-640\.webp$/);
    assert.deepEqual(webpDimensions(bytes), { width: 640, height: mobile.height });
    assert.equal(mobile.height, Math.round(image.height * 640 / image.width));
    assert.equal(mobile.bytes, bytes.length);
    assert.ok(mobile.width < image.width, 'no upscaling');
    assert.ok(bytes.length < image.sourceBytes, 'mobile candidate reduces transfer size');
  }
});

test('the deployment photo directory contains exactly the 78 audited originals and mobile candidates', () => {
  const actual = readdirSync('public/images/bungalow-bukit-taman-segar').sort();
  const expected = audit.images.flatMap((image) => image.delivery.map((size) => size.src.split('/').at(-1))).sort();
  assert.equal(actual.length, 78);
  assert.deepEqual(actual, expected);
  assert.equal(audit.images.flatMap((image) => image.delivery).reduce((sum, size) => sum + size.bytes, 0), audit.deliveryBytes);
});

test('the published catalog contains only the real Bungalow project and all 39 audited photos', () => {
  assert.equal(data.site.name, 'WIN JOINERY SDN BHD');
  assert.equal(data.projects.length, 1);
  const project = data.projects[0];
  assert.equal(project.title, 'BUNGALOW BUKIT TAMAN SEGAR');
  assert.equal(project.slug, 'bungalow-bukit-taman-segar');
  assert.equal(project.gallery.length, 39);
  assert.equal(new Set(project.gallery.map((photo) => photo.src)).size, 39);
  assert.equal(project.beforeAfter.length, 0, 'no unverified Before/After pairs');
  assert.ok(project.gallery.some((photo) => photo.src === project.cover.src));
  for (const photo of project.gallery) {
    const source = audit.images.find((image) => image.delivery.at(-1).src === photo.src);
    assert.ok(source, photo.src);
    assert.equal(photo.width, source.width);
    assert.equal(photo.height, source.height);
    assert.equal(photo.original, photo.src);
    assert.equal(photo.srcSet, source.delivery.map((size) => `${size.src} ${size.width}w`).join(', '));
    assert.ok(photo.alt.length > 10, 'a descriptive alt is supplied');
  }
});
