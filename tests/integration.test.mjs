import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync, readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import vm from 'node:vm';
import {mediaOffset} from '../assets/js/editorial.js';
import {activateSceneFallback} from '../src/scene-fallback.js';
import {loopState,headline,isShellCore,SEQUENCE,CYCLE_MS} from '../src/diorama-timeline.js';
import {createBookPages,nextBookPosition,previousBookPosition} from '../src/portfolio-book.js';

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
test('real logo and portfolio navigation remain while public contact data is removed',()=>{
  assert.equal(data.site.phoneHref,undefined);
  assert.equal(data.site.whatsappBase,undefined);
  assert.ok(html.includes(data.site.logo));
  for(const match of html.matchAll(/href="#([^"]+)"/g))assert.ok(html.includes(`id="${match[1]}"`),match[1]);
  for(const section of ['home','portfolio','showcase'])assert.ok(html.includes(`id="${section}"`));
  for(const page of ['index.html','project.html']){
    const nav=read(page).match(/<nav class="nav-links"[\s\S]*?<\/nav>/)[0];
    const links=[...nav.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match=>match[1]);
    assert.equal(links.length,2,page);
    assert.ok(links[0].endsWith('#home'));
    assert.ok(links[1].endsWith('#portfolio'));
    assert.doesNotMatch(nav,/admin|contact|whatsapp/i);
  }
  assert.doesNotMatch(html,/href="#"/);
});
test('the original logo keeps its natural proportions in navigation and footer',()=>{
  const logo=readFileSync(data.site.logo);
  const width=logo.readUInt32BE(16),height=logo.readUInt32BE(20);
  for(const page of ['index.html','project.html']){
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
test('public pages and shipped data contain no contact or editing affordances',()=>{
  for(const page of ['index.html','project.html','about.html','assets/data/projects.js','src/project-content.js','src/project.js']){
    const source=read(page);
    assert.doesNotMatch(source,/<form\b|class="contact-form"/);
    assert.doesNotMatch(source,/wa\.me|tel:|mailto:|601172455699|#contact|contactPoint|enquiry/i,page);
    assert.doesNotMatch(source,/>\s*(?:Upload|Edit|Delete|Admin|Add Photo|Publish|\+ Add Project)\s*</i,page);
  }
  assert.doesNotMatch(read('assets/js/main.js'),/initContactForms|FormData|renderTransformationPreview|renderHome/);
});
test('production build retains project photography, SEO files and lighting',()=>{
  for(const p of ['index.html','about.html','project.html','assets/js/main.js','assets/data/projects.js','assets/js/vendor/three.module.min.js','assets/js/studio-sculpture-geometry.js','american-walnut.jpg.jpeg','models/win_interior_demo.glb','robots.txt','sitemap.xml'])assert.ok(existsSync(resolve('dist',p)),p);
  const verify=dir=>{for(const entry of readdirSync(resolve('public',dir),{withFileTypes:true})){const p=dir+'/'+entry.name;if(entry.isDirectory())verify(p);else assert.ok(existsSync(resolve('dist',p)),p);}};
  verify('lighting');
  assert.match(read('about.html'),/http-equiv="refresh" content="0; url=\/#portfolio"/);
  assert.match(read('about.html'),/name="robots" content="noindex, follow"/);
  assert.doesNotMatch(read('about.html'),/src\/about\.js|<section\b/);
  assert.ok(JSON.parse(read('vercel.json')).redirects.some(route=>route.source==='/about.html'&&route.destination==='/#portfolio'));
});

test('Vercel build does not depend on empty local-only directories',()=>{
  const config=read('vite.config.js');
  assert.doesNotMatch(config,/cpSync\(['"]about['"]/);
});

test('production SEO always uses the existing official domain',()=>{
  const origin='https://win-designer.vercel.app';
  assert.equal(data.site.url,`${origin}/`);
  assert.match(read('vite.config.js'),/SITE_URL \|\| 'https:\/\/win-designer\.vercel\.app'/);
  for(const page of ['index.html','project.html']){
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

test('people-free two-space build loops by time, with completed holds and overlap',()=>{
  assert.equal(CYCLE_MS,2*(SEQUENCE.build+SEQUENCE.daylight+SEQUENCE.hold+SEQUENCE.transition));
  for(const ms of [0,500,3000,7600,9900,11000,14000,21000,23100]){
    const state=loopState(ms);
    assert.deepEqual(loopState(ms+CYCLE_MS),{...state,cycle:state.cycle+1});
    assert.ok(!Object.hasOwn(state,'workers'));
    assert.ok(headline(state.space,state.space?state.secondLocal:state.firstLocal)[1].length<25);
  }
  assert.equal(loopState(0).firstLocal,0);
  assert.equal(loopState(SEQUENCE.build+100).firstLocal,1);
  assert.equal(loopState(SEQUENCE.build+SEQUENCE.daylight+SEQUENCE.hold+SEQUENCE.transition/2).phase,'transition');
  assert.equal(loopState(SEQUENCE.build+SEQUENCE.daylight+SEQUENCE.hold+SEQUENCE.transition/2).blend,.5);
  assert.equal(loopState(SEQUENCE.build+SEQUENCE.daylight+SEQUENCE.hold+SEQUENCE.transition+100).space,1);
  assert.equal(loopState(100,true).firstLocal,1);
  assert.equal(loopState(100,true).phase,'reduced');
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

test('plant vessels install before their stems and leaves in both rooms',()=>{
  for(const [room,pot,stem,leaf] of [
    ['space-01','DECOR_Floor pot','DECOR_Plant branching stem','DECOR_Plant tapered leaf 1'],
    ['space-02','DECOR_Planter 00 floor vessel','DECOR_Planter 01 stems','DECOR_Planter 02 tapered leaf 1']
  ]){
    const bytes=readFileSync(`public/3d/${room}/win_${room.replace('-','_')}.glb`);
    const jsonLength=bytes.readUInt32LE(12);
    const names=JSON.parse(bytes.subarray(20,20+jsonLength).toString()).nodes
      .map(node=>node.name).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    assert.ok(names.indexOf(pot)>=0,`${room}: vessel exists`);
    assert.ok(names.indexOf(pot)<names.indexOf(stem),`${room}: stems need a vessel`);
    assert.ok(names.indexOf(stem)<names.indexOf(leaf),`${room}: leaves need stems`);
  }
});

test('completed rooms and kitchen details remain inside the isometric framing',()=>{
  const viewer=read('src/diorama.js');
  assert.match(viewer,/rooms\.map\(root => new THREE\.Box3\(\)\.setFromObject\(root\)\)/);
  assert.doesNotMatch(viewer,/setFromObject\(groups\[[01]\]\[0\]\)/);
  const bytes=readFileSync('public/3d/space-01/win_space_01.glb');
  const jsonLength=bytes.readUInt32LE(12);
  const names=JSON.parse(bytes.subarray(20,20+jsonLength).toString()).nodes.map(node=>node.name||'');
  assert.ok(names.some(name=>name.startsWith('JOINERY_Cooktop 00 inset dark glass')));
  assert.ok(names.filter(name=>name.startsWith('JOINERY_Cooktop 01 inset etched ring')).length>=4);
});

test('compact navigation closes on Escape, outside click and desktop resize',()=>{
  const events={},classes=new Set(['menu-open']);
  let expanded='true',focused=false,resize;
  const menu={setAttribute:(_key,value)=>{expanded=value;},focus:()=>{focused=true;}};
  const document={readyState:'complete',body:{classList:{contains:name=>classes.has(name),remove:name=>classes.delete(name)}},
    querySelector:selector=>selector==='.menu-toggle'?menu:null,addEventListener:(name,fn)=>{events[name]=fn;}};
  const window={matchMedia:()=>({addEventListener:(_name,fn)=>{resize=fn;}})};
  vm.runInNewContext(read('assets/js/site-integration.js'),{window,document});
  events.keydown({key:'Escape'});
  assert.equal(classes.has('menu-open'),false);assert.equal(expanded,'false');assert.equal(focused,true);
  classes.add('menu-open');events.click({target:{closest:()=>null}});
  assert.equal(classes.has('menu-open'),false);
  classes.add('menu-open');resize({matches:true});assert.equal(classes.has('menu-open'),false);
  assert.doesNotMatch(read('assets/js/site-integration.js'),/renovation-compare|compare-range/);
});

test('Portfolio navigation follows the reading section in both directions',()=>{
  let scrollY=0;
  const listeners={};
  const sections=[{id:'portfolio',top:1000,bottom:6000},{id:'contact',top:6000,bottom:8500}]
    .map(section=>({...section,getBoundingClientRect:()=>({top:section.top-scrollY,bottom:section.bottom-scrollY})}));
  const links=sections.filter(section=>section.id==='portfolio').map(section=>({href:`https://win-designer.vercel.app/#${section.id}`,active:false,addEventListener(){},getAttribute(){return null;},classList:{toggle(_name,value){const link=links.find(link=>link.href.endsWith('#'+section.id));link.active=value===undefined?!link.active:Boolean(value);}}}));
  const nav={getBoundingClientRect:()=>({bottom:78}),classList:{add(){}}};
  const document={readyState:'complete',body:{},querySelector:selector=>selector==='.site-nav'?nav:null,querySelectorAll:selector=>selector==='[data-nav-section]'?sections:selector==='.nav-links a'?links:[]};
  const window={WIN_DESIGN_DATA:data,addEventListener:(name,fn)=>{listeners[name]=fn;},requestAnimationFrame:fn=>fn()};
  vm.runInNewContext(read('assets/js/main.js'),{window,document,URL,URLSearchParams,location:{href:'https://win-designer.vercel.app/',pathname:'/'}});
  const active=()=>links.filter(link=>link.active).map(link=>new URL(link.href).hash);
  assert.deepEqual(active(),[]);
  scrollY=1000;listeners.scroll();assert.deepEqual(active(),['#portfolio']);
  scrollY=5000;listeners.scroll();assert.deepEqual(active(),['#portfolio']);
  scrollY=7500;listeners.scroll();assert.deepEqual(active(),[]);
  scrollY=6000;listeners.scroll();assert.deepEqual(active(),[]);
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

test('the portfolio book has four slots per page with unique projects and empty capacity',()=>{
  const pages=createBookPages(data);
  assert.equal(pages.length,4);
  for(const page of pages){
    assert.equal(page.cells.length,4);
    for(const cell of page.cells){
      if(!cell)continue;
      assert.ok(existsSync(cell.image.src));
      assert.ok(data.projects.some(project=>project.slug===cell.slug));
    }
  }
  const occupied=pages.flatMap(page=>page.cells).filter(Boolean);
  assert.equal(occupied.length,6);
  assert.equal(new Set(occupied.map(cell=>cell.slug)).size,6);
  assert.equal(pages.flatMap(page=>page.cells).filter(cell=>!cell).length,10);
  assert.equal(nextBookPosition(-1,false,pages.length),0);
  assert.equal(nextBookPosition(0,false,pages.length),2);
  assert.equal(nextBookPosition(2,false,pages.length),2);
  assert.equal(previousBookPosition(2,false),0);
  assert.equal(previousBookPosition(0,false),0);
  assert.equal(nextBookPosition(0,true,pages.length),2);
  assert.equal(nextBookPosition(2,true,pages.length),2);
  assert.equal(previousBookPosition(2,true),0);
  assert.equal(previousBookPosition(0,true),0);
  assert.doesNotMatch(read('assets/css/portfolio-book.css'),/rotateY/);
  assert.match(read('src/book-curl.js'),/paperRow\(p, row/);
});

test('the short homepage keeps local accessible images and normal page scrolling',()=>{
  for(const section of ['home','portfolio'])assert.ok(html.includes(`id="${section}"`));
  for(const removed of ['about-home','materials','transformations','process','projectSections'])assert.ok(!html.includes(`id="${removed}"`));
  for(const match of html.matchAll(/<img\s[^>]+>/g)){
    const tag=match[0],src=tag.match(/src="([^"]+)"/)[1];
    assert.ok(existsSync(src),src);
    assert.doesNotMatch(src,/127\.0\.0\.1|[A-Z]:[\\/]/);
    assert.match(tag,/alt="[^"]*"/);
    if(!src.includes('logo')&&!tag.includes('id="lightboxImage"')&&!tag.includes('class="diorama-poster"'))assert.match(tag,/loading="lazy"/);
    if(tag.includes('class="diorama-poster"'))assert.match(tag,/fetchpriority="high"/);
  }
  assert.doesNotMatch(read('assets/css/diorama-hero.css'),/position:\s*sticky/);
  assert.doesNotMatch(read('src/diorama.js'),/addEventListener\(['"]scroll|scrollY|scrollProgress/);
  assert.match(read('src/diorama.js'),/IntersectionObserver/);
  assert.match(read('src/diorama.js'),/Promise\.all/);
});

test('mobile book fallback keeps both printed pages and their project navigation',()=>{
  const css=read('assets/css/portfolio-book.css');
  assert.match(css,/\.book-fallback \.book-object\s*\{[^}]*flex-direction:\s*column/);
  assert.match(css,/\.book-fallback \.book-page\s*\{[^}]*display:\s*block/);
  assert.doesNotMatch(css,/\.book-fallback \.book-page--left\s*\{[^}]*display:\s*none/);
  assert.match(read('src/portfolio-book.js'),/function bookCoverMarkup/);
  assert.match(html,/>COVER<\/span>/);
});

test('all content image URLs are served by dev and production preview',async()=>{
  const urls=new Set(['index.html','about.html','project.html?project=stone-kitchen','models/win_interior_demo.glb','3d/space-01/win_space_01.glb','3d/space-02/win_space_02.glb','assets/js/main.js','assets/js/vendor/three.module.min.js','assets/js/studio-sculpture-geometry.js','american-walnut.jpg.jpeg']);
  for(const project of data.projects){urls.add(`project.html?project=${project.slug}`);urls.add(`projects/${project.slug}/`);}
  const walk=value=>{if(!value||typeof value!=='object')return;if(value.src)urls.add(value.src);for(const child of Object.values(value))walk(child);};walk(data);
  for(const match of html.matchAll(/<img\s[^>]*src="([^"]+)"/g))urls.add(match[1]);
  for(const port of [5175,4175])for(const path of urls){const response=await fetch(`http://127.0.0.1:${port}/${path}`,{method:'HEAD'});assert.equal(response.status,200,`${port}/${path}`);}
});
