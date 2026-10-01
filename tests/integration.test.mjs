import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {mediaOffset} from '../assets/js/editorial.js';
import {activateSceneFallback} from '../src/scene-fallback.js';
import {storyState,headline,isShellCore} from '../src/diorama-timeline.js';

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
test('the original logo keeps its natural proportions in navigation and footer',()=>{
  const logo=readFileSync(data.site.logo);
  const width=logo.readUInt32BE(16),height=logo.readUInt32BE(20);
  for(const page of ['index.html','about.html','project.html']){
    const tags=[...read(page).matchAll(/<img\b[^>]*>/g)].map(match=>match[0]).filter(tag=>tag.includes(data.site.logo));
    assert.equal(tags.length,2,page);
    for(const tag of tags){
      assert.ok(tag.includes(`width="${width}"`),`${page}: logo width`);
      assert.ok(tag.includes(`height="${height}"`),`${page}: logo height`);
    }
  }
  assert.match(read('assets/css/ui-refresh.css'),/\.site-footer \.footer-brand img\s*\{[^}]*height:\s*auto/);
  assert.match(read('assets/css/ui-refresh.css'),/\.site-footer \.footer-bottom \.js-year\s*\{\s*display:\s*inline;?\s*\}/);
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

test('production SEO always uses the existing official domain',()=>{
  const origin='https://win-designer.vercel.app';
  assert.equal(data.site.url,`${origin}/`);
  assert.match(read('vite.config.js'),/SITE_URL \|\| 'https:\/\/win-designer\.vercel\.app'/);
  for(const page of ['index.html','about.html','project.html']){
    const output=read(`dist/${page}`);
    assert.ok(output.includes(`rel="canonical" href="${origin}/`),page);
    assert.ok(output.includes(`property="og:image" content="${origin}/`),page);
    assert.ok(!output.includes('__SITE_ORIGIN__'),page);
  }
  assert.ok(read('dist/robots.txt').includes(origin));
  assert.ok(read('dist/sitemap.xml').includes(origin));
});

test('3D failure leaves a static interior and navigable site',()=>{
  const classes=new Set();
  const loading={classList:{add:value=>classes.add(value)}};
  const error={hidden:true};
  const detail={textContent:''};
  const viewer={attributes:{},setAttribute(name,value){this.attributes[name]=value;}};
  const nodes={'#loading':loading,'#error':error,'#error-detail':detail,'#viewer':viewer};
  const document={body:{classList:{add:value=>classes.add(value)}},querySelector:selector=>nodes[selector]};
  activateSceneFallback(document,new Error('WebGL unavailable'));
  assert.ok(classes.has('scene-fallback'));
  assert.ok(classes.has('is-complete'));
  assert.equal(error.hidden,false);
  assert.equal(detail.textContent,'WebGL unavailable');
  assert.equal(viewer.attributes['aria-hidden'],'true');
  assert.match(read('assets/css/diorama-hero.css'),/scene-fallback \.diorama-poster\s*\{\s*opacity:\s*1/);
  assert.match(read('assets/css/diorama-hero.css'),/scene-fallback #viewer\s*\{\s*visibility:\s*hidden/);
  assert.match(read('assets/css/diorama-hero.css'),/scene-fallback \.diorama-story/);
  assert.ok(html.includes('win_space_01_poster.png'));
});

test('the people-free two-space transformation is reversible and stops with scroll',()=>{
  for(const progress of [0,.12,.32,.475,.50,.525,.74,.91,1]){
    const first=storyState(progress);
    storyState(progress+.1);
    assert.deepEqual(storyState(progress),first);
    assert.equal(first.progress,progress);
    assert.ok(!Object.hasOwn(first,'workers'));
    assert.ok(headline(first.space,first.local)[1].length<25);
  }
  assert.equal(storyState(.27).space,0);
  assert.equal(storyState(.73).space,1);
  assert.equal(storyState(.20,true).local,1);
  assert.equal(storyState(.80,true).space,0);
});

test('the empty-room stage retains its walls after GLTFLoader normalizes names',()=>{
  for(const name of ['ARCH_Back wall','ARCH_Back_wall','ARCH_Bedroom_back_wall','ARCH_Window_head','ARCH_Left_wall_front_pier'])assert.ok(isShellCore(name),name);
  for(const name of ['ARCH_Window_glazing','JOINERY_Wall_cabinet_case','ARCH_Back_skirting'])assert.ok(!isShellCore(name),name);
});

test('only the two independent web rooms are shipped and loaded',()=>{
  let combinedBytes=0;
  for(const path of ['public/3d/space-01/win_space_01.glb','public/3d/space-02/win_space_02.glb']){
    const bytes=readFileSync(path);
    assert.equal(bytes.subarray(0,4).toString(),'glTF');
    assert.ok(bytes.byteLength<8_000_000,path);
    combinedBytes+=bytes.byteLength;
    const jsonLength=bytes.readUInt32LE(12);
    const gltf=JSON.parse(bytes.subarray(20,20+jsonLength).toString());
    assert.ok(gltf.images.length>=8,`${path}: embedded finish textures`);
    assert.ok(gltf.materials.some(material=>material.normalTexture),`${path}: tactile normal detail`);
    assert.ok(gltf.materials.some(material=>material.pbrMetallicRoughness?.metallicRoughnessTexture),`${path}: roughness variation`);
    for(let stage=1;stage<=8;stage++)assert.ok(gltf.nodes.some(node=>node.name?.startsWith(`0${stage}_`)),`${path}: stage ${stage}`);
    assert.ok(!gltf.nodes.some(node=>/worker|person|human/i.test(node.name||'')),`${path}: no people`);
    assert.ok(existsSync(resolve('dist',path.replace(/^public\//,''))),path);
  }
  assert.ok(combinedBytes<12_000_000,'both rooms fit the web asset budget');
  assert.ok(!existsSync('public/3d/workers'));
  assert.ok(!existsSync('dist/3d/workers'));
  assert.doesNotMatch(read('src/diorama.js'),/win_workers|workerRoots|placeWorkers/i);
  assert.doesNotMatch(read('src/diorama-timeline.js'),/workers/i);
  assert.ok(html.includes('diorama-story'));
  assert.ok(!html.includes('class="studio-layer"'));
  assert.ok(read('src/home.js').includes("import('./diorama.js')"));
});

test('comparison pointer drag clamps, reverses and stops on release',()=>{
  const handlers={},rangeHandlers={};
  let reveal='',captured;
  const range={value:'52',addEventListener:(name,fn)=>{rangeHandlers[name]=fn;}};
  const frame={getBoundingClientRect:()=>({left:100,width:400}),setPointerCapture:id=>{captured=id;},style:{setProperty:(_name,value)=>{reveal=value;}},addEventListener:(name,fn)=>{handlers[name]=fn;}};
  const document={readyState:'complete',querySelector:selector=>selector==='#compare-range'?range:selector==='#renovation-compare'?frame:null,addEventListener(){}};
  const window={matchMedia:()=>({addEventListener(){}})};
  vm.runInNewContext(read('assets/js/site-integration.js'),{window,document});
  handlers.pointerdown({isPrimary:true,button:0,pointerId:7,clientX:200});
  assert.equal(captured,7);assert.equal(reveal,'25%');
  handlers.pointermove({pointerId:7,clientX:600});assert.equal(reveal,'100%');
  handlers.pointermove({pointerId:7,clientX:100});assert.equal(reveal,'0%');
  handlers.pointerup();handlers.pointermove({pointerId:7,clientX:300});assert.equal(reveal,'0%');
  range.value='52';rangeHandlers.input();assert.equal(reveal,'52%');
});

test('navigation follows tall sections in both directions and clears above content',()=>{
  let scrollY=0;
  const listeners={};
  const sections=[{id:'portfolio',top:1000,bottom:6000},{id:'services',top:6000,bottom:7500},{id:'contact',top:7500,bottom:9500}]
    .map(section=>({...section,getBoundingClientRect:()=>({top:section.top-scrollY,bottom:section.bottom-scrollY})}));
  const links=sections.map(section=>({href:`https://win-designer.vercel.app/#${section.id}`,active:false,addEventListener(){},getAttribute(){return null;},classList:{toggle(_name,value){const link=links.find(link=>link.href.endsWith('#'+section.id));link.active=value===undefined?!link.active:Boolean(value);}}}));
  const nav={getBoundingClientRect:()=>({bottom:78}),classList:{add(){}}};
  const document={readyState:'complete',body:{},querySelector:selector=>selector==='.site-nav'?nav:null,querySelectorAll:selector=>selector==='[data-nav-section]'?sections:selector==='.nav-links a'?links:[]};
  const window={WIN_DESIGN_DATA:data,addEventListener:(name,fn)=>{listeners[name]=fn;},requestAnimationFrame:fn=>fn()};
  vm.runInNewContext(read('assets/js/main.js'),{window,document,URL,URLSearchParams,location:{href:'https://win-designer.vercel.app/',pathname:'/'}});
  const active=()=>links.filter(link=>link.active).map(link=>new URL(link.href).hash);
  assert.deepEqual(active(),[]);
  scrollY=1000;listeners.scroll();assert.deepEqual(active(),['#portfolio']);
  scrollY=5000;listeners.scroll();assert.deepEqual(active(),['#portfolio']);
  scrollY=7500;listeners.scroll();assert.deepEqual(active(),['#contact']);
  scrollY=6000;listeners.scroll();assert.deepEqual(active(),['#services']);
  scrollY=0;listeners.resize();assert.deepEqual(active(),[]);
});

test('editorial changes preserve the approved renderer, baked lighting and Hero layout',()=>{
  const preserved={
    'src/interior.js':'745b6351dbf2cd2e1c7a2a1776c93b5d70c4d6802e7e453e928aa5ad59000a73',
    'src/baked-lighting.js':'13d00995ebb7c9e98447ed79a08a4f13e35deac59344193dddee6abc14880df2',
    'src/style.css':'cca621de2eed9b96def342545a950a159c3be84f7dedaae82a96e056bb05f0c3'
  };
  for(const [file,hash] of Object.entries(preserved))assert.equal(createHash('sha256').update(read(file).replace(/\r\n/g,'\n')).digest('hex'),hash,file);
});

test('editorial image movement is bounded and exactly reversible without accumulated time',()=>{
  assert.equal(mediaOffset(1000,500,1000),-8);
  assert.equal(mediaOffset(-500,500,1000),8);
  assert.equal(mediaOffset(250,500,1000),0);
  const first=mediaOffset(100,500,1000);
  mediaOffset(-200,500,1000);
  assert.equal(mediaOffset(100,500,1000),first);
  assert.equal(mediaOffset(-10000,500,1000),8);
  assert.equal(mediaOffset(10000,500,1000),-8);
});

test('redesigned homepage keeps all six projects and their full galleries',()=>{
  const list={innerHTML:''};
  const document={readyState:'complete',body:{},querySelector:s=>s==='#projectSections'?list:null,querySelectorAll:()=>[]};
  vm.runInNewContext(read('assets/js/main.js'),{window:{WIN_DESIGN_DATA:data},document,URL,URLSearchParams});
  assert.equal([...list.innerHTML.matchAll(/<article /g)].length,6);
  for(const project of data.projects){
    assert.ok(list.innerHTML.includes(`project.html?project=${project.slug}`));
    assert.equal(list.innerHTML.split(`data-lightbox-group="home-${project.slug}"`).length-1,project.gallery.length);
    assert.ok(list.innerHTML.includes(`aria-label="View ${project.title} gallery"`));
  }
});

test('homepage visual sections use local assets with accessible text and lazy loading',()=>{
  for(const section of ['about-home','portfolio','services','materials','transformations','process','contact'])assert.ok(html.includes(`id="${section}"`));
  for(const match of html.matchAll(/<img\s[^>]+>/g)){
    const tag=match[0],src=tag.match(/src="([^"]+)"/)[1];
    assert.ok(existsSync(src),src);
    assert.doesNotMatch(src,/127\.0\.0\.1|[A-Z]:[\\/]/);
    assert.match(tag,/alt="[^"]*"/);
    if(!src.includes('logo')&&!tag.includes('id="lightboxImage"')&&!tag.includes('class="diorama-poster"'))assert.match(tag,/loading="lazy"/);
    if(tag.includes('class="diorama-poster"'))assert.match(tag,/fetchpriority="high"/);
  }
  assert.match(html,/not a verified client before-and-after/);
});

test('all content image URLs are served by dev and production preview',async()=>{
  const urls=new Set(['index.html','about.html','project.html?project=stone-kitchen','models/win_interior_demo.glb','3d/space-01/win_space_01.glb','3d/space-02/win_space_02.glb','assets/js/main.js','assets/js/vendor/three.module.min.js','assets/js/studio-sculpture-geometry.js','american-walnut.jpg.jpeg']);
  for(const project of data.projects)urls.add(`project.html?project=${project.slug}`);
  const walk=value=>{if(!value||typeof value!=='object')return;if(value.src)urls.add(value.src);for(const child of Object.values(value))walk(child);};walk(data);
  for(const match of html.matchAll(/<img\s[^>]*src="([^"]+)"/g))urls.add(match[1]);
  for(const port of [5175,4175])for(const path of urls){const response=await fetch(`http://127.0.0.1:${port}/${path}`,{method:'HEAD'});assert.equal(response.status,200,`${port}/${path}`);}
});
