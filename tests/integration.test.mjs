import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import vm from 'node:vm';

const read=p=>readFileSync(p,'utf8');
const context={window:{}};
vm.runInNewContext(read('assets/data/projects.js'),context);
const data=context.window.WIN_DESIGN_DATA;
const html=read('index.html');

test('approved 3D GLB is byte-for-byte unchanged',()=>{
  const hash=createHash('sha256').update(readFileSync('public/models/win_interior_demo.glb')).digest('hex');
  assert.equal(hash,'82d2a5e9c35975556430fca5007b82f9f6d564aa42d69e3a6503f7f009be0944');
});
test('original six projects and every referenced image exist',()=>{
  assert.equal(data.projects.length,6);
  const walk=value=>{
    if(!value||typeof value!=='object')return;
    if(value.src)assert.ok(existsSync(value.src),value.src);
    for(const child of Object.values(value))walk(child);
  };
  walk(data);
});
test('real logo, contact details and all homepage anchors are retained',()=>{
  assert.equal(data.site.phoneHref,'tel:+601172455699');
  assert.equal(data.site.whatsappBase,'https://wa.me/601172455699');
  assert.ok(html.includes(data.site.logo));
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(html.includes(`id="${match[1]}"`),match[1]);
  for(const section of ['services','portfolio','transformations','contact','showcase'])assert.ok(html.includes(`id="${section}"`));
  assert.ok(!/href="#"/.test(html));
  assert.ok(!/hello@windesigner\.com/.test(html));
});
test('contact form validates and prepares an encoded WhatsApp draft without sending',()=>{
  let submit,opened;
  const status={textContent:''};
  let fields=new Map([['name','Test & Example'],['phone','000000000'],['email','test@example.invalid'],['property','Condominium'],['projectType','Interior Design'],['message','Room A + B\nPlanning only']]);
  const form={querySelector:s=>s==='.form-status'?status:null,addEventListener:(event,callback)=>{if(event==='submit')submit=callback;}};
  const document={readyState:'complete',body:{},querySelector:()=>null,querySelectorAll:s=>s==='.contact-form'?[form]:[]};
  const window={WIN_DESIGN_DATA:data,open:(...args)=>{opened=args;}};
  const FormData=class{get(key){return fields.get(key)}};
  vm.runInNewContext(read('assets/js/main.js'),{window,document,FormData,URL,URLSearchParams});
  submit({preventDefault(){}});
  const url=new URL(opened[0]);
  assert.equal(url.origin,'https://wa.me');assert.equal(url.pathname,'/601172455699');
  assert.ok(url.searchParams.get('text').includes('Name: Test & Example'));
  assert.ok(url.searchParams.get('text').includes('Room A + B\nPlanning only'));
  assert.ok(url.searchParams.get('text').includes('Email: test@example.invalid'));
  assert.ok(url.searchParams.get('text').includes('Property: Condominium'));
  assert.equal(opened[2],'noopener');
  opened=null;fields=new Map();submit({preventDefault(){}});
  assert.equal(opened,null);assert.match(status.textContent,/name and phone/);
});
test('production build contains legacy modules, SEO files, images and lighting',()=>{
  for(const p of ['index.html','about.html','project.html','assets/js/main.js','assets/data/projects.js','assets/js/vendor/three.module.min.js','assets/js/studio-sculpture-geometry.js','american-walnut.jpg.jpeg','models/win_interior_demo.glb','robots.txt','sitemap.xml'])assert.ok(existsSync(resolve('dist',p)),p);
  const verify=dir=>{for(const entry of readdirSync(resolve('public',dir),{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())verify(p);else assert.ok(existsSync(resolve('dist',p)),p);}};
  verify('lighting');
  assert.match(read('about.html'),/type="module" src="src\/about.js"/);
  assert.match(read('src/about.js'),/studio-sculpture\.js/);
});

test('Vercel build does not depend on empty local-only directories',()=>{
  const config=read('vite.config.js');
  assert.doesNotMatch(config,/cpSync\(['"]about['"]/);
});

test('all content image URLs are served by dev and production preview',async()=>{
  const urls=new Set(['index.html','about.html','project.html?project=stone-kitchen','models/win_interior_demo.glb','assets/js/main.js','assets/js/vendor/three.module.min.js','assets/js/studio-sculpture-geometry.js','american-walnut.jpg.jpeg']);
  for(const project of data.projects)urls.add(`project.html?project=${project.slug}`);
  const walk=value=>{if(!value||typeof value!=='object')return;if(value.src)urls.add(value.src);for(const child of Object.values(value))walk(child);};walk(data);
  for(const port of [5175,4175])for(const path of urls){const response=await fetch(`http://127.0.0.1:${port}/${path}`,{method:'HEAD'});assert.equal(response.status,200,`${port}/${path}`);}
});
