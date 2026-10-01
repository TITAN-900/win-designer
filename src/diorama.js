import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clamp01, smooth, storyState, headline } from './diorama-timeline.js';

const canvas = document.querySelector('#viewer');
const visual = document.querySelector('.diorama-visual');
const story = document.querySelector('#showcase');
const title = document.querySelector('#intro-title');
const support = document.querySelector('#diorama-support');
const index = document.querySelector('#diorama-index');
const counter = document.querySelector('#diorama-counter');
const progressLine = document.querySelector('.scroll-progress i');
const loading = document.querySelector('#loading');
const errorPanel = document.querySelector('#error');
const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
const smallQuery = window.matchMedia('(max-width: 760px)');
const base = import.meta.env.BASE_URL;
const url = path => `${base}${path}`;
const loaded = [null, null];
const groups = [null, null];
const stageParts = [[], []];
const roomBases = [];
let renderer;
let frame = 0;
let currentProgress = 0;
let lastProgress = -1;
let disposed = false;

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, .1, 100);
scene.add(new THREE.HemisphereLight(0xf6f2e8, 0x74695b, 2.0));
const key = new THREE.DirectionalLight(0xfff8ea, 3.1);
key.position.set(-4, 8, 6);
key.castShadow = true;
key.shadow.mapSize.set(1024, 1024);
key.shadow.camera.left = -11;
key.shadow.camera.right = 11;
key.shadow.camera.top = 11;
key.shadow.camera.bottom = -11;
key.shadow.bias = -.0002;
key.shadow.radius = 3;
scene.add(key);
const fill = new THREE.DirectionalLight(0xe1eaf0, 1.05);
fill.position.set(5, 5, -4);
scene.add(fill);

function setLoadProgress(done, total) {
  const percent = Math.round(done / total * 100);
  document.querySelector('#loading-value').textContent = `${percent}%`;
  document.querySelector('#progress-bar').style.width = `${percent}%`;
}

function roomSetup(gltf, roomIndex) {
  const root = gltf.scene;
  root.name = `SPACE_0${roomIndex + 1}`;
  const roomGroups = root.children.filter(child => /^0[1-8]_/.test(child.name));
  if (roomGroups.length !== 8) throw new Error(`Space 0${roomIndex + 1}: missing construction groups`);
  const mobile = smallQuery.matches;
  roomGroups.forEach((group, groupIndex) => {
    const meshes = [];
    group.traverse(object => {
      if (!object.isMesh) return;
      object.castShadow = !mobile && groupIndex !== 0;
      object.receiveShadow = !mobile;
      meshes.push(object);
    });
    if (groupIndex === 7) return;
    // Shell stays from the opening frame. Finishes and glazing complete it,
    // then independent joinery elements install in architectural order.
    if (groupIndex === 0) {
      const core = /structural|back wall|left .*pier|window .*wall|window head/i;
      const surfaces = meshes.filter(mesh => !core.test(mesh.name));
      surfaces.sort((a, b) => a.name.localeCompare(b.name));
      surfaces.forEach((mesh, item) => stageParts[roomIndex].push({
        mesh, install: .035 + (item / Math.max(1, surfaces.length - 1)) * .12,
        y: mesh.position.y
      }));
      return;
    }
    const phases = {
      1: { structure: [.15, .36], finish: [.35, .51] },
      2: { structure: [.29, .47], finish: [.46, .62] },
      3: { all: [.55, .72] },
      4: { all: [.68, .79] },
      5: { all: [.75, .86] },
      6: { all: [.80, .88] }
    };
    const finishName = /door|front|countertop|stone|screen|upholster|drawer|panel|batten|LED|diffuser|backing|shelf|trim|rail|pull|finger|inset|reveal|glaz/i;
    const batches = groupIndex < 3
      ? { structure: meshes.filter(mesh => !finishName.test(mesh.name)), finish: meshes.filter(mesh => finishName.test(mesh.name)) }
      : { all: meshes };
    for (const [kind, batch] of Object.entries(batches)) {
      batch.sort((a, b) => a.name.localeCompare(b.name));
      const [start, end] = phases[groupIndex][kind];
      batch.forEach((mesh, item) => stageParts[roomIndex].push({
        mesh, install: start + (item / Math.max(1, batch.length - 1)) * (end - start),
        y: mesh.position.y
      }));
    }
  });
  groups[roomIndex] = roomGroups;
  root.visible = roomIndex === 0;
  scene.add(root);
  loaded[roomIndex] = root;
  roomBases[roomIndex] = root.position.clone();
}

function fitCamera() {
  if (!loaded[0] || !loaded[1]) return;
  const rect = visual.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  const target = new THREE.Vector3(0, 1.0, 0);
  camera.position.copy(target).add(new THREE.Vector3(9.7, 8.12, 11.5));
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const bounds = [new THREE.Box3().setFromObject(groups[0][0]), new THREE.Box3().setFromObject(groups[1][0])];
  let halfW = 0, halfH = 0;
  for (const box of bounds) {
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(camera.matrixWorldInverse);
      halfW = Math.max(halfW, Math.abs(point.x));
      halfH = Math.max(halfH, Math.abs(point.y));
    }
  }
  const aspect = rect.width / rect.height;
  const padding = smallQuery.matches ? 1.04 : 1.19;
  const vertical = Math.max(halfH, halfW / aspect) * padding;
  camera.left = -vertical * aspect;
  camera.right = vertical * aspect;
  camera.top = vertical;
  camera.bottom = -vertical;
  camera.near = .1;
  camera.far = 100;
  camera.updateProjectionMatrix();
  const ratio = Math.min(window.devicePixelRatio || 1, smallQuery.matches ? 1.5 : 2);
  renderer.setPixelRatio(ratio);
  renderer.setSize(rect.width, rect.height, false);
  renderer.shadowMap.enabled = !smallQuery.matches;
  key.castShadow = !smallQuery.matches;
  for (const root of loaded) root?.traverse(object => {
    if (!object.isMesh) return;
    object.castShadow = !smallQuery.matches;
    object.receiveShadow = !smallQuery.matches;
  });
  key.shadow.mapSize.set(smallQuery.matches ? 512 : 1024, smallQuery.matches ? 512 : 1024);
  key.shadow.map?.dispose();
  key.shadow.map = null;
}

function setStage(room, local) {
  for (const { mesh, install, y } of stageParts[room]) {
    const enter = clamp01((local - install) / .032);
    mesh.visible = enter > .015;
    // A few centimetres of placement, not an exploding assembly.
    mesh.position.y = y - .085 * (1 - smooth(enter));
  }
}

function setRoomOpacity(root, opacity) {
  root.traverse(object => {
    if (!object.isMesh) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material) continue;
      material.transparent = opacity < .999;
      material.opacity = opacity;
      material.depthWrite = opacity >= .999;
    }
  });
}

function progressFromScroll() {
  const rect = story.getBoundingClientRect();
  return clamp01(-rect.top / Math.max(1, rect.height - window.innerHeight));
}

function update() {
  if (disposed || !renderer || !loaded[0] || !loaded[1]) return;
  currentProgress = progressFromScroll();
  if (Math.abs(currentProgress - lastProgress) < .0001) return;
  lastProgress = currentProgress;
  const state = storyState(currentProgress, reducedQuery.matches);
  const reduced = reducedQuery.matches;
  const firstLocal = reduced ? 1 : state.progress < .5 ? state.local : 1;
  const secondLocal = reduced ? 0 : state.progress < .5 ? 0 : state.local;
  setStage(0, firstLocal);
  setStage(1, secondLocal);
  const inTransition = !reduced && state.progress > .475 && state.progress < .525;
  loaded[0].visible = reduced || state.progress < .525;
  loaded[1].visible = !reduced && state.progress > .475;
  loaded[0].position.x = roomBases[0].x - (inTransition ? state.blend * 1.1 : 0);
  loaded[1].position.x = roomBases[1].x + (inTransition ? (1 - state.blend) * 1.1 : 0);
  setRoomOpacity(loaded[0], inTransition ? 1 - state.blend : 1);
  setRoomOpacity(loaded[1], inTransition ? state.blend : 1);
  const [label, heading, deck] = headline(state.space, state.local);
  if (index.textContent !== label) index.textContent = label;
  if (title.textContent !== heading) title.textContent = heading;
  if (support.textContent !== deck) support.textContent = deck;
  counter.textContent = `${state.space + 1 < 10 ? '0' : ''}${state.space + 1} / 02`;
  progressLine.style.transform = `scaleX(${currentProgress})`;
  canvas.dataset.space = `0${state.space + 1}`;
  canvas.dataset.build = state.local.toFixed(3);
  canvas.dataset.scrollProgress = currentProgress.toFixed(3);
  renderer.render(scene, camera);
  canvas.dataset.drawCalls = String(renderer.info.render.calls);
}

function schedule() {
  if (frame || disposed || !renderer) return;
  frame = requestAnimationFrame(() => { frame = 0; update(); });
}

async function init() {
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.23;
    renderer.shadowMap.enabled = !smallQuery.matches;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0xf5f1e9, 0);
    const loader = new GLTFLoader();
    let count = 0;
    const load = async path => {
      const gltf = await loader.loadAsync(url(path));
      setLoadProgress(++count, 2);
      return gltf;
    };
    // Only the two independent rooms are fetched; neither contains people.
    const first = await load('3d/space-01/win_space_01.glb');
    roomSetup(first, 0);
    const second = await load('3d/space-02/win_space_02.glb');
    roomSetup(second, 1);
    fitCamera();
    update();
    canvas.dataset.loaded = 'true';
    loading.classList.add('is-complete');
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
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

function onResize() { fitCamera(); lastProgress = -1; schedule(); }
function onMotionChange() { lastProgress = -1; schedule(); }
function onContextLost(event) {
  event.preventDefault();
  document.querySelector('#error-detail').textContent = 'WebGL became unavailable. The room preview remains visible.';
  errorPanel.hidden = false;
}
function dispose() {
  disposed = true;
  if (frame) cancelAnimationFrame(frame);
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', onResize);
  reducedQuery.removeEventListener('change', onMotionChange);
  scene.traverse(object => {
    if (!object.isMesh) return;
    object.geometry.dispose();
    (Array.isArray(object.material) ? object.material : [object.material]).forEach(material => material?.dispose());
  });
  renderer?.dispose();
}

// A back-forward-cache return follows pagehide, when WebGL resources were
// released. Reloading restores the poster immediately, then the room assets.
window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});

init();
