import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp01, smooth, loopState, headline, isShellCore } from './diorama-timeline.js';
import { RoomCrossfade } from './room-crossfade.js';
import { RoomDaylight, heroQualityProfile, setRoomTextureQuality, interiorEnvelope, captureRoomEmission, setRoomEmission } from './room-daylight.js';
import { activateSceneFallback } from './scene-fallback.js';
import { HeroTypeReveal } from './hero-type-reveal.js';

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
const typeReveal = new HeroTypeReveal(title, { reducedMotion: () => reducedQuery.matches });
const smallQuery = window.matchMedia('(max-width: 760px)');
const url = path => `${import.meta.env.BASE_URL}${path}`;
const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 100);
const rooms = [null, null];
const records = [[], []];
const emitters = [[], []];
const bases = [null, null];
const pendingRooms = new Set();
let renderer;
let crossfade;
let daylight;
let observer;
let frame = 0;
let lastFrameTime = null;
let meanFrameInterval = 0;
let elapsed = 0;
let inView = false;
let heldSpace = -1;
let disposed = false;
let failed = false;

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
      // The actual window frames, piers and head must occlude exterior sun.
      // Glass and the distant backdrop transmit light rather than blocking it.
      mesh.castShadow = groupIndex < 7 && !/glazing/i.test(mesh.name);
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
        name = name.replaceAll('_', ' ');
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
  emitters[roomIndex] = captureRoomEmission(records[roomIndex].flatMap(record =>
    [...(Array.isArray(record.original) ? record.original : [record.original]),
      ...(Array.isArray(record.fade) ? record.fade : [record.fade])]));
  root.visible = false;
  scene.add(root);
  rooms[roomIndex] = root;
  bases[roomIndex] = root.position.clone();
  pendingRooms.delete(root);
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
  const quality = heroQualityProfile(rect.width, rect.height, window.devicePixelRatio || 1,
    smallQuery.matches, renderer.capabilities.getMaxAnisotropy());
  renderer.setPixelRatio(quality.pixelRatio);
  // Only the tiny, slightly frosted glazing uses this secondary scene buffer.
  // Keep the opaque room sharp while avoiding a second full-resolution pass.
  renderer.transmissionResolutionScale = quality.transmissionScale;
  renderer.setSize(rect.width, rect.height, false);
  rooms.forEach(root => setRoomTextureQuality(root, quality.anisotropy));
  crossfade?.resize();
  daylight?.resize(smallQuery.matches);
  canvas.dataset.pixelRatio = quality.pixelRatio.toFixed(2);
  canvas.dataset.renderSize = `${canvas.width}x${canvas.height}`;
  canvas.dataset.anisotropy = String(quality.anisotropy);
  canvas.dataset.shadowQuality = `${quality.contactShadow}/${quality.sunShadow}`;
  canvas.dataset.transmissionScale = String(quality.transmissionScale);
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

function draw(state = loopState(elapsed, reducedQuery.matches), force = false) {
  if (!renderer || disposed || failed) return;
  canvas.dataset.elapsed = String(Math.round(elapsed));
  // A completed room is perfectly static for the hold. Keep its full-quality
  // composited canvas instead of repeating the opaque/transmission/shadow
  // passes; the timeline clock continues unchanged into the next transition.
  if (!force && state.phase === 'hold' && heldSpace === state.space) {
    canvas.dataset.rendering = 'held';
    return;
  }
  heldSpace = state.phase === 'hold' ? state.space : -1;
  canvas.dataset.rendering = 'live';
  setRoomEmission(emitters[0], state.firstLight);
  setRoomEmission(emitters[1], state.secondLight);
  const transition = state.phase === 'transition';
  if (transition) {
    crossfade.render(state.from, state.blend, (roomIndex, target) => {
      setRoom(0, state.firstLocal, roomIndex === 0 ? 1 : 0, 0);
      setRoom(1, state.secondLocal, roomIndex === 1 ? 1 : 0, 0);
      daylight.apply(roomIndex, roomIndex === 0 ? state.firstLight : state.secondLight,
        roomIndex === 0 ? state.firstLocal : state.secondLocal);
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    });
  } else {
    setRoom(0, state.firstLocal, state.space === 0 ? 1 : 0, 0);
    setRoom(1, state.secondLocal, state.space === 1 ? 1 : 0, 0);
    daylight.apply(state.space, state.space === 0 ? state.firstLight : state.secondLight,
      state.space === 0 ? state.firstLocal : state.secondLocal);
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
  }
  const local = state.space === 0 ? state.firstLocal : state.secondLocal;
  const [label, heading, deck] = headline(state.space, local);
  if (index.textContent !== label) index.textContent = label;
  typeReveal.show(heading);
  if (support.textContent !== deck) support.textContent = deck;
  counter.textContent = `0${state.space + 1} / 02`;
  // A short masked typographic sweep accompanies each architectural state.
  // Keep the copy present through room crossfades instead of dimming it away.
  canvas.dataset.space = `0${state.space + 1}`;
  canvas.dataset.build = local.toFixed(3);
  canvas.dataset.daylight = (state.space === 0 ? state.firstLight : state.secondLight).toFixed(3);
  canvas.dataset.interiorLight = interiorEnvelope(state.space === 0 ? state.firstLight : state.secondLight).toFixed(3);
  canvas.dataset.phase = state.phase;
  canvas.dataset.blend = state.blend.toFixed(3);
  canvas.dataset.loop = String(state.cycle);
  canvas.dataset.drawCalls = String(renderer.info.render.calls);
  canvas.dataset.textures = String(renderer.info.memory.textures);
  canvas.dataset.geometries = String(renderer.info.memory.geometries);
}

function shouldPlay() { return !disposed && !failed && inView && !document.hidden && !reducedQuery.matches && Boolean(renderer); }
function stop() {
  if (frame) cancelAnimationFrame(frame);
  frame = 0;
  lastFrameTime = null;
  heldSpace = -1;
  canvas.dataset.active = 'false';
}
function tick(now) {
  frame = 0;
  if (!shouldPlay()) return stop();
  if (lastFrameTime !== null) {
    const interval = now - lastFrameTime;
    elapsed += Math.min(64, interval);
    meanFrameInterval = meanFrameInterval ? .9 * meanFrameInterval + .1 * interval : interval;
    canvas.dataset.frameInterval = meanFrameInterval.toFixed(2);
  }
  lastFrameTime = now;
  draw();
  frame = requestAnimationFrame(tick);
}
function syncPlayback() {
  if (!renderer || disposed || failed) return;
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

async function warmMaterials() {
  // Compile/upload both spaces before the timeline starts. No intermediate
  // room is ever painted to the visible canvas during this warm-up.
  const target = new THREE.WebGLRenderTarget(32, 32);
  try {
  for (const roomIndex of [0, 1]) {
    setRoom(0, 1, roomIndex === 0 ? 1 : 0, 0);
    setRoom(1, 1, roomIndex === 1 ? 1 : 0, 0);
    daylight.apply(roomIndex, 1, 1, true);
    for (const faded of [true, false]) {
      for (const record of records[roomIndex]) {
        record.mesh.material = faded ? record.fade : record.original;
        const materials = Array.isArray(record.fade) ? record.fade : [record.fade];
        materials.forEach((material, index) => { material.opacity = record.baseOpacity[index] * .5; });
      }
      // Precompile the screen's sRGB shaders as well as the targets' linear
      // variants. Upload textures and allocate both shadow maps offscreen.
      renderer.setRenderTarget(null);
      await renderer.compileAsync(scene, camera);
      if (disposed || failed) return;
      renderer.setRenderTarget(target);
      renderer.render(scene, camera);
    }
  }
  crossfade.warm((roomIndex, renderTarget) => {
    setRoom(0, roomIndex === 0 ? 1 : 0, roomIndex === 0 ? 1 : 0, 0);
    setRoom(1, 0, roomIndex === 1 ? 1 : 0, 0);
    daylight.apply(roomIndex, roomIndex === 0 ? 1 : 0, roomIndex === 0 ? 1 : 0, true);
    renderer.setRenderTarget(renderTarget);
    renderer.render(scene, camera);
  }, target);
  } finally {
    if (!disposed && !failed) renderer.setRenderTarget(null);
    target.dispose();
  }
}

async function init() {
  // Navigation and context failure can occur while GLBs/shaders are pending.
  window.addEventListener('pagehide', dispose, { once: true });
  canvas.addEventListener('webglcontextlost', onContextLost, { once: true });
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
      if (disposed || failed) {
        disposePendingRoom(gltf.scene);
        return null;
      }
      pendingRooms.add(gltf.scene);
      setLoadProgress(++count);
      return gltf;
    };
    // Parallel first-load only. Both rooms remain in memory for every loop.
    const [first, second] = await Promise.all([
      load('3d/space-01/win_space_01.glb'),
      load('3d/space-02/win_space_02.glb')
    ]);
    if (disposed || failed) return;
    roomSetup(first, 0);
    roomSetup(second, 1);
    daylight = new RoomDaylight(renderer, scene, rooms, smallQuery.matches);
    crossfade = new RoomCrossfade(renderer);
    fitCamera();
    await warmMaterials();
    if (disposed || failed) return;
    draw(loopState(0, reducedQuery.matches));
    canvas.dataset.loaded = 'true';
    loading.classList.add('is-complete');
    observer = new IntersectionObserver(entries => {
      inView = entries[0].isIntersecting && entries[0].intersectionRatio > .15;
      syncPlayback();
    }, { threshold: [0, .15, .5] });
    observer.observe(visual);
    window.addEventListener('resize', onResize, { passive: true });
    document.addEventListener('visibilitychange', syncPlayback);
    reducedQuery.addEventListener('change', onMotionChange);
  } catch (error) {
    if (disposed || failed) return;
    console.error('The isometric interior could not load:', error);
    failed = true;
    stop();
    pendingRooms.forEach(disposePendingRoom);
    pendingRooms.clear();
    activateSceneFallback(document, error);
  }
}

function onResize() { if (disposed || failed) return; fitCamera(); draw(loopState(elapsed, reducedQuery.matches), true); }
function onMotionChange() { syncPlayback(); if (!reducedQuery.matches) draw(); }
function onContextLost(event) {
  event.preventDefault();
  if (disposed || failed) return;
  failed = true;
  stop();
  pendingRooms.forEach(disposePendingRoom);
  pendingRooms.clear();
  activateSceneFallback(document, new Error('WebGL became unavailable. The room preview remains visible.'));
}
function disposePendingRoom(root) {
  const textures = new Set(), materials = new Set(), geometries = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
}
function dispose() {
  if (disposed) return;
  disposed = true;
  stop();
  typeReveal.dispose();
  observer?.disconnect();
  window.removeEventListener('resize', onResize);
  document.removeEventListener('visibilitychange', syncPlayback);
  reducedQuery.removeEventListener('change', onMotionChange);
  canvas.removeEventListener('webglcontextlost', onContextLost);
  pendingRooms.forEach(disposePendingRoom);
  pendingRooms.clear();
  const textures = new Set(), materials = new Set(), geometries = new Set();
  for (const room of records) for (const record of room) {
    geometries.add(record.mesh.geometry);
    for (const material of [...(Array.isArray(record.original) ? record.original : [record.original]),
      ...(Array.isArray(record.fade) ? record.fade : [record.fade])]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  }
  textures.forEach(texture => texture.dispose());
  materials.forEach(material => material.dispose());
  geometries.forEach(geometry => geometry.dispose());
  crossfade?.dispose();
  daylight?.dispose();
  renderer?.dispose();
}

window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});
init();
