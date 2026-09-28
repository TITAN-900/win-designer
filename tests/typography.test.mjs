import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {resolve} from 'node:path';

const read=p=>readFileSync(p,'utf8');
const typography=read('assets/css/typography.css');
const layouts=['src/style.css','assets/css/styles.css','assets/css/about.css','assets/css/studio-sculpture.css','assets/css/site-integration.css','assets/css/editorial.css'];
const pages=['index.html','about.html','project.html'];

test('every page uses the same typography file with no third-party font stylesheets',()=>{
  for(const file of pages){
    const html=read(file);
    assert.match(html,/href="assets\/css\/typography\.css"/);
    assert.ok(html.indexOf('assets/css/typography.css')>html.indexOf('assets/css/site-integration.css'));
    assert.doesNotMatch(html,/fonts\.(?:googleapis|gstatic)\.com/);
  }
});
test('font families and weights are limited to the two-family brand system',()=>{
  const faces=[...typography.matchAll(/@font-face\s*\{([^}]+)\}/g)].map(m=>m[1]);
  assert.equal(faces.length,4);
  const families=new Set(faces.map(face=>face.match(/font-family:\s*'([^']+)'/)[1]));
  assert.deepEqual([...families].sort(),['Cormorant Garamond','Inter']);
  for(const face of faces)assert.match(face,/font-weight:\s*(?:400|500);/);
  assert.match(typography,/#intro-title em\s*\{\s*font-style:\s*italic;/);
  assert.doesNotMatch(typography,/font-weight:\s*(?:[6789]00|bold|bolder)/);
});
test('old layout styles cannot override fonts, weights or type scales',()=>{
  const legacy=/(?:^|[;{])\s*(font(?:-(?:family|size|weight|style))?|line-height|letter-spacing|text-transform)\s*:/m;
  for(const file of layouts)assert.doesNotMatch(read(file),legacy,file);
});
test('all font files are local, small, licensed and available in the build',async()=>{
  const paths=[...typography.matchAll(/url\('\.\.\/fonts\/([^']+)'\)/g)].map(m=>`assets/fonts/${m[1]}`);
  assert.equal(paths.length,4);
  let bytes=0;
  for(const path of paths){
    bytes+=statSync(path).size;
    assert.ok(statSync(resolve('dist',path)).size>0);
    const response=await fetch(`http://127.0.0.1:5175/${path}`,{method:'HEAD'});
    assert.equal(response.status,200,path);
  }
  assert.ok(bytes<100_000);
  for(const license of ['Inter-LICENSE.txt','Cormorant-Garamond-LICENSE.txt'])assert.match(read(`assets/fonts/${license}`),/SIL OPEN FONT LICENSE/);
});
