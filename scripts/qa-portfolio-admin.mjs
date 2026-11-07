// Local front-end contract tests ONLY. Mock responses do not certify cloud RLS.
// Requires ordinary dev :5175 and test-only dev :5176 with .invalid Supabase URL.
import { chromium } from 'file:///C:/Users/helon/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='validation/joinery-v5-admin';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.QA_BROWSER || 'chrome',headless:true});const reports=[];
try {
 for(const width of [390,430]){
  const context=await browser.newContext({viewport:{width,height:900},isMobile:true,hasTouch:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:5175/admin/');
  await page.getByText('尚未连接 Supabase',{exact:false}).waitFor();assert.ok(await page.locator('button').isDisabled());
  await page.screenshot({path:`${output}/unconfigured-${width}.png`});
  let rows=[],failUpload=true,uploads=0;
  // Username bridge is mocked ONLY in this explicitly isolated contract test.
  await context.route('**/api/portfolio-login',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({access_token:'test-owner-token'})}));
  const fixture=await readFile('public/images/bungalow-bukit-taman-segar/bungalow-09.jpeg');
  await context.route('https://portfolio-test.invalid/**',async route=>{
   const req=route.request(),url=new URL(req.url()),method=req.method();let data=null,status=200;
   const headers={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'};
   if(method==='OPTIONS')return route.fulfill({status:204,headers});
   if(url.pathname.includes('/auth/v1/token'))data={access_token:'test-owner-token'};
   else if(url.pathname.endsWith('/rpc/portfolio_is_admin'))data=true;
   else if(url.pathname.includes('/portfolio_legacy_links'))data=[];
   else if(url.pathname.includes('/portfolio_projects')){
     if(method==='GET')data=url.searchParams.has('status')?rows.filter(r=>r.status==='PUBLISHED'):rows;
     if(method==='POST'){const row=req.postDataJSON();rows=[row];data=[row];}
     if(method==='PATCH'){rows=rows.map(r=>({...r,...req.postDataJSON()}));data=rows;}
     if(method==='DELETE'){rows=[];}
   }else if(url.pathname.includes('/object/sign/')&&method==='POST')data={signedURL:'/object/sign/portfolio/test.jpg?token=test'};
   else if(url.pathname.includes('/object/sign/')&&method==='GET')return route.fulfill({status:200,headers,contentType:'image/jpeg',body:fixture});
   else if(url.pathname.includes('/object/portfolio/')&&method==='POST'){
    if(failUpload){failUpload=false;status=500;data={message:'simulated interrupted upload'};}else{uploads++;assert.ok(req.postDataBuffer().length>100);data={};}
   }
   await route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto('http://127.0.0.1:5176/admin/');
  await page.locator('[name=username]').fill('test-owner');await page.locator('[name=password]').fill('test-only');await page.getByRole('button',{name:'登录',exact:true}).click();
  await page.getByRole('button',{name:'Add New Project'}).click();
  await page.locator('#name').fill('TEST — not real content');await page.locator('#description').fill('Local mocked browser test only.');await page.locator('#link').fill('https://example.com/');
  await page.locator('#files').setInputFiles(['public/images/bungalow-bukit-taman-segar/bungalow-09.jpeg','public/images/bungalow-bukit-taman-segar/bungalow-01.jpeg']);
  await page.getByText('照片已准备',{exact:false}).waitFor();assert.equal(await page.locator('.photo').count(),2);
  await page.locator('[data-action=down]').first().click();await page.locator('[data-action=cover]').last().click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:`${output}/editor-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:/Save Draft|Unpublish/}).click();await page.getByText('未完成保存',{exact:false}).waitFor();assert.equal(rows.length,0);
  await page.getByRole('button',{name:/Save Draft|Unpublish/}).click();await page.getByText('草稿已保存',{exact:false}).waitFor();assert.equal(rows[0].status,'DRAFT');assert.equal(uploads,2);
  await page.getByRole('button',{name:/^Edit TEST/}).click();await page.getByRole('button',{name:/^Publish$|^Save Published$/}).click();await page.getByText('已发布。',{exact:true}).waitFor();assert.equal(rows[0].photos.length,2);assert.equal(rows[0].status,'PUBLISHED');
  const publicPage=await context.newPage();await publicPage.goto('http://127.0.0.1:5176/projects/'+rows[0].slug+'/');await publicPage.locator('#projectTitle').waitFor();assert.equal(await publicPage.locator('#projectTitle').textContent(),rows[0].name);await publicPage.close();
  await page.getByRole('button',{name:/^Edit TEST/}).click();await page.locator('[data-action=remove]').first().click();await page.getByRole('button',{name:/Save Draft|Unpublish/}).click();await page.getByText('草稿已保存',{exact:false}).waitFor();assert.equal(rows[0].photos.length,1);
  await page.getByRole('button',{name:/^Edit TEST/}).click();await page.locator('#delete').click();await page.getByRole('button',{name:'Delete project',exact:true}).click();await page.getByText('作品已删除。',{exact:true}).waitFor();assert.equal(rows.length,0);
  await page.locator('#logout').click();await page.getByRole('heading',{name:'Welcome back.'}).waitFor();assert.equal(errors.length,0,JSON.stringify(errors));
  reports.push({width,passed:true,mode:'MOCKED API, not live Supabase',checks:['unconfigured blocked','login UI','two-file input and actual canvas compression','sort/cover','upload failure/retry','draft','publish','dynamic detail','remove photo','unpublish','delete confirmation','logout','no horizontal overflow']});await context.close();
 }
}finally{await browser.close();await writeFile(output+'/results.json',JSON.stringify(reports,null,2));}
console.log(JSON.stringify(reports));
