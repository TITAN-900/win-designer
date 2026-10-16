import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { assetPath, projectPath, projectDescription, renderProjectContent, renderProjectDocument } from '../src/project-content.js';

const read = path => readFileSync(path, 'utf8');
const context = { window: {} };
vm.runInNewContext(read('assets/data/projects.js'), context);
const { projects, site } = context.window.WIN_DESIGN_DATA;
const origin = 'https://win-joinery.vercel.app';

test('the real project document contains all customer photographs, metadata and return links', () => {
  assert.equal(projects.length,1);
  for (const project of projects) {
    const html = read(`dist${projectPath(project.slug)}index.html`);
    assert.ok(html.includes(`<h1 id="projectTitle">${project.title}</h1>`), project.slug);
    assert.ok(html.includes(`<title>${project.title} | WIN JOINERY SDN BHD</title>`), project.slug);
    assert.ok(html.includes(`rel="canonical" href="${origin}${projectPath(project.slug)}"`));
    assert.ok(html.includes(`property="og:url" content="${origin}${projectPath(project.slug)}"`));
    assert.ok(html.includes(`property="og:image" content="${origin}${assetPath(project.cover.src)}"`));
    assert.ok(html.includes(`name="twitter:image" content="${origin}${assetPath(project.cover.src)}"`));
    for (const image of project.gallery) assert.ok(html.includes(`src="${assetPath(image.src)}"`), `${project.slug}: ${image.src}`);
    assert.ok(html.includes(project.description), project.slug);
    assert.match(html, /href="\/#portfolio"/);
    assert.doesNotMatch(html, /id="contact"|wa\.me|tel:|mailto:|enquiry/i);
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
  // An in-memory fixture preserves this safety regression without retaining
  // old, unverified project facts in the production portfolio.
  const source = projects[0];
  const pair = { before: { ...source.gallery[0], src:'images/test-only-before.jpeg' }, after: { ...source.gallery[1], src:'images/test-only-after.jpeg' } };
  for (const verified of [undefined, false]) {
    const html = renderProjectContent({ ...source, beforeAfter: [{ ...pair, verified }] }, site);
    assert.doesNotMatch(html, /id="projectBeforeAfter"/);
    assert.ok(!html.includes(pair.before.src));
  }
  // Test the future verified-data path without modifying the source portfolio.
  const html = renderProjectContent({ ...source, beforeAfter: [{ ...pair, verified: true }] }, site);
  assert.match(html, /id="projectBeforeAfter"/);
  assert.ok(html.includes(`src="${assetPath(pair.before.src)}"`));
  assert.ok(html.includes(`src="${assetPath(pair.after.src)}"`));
});

test('39 images render once each, retain native proportions and share a complete lightbox sequence', () => {
  const project=projects[0];
  const html=renderProjectContent(project,site);
  const images=[...html.matchAll(/<img\b[^>]*>/g)].map(match=>match[0]);
  assert.equal(images.length,39);
  assert.equal([...html.matchAll(/<h1\b/g)].length,1);
  assert.equal([...html.matchAll(/data-lightbox-index="(\d+)"/g)].length,39);
  assert.deepEqual([...html.matchAll(/data-lightbox-index="(\d+)"/g)].map(match=>Number(match[1])),Array.from({length:39},(_,index)=>index));
  for(const image of project.gallery){
    const matching=images.filter(tag=>tag.includes(`src="${assetPath(image.src)}"`));
    assert.equal(matching.length,1,image.src);
    assert.ok(matching[0].includes(`width="${image.width}" height="${image.height}"`));
    assert.match(matching[0],/srcset="[^"]+640w, [^"]+(?:810|1080)w" sizes="/);
    if(image.src===project.cover.src)assert.match(matching[0],/fetchpriority="high"/);
    else assert.match(matching[0],/loading="lazy"/);
  }
  assert.doesNotMatch(html,/class="lead"/,'missing supporting copy must not leave an empty paragraph');
  const css=read('assets/css/minimal-site.css');
  assert.match(css,/\.masonry-gallery img\s*\{[^}]*height:auto;[^}]*aspect-ratio:auto;[^}]*object-fit:contain/);
  assert.match(css,/\.project-hero-image\s*\{[^}]*height:auto;[^}]*object-fit:contain/);
  assert.doesNotMatch(css,/\.masonry-gallery[^}]*object-fit:cover/);
  assert.match(css,/\.lightbox-prev, \.lightbox-next\s*\{\s*top:auto;\s*bottom:18px;[^}]*transform:none/,'mobile controls must not stretch from inherited top:50% to bottom');
});

test('absent optional facts do not create empty sections or undefined SEO copy', () => {
  const project={...projects[0],type:undefined,intro:undefined,description:undefined,beforeAfter:undefined};
  const html=renderProjectDocument(read('project.html'),project,site,origin);
  assert.doesNotMatch(html,/class="brand-line"|class="lead"|class="project-note"|id="projectBeforeAfter"|undefined/);
  assert.equal(projectDescription(project,site),`${project.title} — real project photography from WIN JOINERY SDN BHD.`);
  assert.ok(html.includes(`name="twitter:title" content="${project.title} | WIN JOINERY SDN BHD"`));
});

test('project template escapes content and keeps a contact-free portfolio return', () => {
  const sample = { ...projects[0], title: 'Timber & Stone <Study>', intro: 'Warm "light".', description: 'Storage & proportion.' };
  const html = renderProjectDocument(read('project.html'), sample, site, origin);
  assert.ok(html.includes('Timber &amp; Stone &lt;Study&gt;'));
  assert.ok(html.includes('Warm &quot;light&quot;.'));
  assert.ok(!html.includes('<Study>'));
  const content = renderProjectContent(sample, site);
  assert.match(content,/href="\/#portfolio"/);
  assert.doesNotMatch(content,/wa\.me|tel:|mailto:/);
  assert.doesNotMatch(renderProjectContent({...sample,description:''},site),/class="project-note"/);
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
    for(const removed of ['walnut-residence','stone-kitchen','private-suite','open-living','foyer-cabinetry','built-in-study']){
      const response=await fetch(`${local}/projects/${removed}/`,{method:'HEAD'});
      assert.equal(response.status,404,`${port}: retired project ${removed} must not show replaced project facts`);
    }
  }
});
