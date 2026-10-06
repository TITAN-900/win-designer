import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { projectPath, renderProjectDocument } from './src/project-content.js';

// Canonical metadata must always point to the existing production domain,
// including local builds and Vercel preview deployments.
const siteOrigin = (process.env.SITE_URL || 'https://win-designer.vercel.app').replace(/\/$/, '');
const injectSiteOrigin = value => value.replaceAll('__SITE_ORIGIN__', siteOrigin);
function projectData() {
  const context = { window: {} };
  vm.runInNewContext(readFileSync('assets/data/projects.js', 'utf8'), context);
  return context.window.WIN_DESIGN_DATA;
}

// The site is deployed at a Vercel project root. All runtime assets stay URL based;
// no build output contains machine-specific URL dependencies.
export default defineConfig({
  base: '/',
  appType: 'mpa',
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
    transformIndexHtml(html, context) {
      if (context.path === '/project.html' || context.path.startsWith('/projects/')) {
        const { projects, site } = projectData();
        const slug = context.path.match(/^\/projects\/([^/]+)/)?.[1];
        const project = projects.find(item => item.slug === slug) || projects[0];
        return renderProjectDocument(html, project, site, siteOrigin);
      }
      return injectSiteOrigin(html);
    },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const pathname = new URL(request.url, 'http://localhost').pathname;
        const match = pathname.match(/^\/projects\/([^/]+)\/?$/);
        if (!match) return next();
        const { projects } = projectData();
        if (!projects.some(project => project.slug === match[1])) {
          response.statusCode = 404;
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end('<!doctype html><title>Project unavailable | WIN DESIGN</title><h1>Project unavailable.</h1><a href="/#portfolio">Back to portfolio</a>');
          return;
        }
        try {
          const html = await server.transformIndexHtml(pathname, readFileSync('project.html', 'utf8'));
          response.setHeader('Content-Type', 'text/html; charset=utf-8');
          response.end(html);
        } catch (error) { next(error); }
      });
    },
    closeBundle() {
      cpSync('assets', 'dist/assets', { recursive: true });
      for (const file of readdirSync('.')) {
        if (/\.(?:jpe?g|png|ico|xml|txt)$/i.test(file) || /^google.*\.html/.test(file)) {
          cpSync(file, resolve('dist', file));
        }
      }
      for (const file of ['robots.txt']) {
        const output = resolve('dist', file);
        writeFileSync(output, injectSiteOrigin(readFileSync(output, 'utf8')));
      }
      const { projects, site } = projectData();
      const template = readFileSync('dist/project.html', 'utf8');
      for (const project of projects) {
        const directory = resolve('dist', 'projects', project.slug);
        mkdirSync(directory, { recursive: true });
        writeFileSync(resolve(directory, 'index.html'), renderProjectDocument(template, project, site, siteOrigin));
      }
      const urls = ['/', ...projects.map(project => projectPath(project.slug))];
      writeFileSync('dist/sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(path => `  <url><loc>${siteOrigin}${path}</loc></url>`).join('\n')}\n</urlset>\n`);
    }
  }]
});
