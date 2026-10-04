import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp01, smooth, loopState, headline, isShellCore } from './diorama-timeline.js';

const canvas = document.querySelector('#viewer');
const visual = document.querySelector('.diorama-visual');
const hero = document.querySelector('#showcase');
const title = document.querySelector('#intro-title');
const support = document.querySelector('#diorama-support');
const index = document.querySelector('#diorama-index');
const counter = document.querySelector('#diorama-counter');
const loading = document.querySelector('#loading');
const errorPanel = document.querySelector('#error');
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const smallQuery = window.matchMedia('(max-width: 760px)');
const url = path => `${import.meta.env.BASE_URL}${path}`;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 100);
const rooms = [null, null];
const records = [[], []];
const bases = [null, null];
let renderer;
let observer;
let frame = 0;
let lastFrameTime = null;
let elapsed = 0;
let inView = false;
let disposed = false;

scene.add(new THREE.HemisphereLight(0xf5f2eb, 0x786f64, 1.25));
const key = new THREE.DirectionalLight(0xfff9ef, 2.35);
key.position.set(-4, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -8;
key.shadow.camera.right = 8;
key.shadow.camera.top = 8;
key.shadow.camera.bottom = -8;
key.shadow.bias = -.00015;
key.shadow.normalBias = .025;
key.shadow.radius = 4;
key.shadow.intensity = .68;
scene.add(key);
const fill = new THREE.DirectionalLight(0xe8edf1, .65);
fill.position.set(5, 5, -4);
scene.add(fill);

function setLoadProgress(done) {
  const percent = Math.round(done * 50);
  document.querySelector('#loading-value').textContent = `${percent}%`;
  document.querySelector('#progress-bar').style.width = `${percent}%`;
}

function fadeVariant(material) {
  const copy = material.clone();
  copy.transparent = true;
  copy.depthWrite = false;
  copy.opacity = material.opacity;
  return copy;
}

function roomSetup(gltf, roomIndex) {
  const root = gltf.scene;
  root.name = `SPACE_0${roomIndex + 1}`;
  const groups = root.children.filter(child => /^0[1-8]_/.test(child.name))
    .sort((a, b) => a.name.localeCompare(b.name));
  if (groups.length !== 8) throw new Error(`Space 0${roomIndex + 1}: missing construction groups`);
  const phases = {
    1: { structure: [.16, .37], finish: [.31, .50] },
    2: { structure: [.32, .50], finish: [.46, .64] },
    3: { all: [.55, .74] },
    4: { all: [.70, .83] },
    5: { all: [.80, .89] },
    6: { all: [.86, .92] }
  };
  const finishName = /door|front|countertop|stone|screen|upholster|drawer|panel|batten|LED|diffuser|backing|shelf|trim|rail|pull|finger|inset|reveal|glaz/i;
  const recordByMesh = new Map();
  groups.forEach((group, groupIndex) => {
    const meshes = [];
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      mesh.castShadow = groupIndex > 0 && groupIndex < 7;
      mesh.receiveShadow = groupIndex < 7;
      const original = mesh.material;
      const variants = (Array.isArray(original) ? original : [original]).map(fadeVariant);
      const record = {
        mesh, original, fade: Array.isArray(original) ? variants : variants[0],
        baseOpacity: (Array.isArray(original) ? original : [original]).map(material => material.opacity),
        y: mesh.position.y, scale: mesh.scale.clone(), install: null
      };
      records[roomIndex].push(record);
      recordByMesh.set(mesh, record);
      meshes.push(mesh);
    });
    if (groupIndex === 7) return;
    if (groupIndex === 0) {
      const surfaces = meshes.filter(mesh => !isShellCore(mesh.name))
        .sort((a, b) => a.name.localeCompare(b.name));
      surfaces.forEach((mesh, item) => {
        recordByMesh.get(mesh).install = .035 + item / Math.max(1, surfaces.length - 1) * .11;
      });
      return;
    }
    const batches = groupIndex < 3
      ? { structure: meshes.filter(mesh => !finishName.test(mesh.name)),
          finish: meshes.filter(mesh => finishName.test(mesh.name)) }
      : { all: meshes };
    for (const [kind, batch] of Object.entries(batches)) {
      const bedOrder = name => {
        if (/Bed recessed support/i.test(name)) return 0;
        if (/Bed low solid oak plinth/i.test(name)) return 1;
        if (/Bed inset black shadow reveal/i.test(name)) return 2;
        if (/Bed upholstered mattress/i.test(name)) return 3;
        return 4;
      };
      batch.sort((a, b) => roomIndex === 1 && groupIndex === 3
        ? bedOrder(a.name) - bedOrder(b.name) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name));
      const [start, end] = phases[groupIndex][kind];
      batch.forEach((mesh, item) => {
        recordByMesh.get(mesh).install = start + item / Math.max(1, batch.length - 1) * (end - start);
      });
    }
  });
  root.visible = false;
  scene.add(root);
  rooms[roomIndex] = root;
  bases[roomIndex] = root.position.clone();
}

function fitCamera() {
  if (!rooms[0] || !rooms[1] || !renderer) return;
  const rect = visual.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const target = new THREE.Vector3(0, 1, 0);
  camera.position.copy(target).add(new THREE.Vector3(9.7, 8.12, 11.5));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const bounds = rooms.map(root => new THREE.Box3().setFromObject(root));
  let halfW = 0, halfH = 0;
  for (const box of bounds) {
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
          halfW = Math.max(halfW, Math.abs(point.x));
          halfH = Math.max(halfH, Math.abs(point.y));
        }
  }
  const aspect = rect.width / rect.height;
  const padding = smallQuery.matches ? 1.04 : 1.42;
  const vertical = Math.max(halfH, halfW / aspect) * padding;
  camera.left = -vertical * aspect;
  camera.right = vertical * aspect;
  camera.top = vertical;
  camera.bottom = -vertical;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, smallQuery.matches ? 1.35 : 2));
  renderer.setSize(rect.width, rect.height, false);
  key.shadow.mapSize.set(smallQuery.matches ? 512 : 1024, smallQuery.matches ? 512 : 1024);
  key.shadow.map?.dispose();
  key.shadow.map = null;
}

function setRoom(roomIndex, build, opacity, offset) {
  const root = rooms[roomIndex];
  root.visible = opacity > .002;
  root.position.x = bases[roomIndex].x + offset;
  if (!root.visible) return;
  for (const record of records[roomIndex]) {
    const { mesh, install } = record;
    const progress = install === null ? 1 : smooth(clamp01((build - install) / .075));
    const alpha = progress * opacity;
    mesh.visible = alpha > .005;
    if (!mesh.visible) continue;
    mesh.position.y = record.y + (install === null ? 0 : .035 * (1 - progress));
    mesh.scale.copy(record.scale).multiplyScalar(install === null ? 1 : .982 + .018 * progress);
    if (alpha >= .998) {
      mesh.material = record.original;
    } else {
      mesh.material = record.fade;
      const faded = Array.isArray(record.fade) ? record.fade : [record.fade];
      faded.forEach((material, index) => { material.opacity = record.baseOpacity[index] * alpha; });
    }
  }
}

function draw(state = loopState(elapsed, reducedQuery.matches)) {
  if (!renderer || disposed) return;
  const transition = state.phase === 'transition';
  const firstAlpha = transition ? state.from === 0 ? 1 - state.blend : state.blend : state.space === 0 ? 1 : 0;
  const secondAlpha = transition ? state.from === 1 ? 1 - state.blend : state.blend : state.space === 1 ? 1 : 0;
  // Both resident GLBs share one canvas. They overlap briefly, with a small
  // counter-move and eased transparency; neither scene nor camera is reset.
  const shift = transition ? .30 : 0;
  setRoom(0, state.firstLocal, firstAlpha, transition ? state.from === 0 ? -shift * state.blend : shift * (1 - state.blend) : 0);
  setRoom(1, state.secondLocal, secondAlpha, transition ? state.from === 1 ? -shift * state.blend : shift * (1 - state.blend) : 0);
  const local = state.space === 0 ? state.firstLocal : state.secondLocal;
  const [label, heading, deck] = headline(state.space, local);
  if (index.textContent !== label) index.textContent = label;
  if (title.textContent !== heading) title.textContent = heading;
  if (support.textContent !== deck) support.textContent = deck;
  counter.textContent = `0${state.space + 1} / 02`;
  // The short copy changes only while momentarily dimmed at the midpoint.
  hero.style.setProperty('--copy-opacity', transition ? Math.max(.08, Math.abs(state.blend - .5) * 2) : 1);
  renderer.render(scene, camera);
  canvas.dataset.space = `0${state.space + 1}`;
  canvas.dataset.build = local.toFixed(3);
  canvas.dataset.phase = state.phase;
  canvas.dataset.blend = state.blend.toFixed(3);
  canvas.dataset.loop = String(state.cycle);
  canvas.dataset.elapsed = String(Math.round(elapsed));
  canvas.dataset.drawCalls = String(renderer.info.render.calls);
}

function shouldPlay() { return !disposed && inView && !document.hidden && !reducedQuery.matches && Boolean(renderer); }
function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  lastFrameTime = null;
  canvas.dataset.active = 'false';
}
function tick(now) {
  frame = 0;
  if (!shouldPlay()) return stop();
  if (lastFrameTime !== null) elapsed += Math.min(64, now - lastFrameTime);
  lastFrameTime = now;
  draw();
  frame = requestAnimationFrame(tick);
}
function syncPlayback() {
  if (!renderer || disposed) return;
  if (shouldPlay()) {
    if (!frame) {
      lastFrameTime = null;
      canvas.dataset.active = 'true';
      frame = requestAnimationFrame(tick);
    }
  } else {
    stop();
    if (reducedQuery.matches) draw(loopState(0, true));
  }
}

function warmMaterials() {
  // Compile/upload both spaces before the timeline starts. No intermediate
  // room is ever painted to the visible canvas during this warm-up.
  const target = new THREE.WebGLRenderTarget(32, 32);
  for (const root of rooms) root.visible = true;
  for (const room of records) for (const record of room) {
    record.mesh.visible = true;
    record.mesh.material = record.fade;
    const faded = Array.isArray(record.fade) ? record.fade : [record.fade];
    faded.forEach((material, index) => { material.opacity = record.baseOpacity[index] * .5; });
  }
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  for (const room of records) for (const record of room) record.mesh.material = record.original;
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);
  target.dispose();
}

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf5f1e9, 0);
    const loader = new GLTFLoader();
    let count = 0;
    const load = async path => {
      const gltf = await loader.loadAsync(url(path));
      setLoadProgress(++count);
      return gltf;
    };
    // Parallel first-load only. Both rooms remain in memory for every loop.
    const [first, second] = await Promise.all([
      load('3d/space-01/win_space_01.glb'),
      load('3d/space-02/win_space_02.glb')
    ]);
    if (disposed) return;
    roomSetup(first, 0);
    roomSetup(second, 1);
    fitCamera();
    warmMaterials();
    draw(loopState(0, reducedQuery.matches));
    canvas.dataset.loaded = 'true';
    loading.classList.add('is-complete');
    observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio > .06;
      syncPlayback();
    }, { threshold: [0, .06, .15], rootMargin: '80px 0px' });
    observer.observe(hero);
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', syncPlayback);
    reducedQuery.addEventListener('change', onMotionChange);
    window.addEventListener('pagehide', dispose, { once: true });
    canvas.addEventListener('webglcontextlost', onContextLost, { once: true });
  } catch (error) {
    console.error('The isometric interior could not load:', error);
    document.querySelector('#error-detail').textContent = error.message || String(error);
    errorPanel.hidden = false;
    loading.classList.add('is-complete');
  }
}

function onResize() { fitCamera(); draw(loopState(elapsed, reducedQuery.matches)); }
function onMotionChange() { syncPlayback(); if (!reducedQuery.matches) draw(); }
function onContextLost(event) {
  event.preventDefault();
  stop();
  document.querySelector('#error-detail').textContent = 'WebGL became unavailable. The room preview remains visible.';
  errorPanel.hidden = false;
}
function dispose() {
  disposed = true;
  stop();
  observer?.disconnect();
  window.removeEventListener('resize', onResize);
  document.removeEventListener('visibilitychange', syncPlayback);
  reducedQuery.removeEventListener('change', onMotionChange);
  for (const room of records) for (const record of room) {
    record.mesh.geometry.dispose();
    for (const material of [...(Array.isArray(record.original) ? record.original : [record.original]),
      ...(Array.isArray(record.fade) ? record.fade : [record.fade])]) material?.dispose();
  }
  renderer?.dispose();
}

window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});
init();
