import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loginMarkup, dashboardMarkup, projectRowsMarkup, editorMarkup, photosMarkup, changePhoto } from '../src/admin-view.js';
const photo = id => ({ id, src: `/images/${id}.jpg` });
const project = { id:'project',name:'Home <script>',status:'DRAFT',photos:[photo('a'),photo('b'),photo('c')],cover_id:'b' };

test('studio login keeps real username credentials and configuration gating', () => {
  const html=loginMarkup(false);
  assert.match(html,/name="username" type="text"/);
  assert.match(html,/type="password" autocomplete="current-password"/);
  assert.match(html,/<button[^>]*disabled/);
  assert.doesNotMatch(html,/name="email"|value="admin"|000000/);
});
test('dashboard distinguishes drafts and published without inventing project content', () => {
  const html=dashboardMarkup([project,{...project,status:'PUBLISHED'}],[]);
  assert.match(html,/data-filter="PUBLISHED"/);
  assert.match(html,/Add New Project/);
  assert.match(projectRowsMarkup([project],'DRAFT'),/Home &lt;script&gt;/);
  assert.doesNotMatch(projectRowsMarkup([project],'PUBLISHED'),/data-edit/);
});
test('upload stays multiple native file selection behind a keyboard-accessible full panel', () => {
  const html=editorMarkup(project,true);
  assert.match(html,/<input[^>]*id="files"[^>]*type="file"[^>]*multiple/);
  assert.doesNotMatch(html,/capture=/);
  assert.match(html,/<button type="button" id="choosePhotos"/);
  assert.match(html,/aria-label="Photo transfer progress"/);
  assert.match(html,/data-status="DRAFT"/);assert.match(html,/data-status="PUBLISHED"/);
  assert.match(html,/id="delete"/);
  assert.doesNotMatch(editorMarkup(project,false),/id="delete"/);
});
test('touch reorder preserves cover identity and produces exact public gallery sequence', () => {
  const p=structuredClone(project);
  changePhoto(p,'down',0);assert.deepEqual(p.photos.map(x=>x.id),['b','a','c']);assert.equal(p.cover_id,'b');
  changePhoto(p,'up',2);assert.deepEqual(p.photos.map(x=>x.id),['b','c','a']);
  changePhoto(p,'up',0);changePhoto(p,'down',2);assert.deepEqual(p.photos.map(x=>x.id),['b','c','a']);
  changePhoto(p,'cover',2);assert.equal(p.cover_id,'a');
  changePhoto(p,'remove',2);assert.equal(p.cover_id,'b');
  changePhoto(p,'remove',0);changePhoto(p,'remove',0);assert.equal(p.cover_id,null);
  changePhoto(p,'cover',90);assert.equal(p.photos.length,0);
});
test('photo controls have stable boundary, preview, cover and busy semantics', () => {
  const html=photosMarkup(project.photos,project.cover_id);
  assert.match(html,/aria-label="Move photo 1 earlier" disabled/);
  assert.match(html,/aria-label="Move photo 3 later" disabled/);
  assert.match(html,/aria-label="Preview photo 2"/);
  assert.match(html,/cover-badge/);
  const locked=photosMarkup(project.photos,project.cover_id,true);
  for(const button of locked.matchAll(/<button[^>]+>/g)) assert.match(button[0],/disabled/);
});
test('studio preserves safe uploads and retries; styles support touch, safe areas and reduced motion', () => {
  const js=readFileSync('src/admin.js','utf8'),css=readFileSync('src/admin.css','utf8');
  assert.match(js,/model\.photos\.length \+ files\.length > 50/);
  assert.match(js,/p\.blob && !p\.uploaded/);
  assert.match(js,/await upload\(p\.path, p\.blob/);
  assert.match(js,/if \(busy \|\| !await confirmAction\(/);
  assert.match(css,/prefers-reduced-motion:reduce/);assert.match(css,/safe-area-inset-bottom/);
  assert.match(css,/input,textarea,button\{font-size:16px/);
  assert.match(css,/min-height:48px/);
});
