import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { cpSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';
import { projectPath, renderProjectDocument } from './src/project-content.js';

// Keep the production identity stable on local and deployment-preview builds.
// The hostname must be attached to the existing Vercel project before release.
const siteOrigin = (process.env.SITE_URL || 'https://win-joinery.vercel.app').replace(/\/$/, '');
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
          response.end('<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, follow"><title>Project unavailable | WIN JOINERY SDN BHD</title><h1>Project unavailable.</h1><a href="/#portfolio">Back to portfolio</a></html>');
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
      // Do not publish archived project photographs, the retired graphic logo,
      // Blender source files or customer originals. The public/ directory is
      // copied by Vite; it contains the audited, deployable project photographs.
      for (const directory of ['css', 'fonts']) {
        cpSync(resolve('assets', directory), resolve('dist/assets', directory), { recursive: true });
      }
      for (const file of ['js/main.js', 'js/site-integration.js', 'data/projects.js', 'data/book-layout.json']) {
        const destination = resolve('dist/assets', file);
        mkdirSync(resolve(destination, '..'), { recursive: true });
        cpSync(resolve('assets', file), destination);
      }
      for (const room of ['space-01', 'space-02']) {
        const directory = resolve('dist/assets/3d', room);
        mkdirSync(directory, { recursive: true });
        cpSync(resolve('assets/3d', room, `win_${room.replace('-', '_')}_poster.png`),
          resolve(directory, `win_${room.replace('-', '_')}_poster.png`));
      }
      for (const file of readdirSync('.')) {
        if (file === 'robots.txt' || /^google.*\.html$/.test(file)) {
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
