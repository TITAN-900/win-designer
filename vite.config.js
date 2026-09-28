import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';

// Canonical metadata must always point to the existing production domain,
// including local builds and Vercel preview deployments.
const siteOrigin = (process.env.SITE_URL || 'https://win-designer.vercel.app').replace(/\/$/, '');
const injectSiteOrigin = value => value.replaceAll('__SITE_ORIGIN__', siteOrigin);

// The site is deployed at a Vercel project root. All runtime assets stay URL based;
// no build output contains machine-specific URL dependencies.
export default defineConfig({
  base: '/',
  build: {
    // The Three.js renderer is intentionally substantial; it is lazy-loaded by
    // the homepage and remains comfortably below this audited warning budget.
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        home: resolve('index.html'),
        about: resolve('about.html'),
        project: resolve('project.html')
      }
    }
  },
  plugins: [{
    name: 'preserve-existing-static-content',
    transformIndexHtml: html => injectSiteOrigin(html),
    closeBundle() {
      cpSync('assets', 'dist/assets', { recursive: true });
      for (const file of readdirSync('.')) {
        if (/\.(?:jpe?g|png|ico|xml|txt)$/i.test(file) || /^google.*\.html/.test(file)) {
          cpSync(file, resolve('dist', file));
        }
      }
      for (const file of ['sitemap.xml', 'robots.txt']) {
        const output = resolve('dist', file);
        writeFileSync(output, injectSiteOrigin(readFileSync(output, 'utf8')));
      }
    }
  }]
});
