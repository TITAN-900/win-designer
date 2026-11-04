import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {externalLink,configured,request,authHeaders} from '../src/portfolio-api.js';
import {portfolioData} from '../src/portfolio-public.js';
import imageHandler from '../api/portfolio-image.js';
test('remote admin has explicit routes, private cache policy and mobile upload controls',()=>{
 const deployment=JSON.parse(readFileSync('vercel.json','utf8'));
 for(const path of ['/admin','/admin/'])assert.ok(deployment.rewrites.some(r=>r.source===path&&r.destination==='/admin/index.html'));
 assert.ok(deployment.headers.some(r=>r.source==='/admin/:path*'&&r.headers.some(h=>h.key==='Cache-Control'&&h.value.includes('no-store'))));
 const source=readFileSync('src/admin.js','utf8');
 assert.match(source,/type="file"[^>]*multiple/);
 assert.doesNotMatch(source,/capture=|http:\/\/127\.0\.0\.1|http:\/\/localhost/);
 assert.match(readFileSync('src/admin.css','utf8'),/input,textarea,button\{font-size:16px/);
});
test('publishable key is never used as a bearer JWT',()=>{
 assert.deepEqual(authHeaders('sb_publishable_example'),{apikey:'sb_publishable_example'});
 assert.deepEqual(authHeaders('sb_publishable_example','user.jwt'),{apikey:'sb_publishable_example',Authorization:'Bearer user.jwt'});
});
test('CMS disabled without configuration preserves existing content and cannot pretend to save',async()=>{
 assert.equal(configured,false);const original={projects:[{slug:'real'}]};assert.equal(await portfolioData(original),original);
 await assert.rejects(request('/rest/v1/portfolio_projects',{method:'POST',body:{},owner:true}),/尚未配置/);
});
test('external links reject executable schemes, credentials and invalid input',()=>{
 for(const value of ['javascript:alert(1)','data:text/html,x','ftp://example.com','https://user:pass@example.com','invalid'])assert.throws(()=>externalLink(value));
 assert.equal(externalLink(''),'');assert.equal(externalLink('https://example.com/work'),'https://example.com/work');
});
test('private storage proxy rejects mutations and path traversal before contacting storage',async()=>{
 for(const [method,path,code] of [['POST','x',405],['GET','../../secret',400]]){
  const res={setHeader(){},end(){}};await imageHandler({method,url:'/api/portfolio-image?path='+encodeURIComponent(path)},res);assert.equal(res.statusCode,code);
 }
});
test('migration restricts writes to owner and published media to private bucket RLS',()=>{
 const sql=readFileSync('supabase/portfolio-v1.sql','utf8');
 for(const table of ['portfolio_admins','portfolio_projects','portfolio_legacy_links'])assert.ok(sql.includes(`alter table public.${table} enable row level security`));
 assert.match(sql,/auth\.sessions/);assert.match(sql,/status='PUBLISHED'/);assert.match(sql,/photos @> jsonb_build_array/);
 assert.match(sql,/'portfolio','portfolio',false,8388608/);assert.match(sql,/jsonb_array_length\(photos\)<=50/);
 assert.doesNotMatch(sql,/grant.*(?:insert|update|delete).*to anon/i);
});
test('admin is independently built and never linked from public homepage',()=>{
 const admin=readFileSync('dist/admin/index.html','utf8');assert.match(admin,/noindex,nofollow/);
 const home=readFileSync('dist/index.html','utf8');assert.doesNotMatch(home,/href="\/admin|admin-.*\.js/);
 assert.doesNotMatch(readFileSync('src/admin.js','utf8'),/localStorage|service_role/);
});
