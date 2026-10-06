import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { projectPath, renderProjectContent, renderProjectDocument } from '../src/project-content.js';

const read = path => readFileSync(path, 'utf8');
const context = { window: {} };
vm.runInNewContext(read('assets/data/projects.js'), context);
const { projects, site } = context.window.WIN_DESIGN_DATA;
const origin = 'https://win-designer.vercel.app';

test('six static project documents contain the correct photographs, metadata and return links', () => {
  for (const project of projects) {
    const html = read(`dist${projectPath(project.slug)}index.html`);
    assert.ok(html.includes(`<h1 id="projectTitle">${project.title}</h1>`), project.slug);
    assert.ok(html.includes(`<title>${project.title} | WIN DESIGN</title>`), project.slug);
    assert.ok(html.includes(`rel="canonical" href="${origin}${projectPath(project.slug)}"`));
    assert.ok(html.includes(`property="og:url" content="${origin}${projectPath(project.slug)}"`));
    assert.ok(html.includes(`property="og:image" content="${origin}/${project.cover.src}"`));
    for (const image of project.gallery) assert.ok(html.includes(`src="/${image.src}"`), `${project.slug}: ${image.src}`);
    assert.ok(html.includes(project.description), project.slug);
    assert.match(html, /href="\/#portfolio"/);
    assert.match(html, /id="contact"/);
    assert.doesNotMatch(html, /__SITE_ORIGIN__|<form\b|id="projectBeforeAfter"/);
    for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
      const url = match[1];
      if (/^(?:https?:|tel:|#)/.test(url)) continue;
      assert.ok(url.startsWith('/'), `${project.slug}: nested-route asset must be root-relative: ${url}`);
      const path = url.split('#')[0];
      if (path !== '/') assert.ok(existsSync(resolve('dist', path.slice(1))), `${project.slug}: ${path}`);
    }
  }
});

test('sitemap contains only the homepage and canonical project routes', () => {
  const locations = [...read('dist/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(locations, [origin + '/', ...projects.map(project => origin + projectPath(project.slug))]);
  assert.doesNotMatch(read('dist/sitemap.xml'), /about\.html|project\.html\?/);
});

test('unverified reference comparisons cannot appear on a project page', () => {
  const source = projects.find(project => project.beforeAfter.length);
  assert.ok(source, 'retained reference data exists for the regression');
  const pair = source.beforeAfter[0];
  for (const verified of [undefined, false]) {
    const html = renderProjectContent({ ...source, beforeAfter: [{ ...pair, verified }] }, site);
    assert.doesNotMatch(html, /id="projectBeforeAfter"/);
    assert.ok(!html.includes(pair.before.src));
  }
  // Test the future verified-data path without modifying the source portfolio.
  const html = renderProjectContent({ ...source, beforeAfter: [{ ...pair, verified: true }] }, site);
  assert.match(html, /id="projectBeforeAfter"/);
  assert.ok(html.includes(`src="/${pair.before.src}"`));
  assert.ok(html.includes(`src="/${pair.after.src}"`));
});

test('project template escapes content and encodes the project WhatsApp draft', () => {
  const sample = { ...projects[0], title: 'Timber & Stone <Study>', intro: 'Warm "light".', description: 'Storage & proportion.' };
  const html = renderProjectDocument(read('project.html'), sample, site, origin);
  assert.ok(html.includes('Timber &amp; Stone &lt;Study&gt;'));
  assert.ok(html.includes('Warm &quot;light&quot;.'));
  assert.ok(!html.includes('<Study>'));
  const content = renderProjectContent(sample, site);
  const link = [...content.matchAll(/href="(https:\/\/wa\.me\/[^\"]+)"/g)][0][1];
  const whatsapp = new URL(link.replaceAll('&amp;', '&'));
  assert.equal(whatsapp.pathname, '/601172455699');
  assert.equal(whatsapp.searchParams.get('text'), `Hi WIN DESIGN, I would like to discuss a space inspired by ${sample.title}.`);
});

test('dev and preview serve every dedicated route and reject unknown project routes', async () => {
  for (const port of [5175, 4175]) {
    const local = `http://127.0.0.1:${port}`;
    for (const project of projects) {
      const path = projectPath(project.slug);
      const head = await fetch(local + path, { method: 'HEAD' });
      assert.equal(head.status, 200, `${port}${path}`);
      assert.match(head.headers.get('content-type'), /text\/html/);
      const response = await fetch(local + path);
      const html = await response.text();
      assert.ok(html.includes(`<h1 id="projectTitle">${project.title}</h1>`), `${port}${path}: static content`);
      assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`));
      const legacy = await fetch(`${local}/project.html?project=${project.slug}`, { method: 'HEAD' });
      assert.equal(legacy.status, 200, `${port}: legacy ${project.slug}`);
    }
    const missing = await fetch(`${local}/projects/not-a-real-project/`, { method: 'HEAD' });
    assert.equal(missing.status, 404, `${port}: unknown project must not show the homepage`);
  }
});
