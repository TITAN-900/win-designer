import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { portfolioMarkup } from '../src/portfolio-grid.js';
import { mergePublishedProjects } from '../src/portfolio-public.js';
import { renderProjectContent } from '../src/project-content.js';

const photo = n => ({id:String(n),src:`/images/fixture-${n}.jpg`,width:800,height:1200,alt:'Test image'});
const project = {slug:'test-only',title:'Room <&>',cover:photo(2),gallery:[photo(1),photo(2),photo(3)]};

test('gallery is project-driven, escapes content and never renders drafts or blank book slots', () => {
  const html = portfolioMarkup([project,{...project,status:'DRAFT',slug:'private'}, {...project,cover:null}]);
  assert.equal((html.match(/<article/g)||[]).length,1);
  assert.match(html,/Room &lt;&amp;&gt;/);
  assert.match(html,/href="\/projects\/test-only\/"/);
  assert.match(html,/src="\/images\/fixture-2.jpg"/);
  assert.match(html,/loading="lazy"/);
  assert.doesNotMatch(html,/private|INCOMING|canvas|UPLOAD/);
});

test('CMS publication and legacy takeover are independent of gallery presentation', () => {
  const original={site:{},projects:[project]};
  const row={slug:'cms',name:'Saved project',status:'PUBLISHED',photos:[photo(3),photo(1)],cover_id:'1',description:'Saved description',external_link:'https://example.com'};
  const data=mergePublishedProjects(original,[row,{...row,status:'DRAFT',slug:'draft'}],[]);
  assert.deepEqual(data.projects.map(p=>p.slug),['test-only','cms']);
  assert.deepEqual(data.projects[1].gallery.map(p=>p.id),['3','1']);
  assert.equal(data.projects[1].cover.id,'1');
  assert.equal(mergePublishedProjects(original,[],[{slug:'test-only'}]).projects.length,0);
});

test('detail image and lightbox order follow saved gallery order even when cover is last', () => {
  const html=renderProjectContent({...project,cover:photo(3)},{});
  const sources=[...html.matchAll(/<img src="([^"]+)"/g)].map(m=>m[1]);
  assert.deepEqual(sources,project.gallery.map(p=>p.src));
  assert.deepEqual([...html.matchAll(/data-lightbox-index="(\d+)"/g)].map(m=>Number(m[1])),[0,1,2]);
  assert.ok(html.indexOf('Back to portfolio')<html.indexOf('<img'));
  assert.equal((html.match(/<h1/g)||[]).length,1);
});

test('production removes the book renderer, model and controls while retaining the Hero', () => {
  const html=readFileSync('dist/index.html','utf8');
  assert.match(html,/>PORTFOLIO<\/h2>/);
  assert.match(html,/id="viewer"/);
  assert.doesNotMatch(html,/book-stage|bookNext|bookPrevious|book-hint|portfolio-book/);
  assert.equal(existsSync('dist/3d/book/portfolio_book.glb'),false);
  assert.equal(existsSync('dist/assets/css/portfolio-book.css'),false);
  assert.equal(existsSync('dist/assets/data/book-layout.json'),false);
  assert.equal(existsSync('dist/3d/space-01/win_space_01.glb'),true);
  assert.equal(existsSync('dist/3d/space-02/win_space_02.glb'),true);
});
