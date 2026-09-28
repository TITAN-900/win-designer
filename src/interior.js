import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { loadInteriorLighting } from './baked-lighting.js';

// Independent interior edition of the existing demand-rendered sticky viewer.
const canvas = document.querySelector('#viewer');
const showcase = document.querySelector('#showcase');
const loadingPanel = document.querySelector('#loading');
const loadingValue = document.querySelector('#loading-value');
const progressBar = document.querySelector('#progress-bar');
const errorPanel = document.querySelector('#error');
const errorDetail = document.querySelector('#error-detail');
const phaseLabels = [...document.querySelectorAll('[data-phase]')];
const chapterButtons = [...document.querySelectorAll('[data-chapter]')];
const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const scene = new THREE.Scene();
const renderer = new THREE.WebGLRenderer({canvas, antialias:true, alpha:true, powerPreference:'high-performance'});
renderer.setClearColor(0xe8e3da, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = .84;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const camera = new THREE.PerspectiveCamera(49, 1, .05, 100);
camera.filmGauge = 36;
const cameraTarget = new THREE.Vector3();
const pmrem = new THREE.PMREMGenerator(renderer);
const room = new RoomEnvironment();
const environment = pmrem.fromScene(room, .04);
scene.environment = environment.texture;
scene.environmentIntensity = .15;
room.dispose();pmrem.dispose();
RectAreaLightUniformsLib.init();
scene.add(new THREE.HemisphereLight(0xf5f3ed, 0x716a5d, .075));
const daylight = new THREE.RectAreaLight(0xf3f6fa, 4.0, 4.2, 2.3);
daylight.position.set(-3.35,2.2,.4);daylight.lookAt(.4,1,-.6);scene.add(daylight);
const bounce = new THREE.RectAreaLight(0xfff1de, .55, 3, 2);
bounce.position.set(1.3,2.75,3.25);bounce.lookAt(.3,.5,.9);scene.add(bounce);
const sun = new THREE.DirectionalLight(0xfff9f0, .95);
sun.position.set(-7,4,3);sun.target.position.set(0,.3,-1);sun.castShadow=true;
sun.shadow.mapSize.set(2048,2048);sun.shadow.camera.left=-7;sun.shadow.camera.right=7;sun.shadow.camera.top=7;sun.shadow.camera.bottom=-7;
sun.shadow.camera.near=.1;sun.shadow.camera.far=22;sun.shadow.bias=-.00012;sun.shadow.normalBias=.015;sun.shadow.radius=3;
scene.add(sun,sun.target);
const accentLights=[];
function warmArea(pos,target,width,height,intensity){
  const light=new THREE.RectAreaLight(0xffdfb8,intensity,width,height);
  light.position.fromArray(pos);light.lookAt(...target);light.userData.finalIntensity=intensity;accentLights.push(light);scene.add(light);
}
// Niche and spotlight illumination is already in the Cycles atlases.
// Retain broad realtime emitters for restrained view-dependent highlights.
warmArea([-.22,.29,-2.45],[-.22,0,-2.45],4.2,.035,9);
warmArea([0,3.01,-2.25],[0,2.7,-2.85],6.3,.04,8);
const hallBounce=new THREE.RectAreaLight(0xf5dfc3,1.3,.5,.5);
hallBounce.position.set(3.97,2.8,-5.3);hallBounce.lookAt(3.98,1.3,-6.2);scene.add(hallBounce);

let loadedAsset=null;
let interiorLighting=null;
let sceneReady=false;
let assemblies=[];
let zoomFactor=1;
let scrollProgress=0;
let metricsDirty=true;
let showcaseTop=1;
let showcaseRange=1;
let pendingFrame=false;
const clamp01=v=>THREE.MathUtils.clamp(v,0,1);
const smoothstep=value=>{const t=clamp01(value);return t*t*(3-2*t);};
const phaseProgress=(value,start,end)=>smoothstep((value-start)/(end-start));

function requestRender(){
  if(pendingFrame)return;
  pendingFrame=true;
  requestAnimationFrame(()=>{
    pendingFrame=false;
    const started=performance.now();renderer.render(scene,camera);
    canvas.dataset.renderCpuMs=(performance.now()-started).toFixed(2);
    canvas.dataset.renderFrame=String(renderer.info.render.frame);
    canvas.dataset.camera=camera.position.toArray().map(n=>n.toFixed(4)).join(',');
    canvas.dataset.triangles=String(renderer.info.render.triangles);
    canvas.dataset.drawCalls=String(renderer.info.render.calls);
  });
}

function registerAssemblies(root){
  root.traverse(group=>{
    if(typeof group.userData.build_start!=='number'||group.userData.build_start<0)return;
    const materials=new Set();
    // Share a clone within each assembly, never alter materials in other build stages.
    const clones=new Map();
    group.traverse(child=>{
      if(!child.isMesh)return;
      function clone(original){
        if(!clones.has(original)){
          const m=original.clone();m.userData.finalOpacity=m.opacity;m.userData.finalTransparent=m.transparent;
          m.userData.finalEmission=m.emissiveIntensity;clones.set(original,m);materials.add(m);
        }
        return clones.get(original);
      }
      child.material=Array.isArray(child.material)?child.material.map(clone):clone(child.material);
    });
    assemblies.push({group,materials:[...materials],base:group.position.clone(),offset:new THREE.Vector3(group.userData.entry_x||0,group.userData.entry_y||0,group.userData.entry_z||0)});
  });
}

function applyConstruction(progress){
  for(const entry of assemblies){
    const {group,materials,base,offset}=entry;
    const t=phaseProgress(progress,group.userData.build_start,group.userData.build_end);
    group.visible=t>.001;
    group.position.copy(base).addScaledVector(offset,1-t);
    // No temporal damping, no clock, and no playback mixer. Reversal is exact.
    for(const m of materials){
      const transparent=t<.999||m.userData.finalTransparent;
      if(m.transparent!==transparent){m.transparent=transparent;m.needsUpdate=true;}
      m.opacity=m.userData.finalOpacity*t;
      m.depthWrite=t>.97;
      m.emissiveIntensity=m.userData.finalEmission*(group.name==='LIGHT_LED'?t:1);
    }
  }
  const warmth=phaseProgress(progress,.60,.69);
  accentLights.forEach(light=>light.intensity=light.userData.finalIntensity*warmth);
  interiorLighting?.update(progress);
  canvas.dataset.build=progress.toFixed(4);
  canvas.dataset.visibleGroups=assemblies.filter(a=>a.group.visible).map(a=>a.group.name).join(',');
  canvas.dataset.assemblyState=assemblies.map(a=>`${a.group.name}:${a.group.visible}:${a.group.position.toArray().map(v=>v.toFixed(4)).join(',')}:${a.materials[0]?.opacity.toFixed(4)}`).join(';');
}

function updateCamera(progress,hero){
  const mobile=innerWidth<=760;
  const reduced=reducedMotionQuery.matches;
  const p=reduced?1:progress;
  // Adult eye-level architectural photography. Never pull out to fit the room.
  const enter=phaseProgress(p,0,.22);
  const detail=phaseProgress(p,.43,.66);
  const complete=phaseProgress(p,.73,.97);
  const eye=new THREE.Vector3(3.90,1.55,3.00)
    .lerp(new THREE.Vector3(3.55,1.55,1.50),enter)
    .lerp(new THREE.Vector3(2.50,1.55,.65),detail)
    .lerp(new THREE.Vector3(3.90,1.55,3.00),complete);
  const target=new THREE.Vector3(.70,1.23,-1.72)
    .lerp(new THREE.Vector3(-.10,1.30,-2.10),enter)
    .lerp(new THREE.Vector3(.55,1.30,-2.55),detail)
    .lerp(new THREE.Vector3(.70,1.23,-1.72),complete);
  if(hero>0){
    eye.lerp(new THREE.Vector3(3.90,1.55,3.00),hero);
    target.lerp(new THREE.Vector3(.70,1.23,-1.72),hero);
  }
  if(mobile){target.x-=.1;}
  cameraTarget.copy(target);
  camera.position.copy(eye);
  camera.setFocalLength(30/zoomFactor);
  camera.lookAt(target);
  const w=canvas.parentElement.clientWidth,h=canvas.parentElement.clientHeight;
  camera.setViewOffset(w,h,0,0,w,h);
  canvas.dataset.eyeHeight='1.55';
  canvas.dataset.focalLength=(30/zoomFactor).toFixed(2);
}

function applyScrollState(progress){
  if(!sceneReady)return;
  const inHero=scrollY<showcaseTop;
  const heroRatio=clamp01(scrollY/showcaseTop);
  // Intro is fully furnished. As the intro exits, a reversible reset reveals the shell.
  const build=reducedMotionQuery.matches?1:inHero?1-phaseProgress(heroRatio,.25,.95):progress;
  const hero=reducedMotionQuery.matches?1:inHero?1-smoothstep(heroRatio):0;
  applyConstruction(build);updateCamera(progress,hero);
  const ranges=[[0,.23],[.23,.48],[.48,.74],[.74,1.08]];
  const index=progress<.23?0:progress<.48?1:progress<.74?2:3;
  phaseLabels.forEach((label,i)=>{
    const [start,end]=ranges[i];
    const opacity=(i===0?1:phaseProgress(progress,start,start+.025))*(1-phaseProgress(progress,end-.025,end));
    label.style.opacity=opacity;label.style.transform=`translateY(${(1-opacity)*7}px)`;
    label.setAttribute('aria-hidden',String(opacity<.5));
  });
  chapterButtons.forEach((button,i)=>button.setAttribute('aria-current',String(i===index)));
  document.querySelector('.scroll-progress i').style.transform=`scaleX(${progress})`;
  document.documentElement.dataset.scrollProgress=progress.toFixed(4);
  document.documentElement.dataset.scrollPhase=inHero?'hero':phaseLabels[index].dataset.phase;
  requestRender();
}

function updateMetrics(){
  showcaseTop=scrollY+showcase.getBoundingClientRect().top;
  showcaseRange=Math.max(1,showcase.offsetHeight-innerHeight);metricsDirty=false;
}
function updateScrollProgress(){
  if(metricsDirty)updateMetrics();
  scrollProgress=clamp01((scrollY-showcaseTop)/showcaseRange);
  applyScrollState(scrollProgress);
}
function adjustZoom(delta){zoomFactor=THREE.MathUtils.clamp(zoomFactor+delta,.9,1.0);applyScrollState(scrollProgress);}
document.querySelector('#zoom-in').addEventListener('click',()=>adjustZoom(-.04));
document.querySelector('#zoom-out').addEventListener('click',()=>adjustZoom(.04));
chapterButtons.forEach(button=>button.addEventListener('click',()=>{
  if(metricsDirty)updateMetrics();
  window.scrollTo({top:showcaseTop+Number(button.dataset.chapter)*showcaseRange,behavior:'instant'});
}));
window.addEventListener('scroll',updateScrollProgress,{passive:true});
reducedMotionQuery.addEventListener('change',()=>applyScrollState(scrollProgress));

// Existing loading/progress/error workflow is retained; only the asset URL changes.
const manager=new THREE.LoadingManager();
let shownLoading=0;
function setLoading(percent){shownLoading=Math.max(shownLoading,Math.round(percent));loadingValue.textContent=`${shownLoading}%`;progressBar.style.width=`${shownLoading}%`;}
manager.onProgress=(_url,loaded,total)=>setLoading(loadedAsset?Math.min(99,70+(total?loaded/total:0)*29):Math.min(70,(total?loaded/total:0)*70));
new GLTFLoader(manager).load(import.meta.env.BASE_URL+'models/win_interior_demo.glb',async gltf=>{
  try{
  loadedAsset=gltf.scene;
  loadedAsset.traverse(child=>{
    if(!child.isMesh)return;
    const materials=Array.isArray(child.material)?child.material:[child.material];
    // Thin floor tiles already have path-traced edge/contact shadows. Casting
    // them into a lower-resolution realtime map creates stippled grout seams.
    child.castShadow=!/Glazing|LED|Diffuser|DownlightLens|FloorFinish|ContinuousFloor/.test(child.name)&&materials.every(m=>m.opacity>.5);
    child.receiveShadow=true;
    for(const m of materials){
      // Preserve the authored wood UV directions, roughness and normal maps.
      for(const key of ['map','normalMap','roughnessMap'])if(m[key])m[key].anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    }
  });
  registerAssemblies(loadedAsset);
  interiorLighting=await loadInteriorLighting(manager,renderer,scene);
  interiorLighting.apply(loadedAsset);
  scene.add(loadedAsset);
  environment.dispose();
  // Compile both installation fades and solid materials while the loading
  // indicator is still present, not on the user's first construction scroll.
  applyConstruction(1);updateCamera(0,1);
  for(const entry of assemblies)for(const m of entry.materials){m.transparent=true;m.needsUpdate=true;}
  await renderer.compileAsync(scene,camera);
  applyConstruction(1);
  await renderer.compileAsync(scene,camera);
  sceneReady=true;
  canvas.dataset.gi='cycles-baked-dual-state';
  canvas.dataset.loaded='true';canvas.dataset.assemblyCount=String(assemblies.length);
  updateScrollProgress();setLoading(100);requestAnimationFrame(()=>loadingPanel.classList.add('is-complete'));
  }catch(error){showLoadError(error);}
},event=>{if(event.total)setLoading(Math.min(70,Math.round(event.loaded/event.total*70)));},error=>{
  showLoadError(error);
});
function showLoadError(error){
  console.error('Interior GLB loading failed:',error);
  loadingPanel.classList.add('is-complete');errorDetail.textContent=error?.message||String(error);errorPanel.hidden=false;
}

function resize(){
  const width=Math.max(1,canvas.parentElement.clientWidth),height=Math.max(1,canvas.parentElement.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio,width<=760?1.2:1.65));
  // Mobile keeps the same baked soft/contact shadows without an extra shadow pass.
  sun.castShadow=width>760;
  const shadowSize=width<=760?1024:2048;
  if(sun.shadow.mapSize.x!==shadowSize){sun.shadow.mapSize.set(shadowSize,shadowSize);sun.shadow.map?.dispose();sun.shadow.map=null;}
  camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height,false);
  metricsDirty=true;updateScrollProgress();requestRender();
}
window.addEventListener('resize',resize,{passive:true});resize();
