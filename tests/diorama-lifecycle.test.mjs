import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { loopState, clamp01, smooth, headline, isShellCore } from '../src/diorama-timeline.js';
import { activateSceneFallback } from '../src/scene-fallback.js';
import { interiorEnvelope, setRoomEmission } from '../src/room-daylight.js';

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(name, callback) { listeners.set(name, callback); },
    removeEventListener(name, callback) { if (listeners.get(name) === callback) listeners.delete(name); },
    dispatch(name, event = {}) { listeners.get(name)?.(event); }
  };
}

function harness() {
  const classes = new Set(), calls = { frames: 0, renders: 0, disposals: 0, scratchDisposals: 0 };
  const loads = [], compilation = deferred();
  const node = () => ({ ...eventTarget(), dataset: {}, style: { setProperty() {} }, textContent: '',
    attributes: {}, setAttribute(name, value) { this.attributes[name] = value; },
    classList: { add(value) { classes.add(value); } } });
  const nodes = new Map(['#viewer', '.diorama-visual', '#showcase', '#intro-title', '#diorama-support',
    '#diorama-index', '#diorama-counter', '#loading', '#error', '#error-detail', '#loading-value', '#progress-bar']
    .map(selector => [selector, node()]));
  nodes.get('#error').hidden = true;
  const document = { ...eventTarget(), hidden: false, body: { classList: { add(value) { classes.add(value); } } },
    querySelector(selector) { return nodes.get(selector); } };
  const window = { ...eventTarget(), matchMedia() { return { ...eventTarget(), matches: false }; } };
  class Renderer {
    constructor() { this.shadowMap = {}; this.info = { render: { calls: 0 }, memory: {} }; }
    setClearColor() {} setRenderTarget() {}
    compileAsync() { return compilation.promise; }
    render() { calls.renders++; }
    dispose() { calls.disposals++; }
  }
  class Target {
    dispose() { calls.scratchDisposals++; }
  }
  const source = readFileSync('src/diorama.js', 'utf8')
    .replace(/^import .*;\r?$/gm, '')
    .replace('import.meta.env.BASE_URL', "''")
    .replace(/\ninit\(\);\s*$/, '\n');
  const context = {
    THREE: { ...THREE, WebGLRenderer: Renderer, WebGLRenderTarget: Target },
    GLTFLoader: class { loadAsync() { const load = deferred(); loads.push(load); return load.promise; } },
    document, window, activateSceneFallback, loopState, clamp01, smooth, headline, isShellCore,
    interiorEnvelope, setRoomEmission,
    console: { error() {} },
    requestAnimationFrame() { return ++calls.frames; }, cancelAnimationFrame() {},
  };
  vm.runInNewContext(`${source}
    globalThis.controller = {
      init, shouldPlay, syncPlayback, onContextLost, onResize, onMotionChange, dispose, draw,
      state: () => ({ disposed, failed, pending: pendingRooms.size, active: canvas.dataset.active }),
      ready() { renderer = new THREE.WebGLRenderer(); inView = true; canvas.dataset.loaded = 'true'; },
      renderable() {
        renderer = new THREE.WebGLRenderer(); setRoom = () => {};
        daylight = { apply() {}, dispose() {} };
        crossfade = { render(from, blend, capture) { capture(from, null); }, dispose() {} };
      },
      warm() {
        renderer = new THREE.WebGLRenderer(); setRoom = () => {};
        daylight = { apply() {}, dispose() {} };
        crossfade = { warm() {}, dispose() {} };
        return warmMaterials();
      }
    };`, context);
  return { controller: context.controller, classes, calls, loads, compilation, nodes, document, window };
}

function disposableRoom() {
  const counts = { geometry: 0, material: 0, texture: 0 };
  const mesh = { isMesh: true, geometry: { dispose() { counts.geometry++; } },
    material: { map: { isTexture: true, dispose() { counts.texture++; } }, dispose() { counts.material++; } } };
  return { gltf: { scene: { traverse(callback) { callback(mesh); } } }, counts };
}

test('context loss after readiness activates the poster and cannot restart the render loop', () => {
  const h = harness();
  h.controller.ready();
  h.controller.syncPlayback();
  assert.equal(h.calls.frames, 1);
  let prevented = false;
  h.controller.onContextLost({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(h.controller.state().failed, true);
  assert.equal(h.controller.shouldPlay(), false);
  assert.equal(h.controller.state().active, 'false');
  assert.ok(h.classes.has('scene-fallback'));
  assert.equal(h.nodes.get('#viewer').attributes['aria-hidden'], 'true');
  assert.equal(h.nodes.get('#error').hidden, false);
  h.document.hidden = true; h.controller.syncPlayback();
  h.document.hidden = false; h.controller.syncPlayback();
  h.controller.onMotionChange(); h.controller.onResize();
  assert.equal(h.calls.frames, 1);
  assert.equal(h.calls.renders, 0);
});

test('startup installs cleanup before GLB loading and disposes rooms arriving after pagehide', async () => {
  const h = harness();
  const startup = h.controller.init();
  assert.equal(h.loads.length, 2);
  assert.ok(h.window.listeners.has('pagehide'));
  assert.ok(h.nodes.get('#viewer').listeners.has('webglcontextlost'));
  h.window.dispatch('pagehide');
  assert.equal(h.controller.state().disposed, true);
  const rooms = [disposableRoom(), disposableRoom()];
  h.loads.forEach((load, i) => load.resolve(rooms[i].gltf));
  await startup;
  for (const room of rooms) assert.deepEqual(room.counts, { geometry: 1, material: 1, texture: 1 });
  assert.equal(h.controller.state().pending, 0);
  assert.equal(h.nodes.get('#viewer').dataset.loaded, undefined);
  assert.equal(h.calls.disposals, 1);
  assert.equal(h.calls.renders, 0);
});

test('startup failure uses the poster directly and cleans up a second GLB arriving later', async () => {
  const h = harness();
  const startup = h.controller.init();
  h.loads[0].reject(new Error('Room download failed'));
  await startup;
  assert.equal(h.controller.state().failed, true);
  assert.ok(h.classes.has('scene-fallback'));
  assert.equal(h.nodes.get('#error-detail').textContent, 'Room download failed');
  const late = disposableRoom();
  h.loads[1].resolve(late.gltf);
  await h.loads[1].promise;
  await Promise.resolve();
  assert.deepEqual(late.counts, { geometry: 1, material: 1, texture: 1 });
  h.controller.syncPlayback();
  assert.equal(h.calls.frames, 0);
});

test('shader warm-up cannot render after disposal and always releases its scratch target', async () => {
  const h = harness();
  const warming = h.controller.warm();
  h.controller.dispose();
  h.compilation.resolve();
  await warming;
  assert.equal(h.calls.renders, 0);
  assert.equal(h.calls.scratchDisposals, 1);
  assert.equal(h.calls.disposals, 1);
});

test('completed hold reuses the full-quality frame but resize and the next stage redraw', () => {
  const h = harness();
  h.controller.renderable();
  const hold = loopState(10_000);
  assert.equal(hold.phase, 'hold');
  h.controller.draw(hold);
  assert.equal(h.calls.renders, 1);
  for (let ms = 10_016; ms < 12_600; ms += 16) h.controller.draw(loopState(ms));
  assert.equal(h.calls.renders, 1);
  assert.equal(h.nodes.get('#viewer').dataset.rendering, 'held');
  h.controller.draw(hold, true);
  assert.equal(h.calls.renders, 2);
  h.controller.draw(loopState(12_700));
  assert.equal(h.calls.renders, 3);
  assert.equal(h.nodes.get('#viewer').dataset.phase, 'transition');
  h.controller.draw(loopState(24_400));
  assert.equal(h.calls.renders, 4);
  assert.equal(h.nodes.get('#viewer').dataset.space, '02');
  h.controller.dispose();
});
