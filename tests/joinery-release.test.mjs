import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const read = path => readFileSync(path, 'utf8');

test('old domain is retained as a path-preserving redirect only to the confirmed new hostname', () => {
  const config = JSON.parse(read('vercel.json'));
  const rule = config.redirects.find(rule => rule.has?.some(item => item.type === 'host'));
  assert.equal(rule.source, '/:path*');
  assert.deepEqual(rule.has, [{ type: 'host', value: 'win-designer.vercel.app' }]);
  assert.equal(rule.destination, 'https://win-joinery.vercel.app/:path*');
  assert.equal(rule.permanent, true);
  assert.equal(config.buildCommand, 'npm run build');
  assert.equal(config.outputDirectory, 'dist');
});

test('production package contains no retired photo collections, graphic logos or raw working files', () => {
  for (const path of ['assets/win20', 'assets/projects', 'BUNGALOW BUKIT TAMAN SEGAR', 'validation', 'favicon.ico', 'livingroom.jpg.jpg']) {
    assert.equal(existsSync(resolve('dist', path)), false, path);
  }
  function inspect(directory) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) inspect(path);
      else {
        assert.doesNotMatch(entry.name, /\.(?:blend\d*|py|pyc|mjs|env)$/i, path);
        if (/\.(?:html|js|css|xml|txt)$/.test(entry.name)) {
          assert.doesNotMatch(read(path), /WIN DESIGN|win-designer\.vercel\.app|win-design-logo|WhatsApp Image 2026/i, path);
        }
      }
    }
  }
  inspect('dist');
});

test('custom 404 keeps the new identity and a working portfolio return without indexing errors', () => {
  const html = read('dist/404.html');
  assert.match(html, /WIN JOINERY SDN BHD/);
  assert.match(html, /name="robots" content="noindex, follow"/);
  assert.match(html, /href="\/#portfolio"/);
});

test('only static fallback suppresses empty binding endpapers, never physical book geometry', () => {
  const css = read('assets/css/portfolio-book.css');
  assert.match(css, /\.book-fallback \.book-page:has\(> \.book-endpaper\)\s*\{\s*display:\s*none/);
  assert.doesNotMatch(css, /\.book-ready \.book-page:has/);
  assert.match(read('src/portfolio-book.js'), /return \[null, \.\.\.pages, null\]/);
});

test('legacy layout rules cannot hide the diorama poster and project entry during WebGL fallback', () => {
  assert.doesNotMatch(read('assets/css/ui-refresh.css'), /scene-fallback #showcase\s*\{\s*display:\s*none/);
  assert.match(read('assets/css/diorama-hero.css'), /scene-fallback \.diorama-poster\s*\{\s*opacity:\s*1/);
});
