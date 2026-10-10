import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { pageGesture, movePageGesture, releasePageGesture } from '../src/book-gesture.js';
import { unit, releaseTarget, springStep } from '../src/page-curl-math.js';
import { catalogPages } from '../src/portfolio-catalog.js';

const point = (x, y, time = 0, id = 1) => ({ clientX: x, clientY: y, timeStamp: time,
  pointerId: id, pointerType: 'touch', button: 0, isPrimary: true, cancelable: true,
  prevented: false, preventDefault() { this.prevented = true; }, stopPropagation() {} });
const intent = direction => pageGesture(point(200, 200), { direction, distance: 280, corner: .2, handle: {} });

test('page intent leaves taps and vertical scrolling unclaimed but recognizes broad horizontal dragging', () => {
  const tap = intent(1);
  assert.equal(movePageGesture(tap, point(202, 201, 16)), 'pending');
  assert.equal(releasePageGesture(tap, point(203, 202, 50)), 'tap');
  const scroll = intent(1);
  assert.equal(movePageGesture(scroll, point(202, 212, 16)), 'scroll');
  assert.equal(movePageGesture(scroll, point(50, 220, 32)), 'scroll', 'vertical ownership cannot switch mid-scroll');
  assert.equal(releasePageGesture(scroll, point(50, 220, 50)), 'scroll');
  const drag = intent(1);
  assert.equal(movePageGesture(drag, point(190, 203, 16)), 'start');
  assert.equal(movePageGesture(drag, point(70, 204, 32)), 'drag');
  assert.equal(drag.progress, 130 / 280);
});

test('held and reversed pointers retain direct progress and release pauses discard stale flick velocity', () => {
  const drag = intent(1);
  movePageGesture(drag, point(60, 202, 16));
  assert.equal(drag.progress, .5);
  movePageGesture(drag, point(172, 202, 32));
  assert.equal(drag.progress, .1);
  assert.equal(releasePageGesture(drag, point(172, 202, 260)), 'release');
  assert.equal(drag.velocity, 0);
  assert.equal(releaseTarget(drag.progress, drag.velocity), 0);
  assert.equal(movePageGesture(drag, point(0, 202, 300)), 'ignore');
  const reverse = intent(-1);
  movePageGesture(reverse, point(340, 200, 20));
  assert.equal(reverse.progress, .5);
});

test('cancellation and unrelated pointers cannot complete a turn or masquerade as a project tap', () => {
  const drag = intent(1);
  assert.equal(movePageGesture(drag, point(0, 200, 20, 2)), 'ignore');
  movePageGesture(drag, point(0, 200, 30));
  assert.equal(releasePageGesture(drag, point(0, 200, 40), true), 'cancel');
  assert.equal(drag.cancelled, true);
  assert.equal(drag.velocity, 0);
});

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    dispatch(type, event = {}) { for (const fn of listeners.get(type) || []) fn(event); }
  };
}

function harness({ delayLoad = false } = {}) {
  const makeNode = () => {
    const classes = new Set(), captures = new Set();
    return { ...eventTarget(), dataset: {}, style: {}, attributes: {}, innerHTML: '', disabled: false,
      classList: { add: (...items) => items.forEach(item => classes.add(item)), remove: (...items) => items.forEach(item => classes.delete(item)) },
      setAttribute(name, value) { this.attributes[name] = value; },
      setPointerCapture(id) { captures.add(id); }, hasPointerCapture(id) { return captures.has(id); },
      releasePointerCapture(id) { captures.delete(id); this.dispatch('lostpointercapture', { pointerId: id }); },
      getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 600 }; },
      querySelectorAll() { return []; }, append() {}, after() {} };
  };
  const nodes = new Map(['#portfolioBook', '[data-book-left]', '[data-book-right]', '.book-object', '#bookPrevious', '#bookNext', '#bookStatus', '.book-hint', '.book-controls'].map(name => [name, makeNode()]));
  nodes.get('#portfolioBook').querySelector = selector => nodes.get(selector);
  const canvas = makeNode(), navigated = [], draws = [], spreads = [], frames = new Map();
  let observer, nextFrame = 0, now = 0, resolveLoad;
  const load = delayLoad ? new Promise(resolve => { resolveLoad = resolve; }) : Promise.resolve();
  const document = { ...eventTarget(), hidden: false, readyState: 'loading',
    querySelector: selector => nodes.get(selector), createElement: () => makeNode() };
  const window = { ...eventTarget(), matchMedia: () => ({ matches: true }), location: { assign: href => navigated.push(href) } };
  class BookCurl {
    constructor() { this.canvas = canvas; this.ready = false; this.renderer = { capabilities: { maxTextureSize: 4096 } }; }
    async load() { await load; this.ready = true; }
    resize() {} hide() {} dispose() {} setCoverTexture() {}
    setSpread(left, right) { spreads.push([left.page, right.page]); }
    setCover(progress) { this.cover = progress; }
    pageLayoutWidth() { return 390; }
    texture(page) { return { page, dispose() {} }; }
    begin() {}
    draw(progress) { draws.push(progress); }
    grabBounds(direction) { return { x: direction > 0 ? 380 : 10, y: 0, width: 30, height: 600 }; }
    pageSurfaceHit(x, y) { return y < 0 ? null : { side: this.cover === 1 && x < 195 ? 'left' : 'right', href: this.cover === 1 ? '/projects/walnut-residence/' : null }; }
  }
  const dataContext = { window: {} };
  vm.runInNewContext(readFileSync('assets/data/projects.js', 'utf8'), dataContext);
  const source = readFileSync('src/portfolio-book.js', 'utf8')
    .replace(/^import .*;\r?$/gm, '').replaceAll('export ', '')
    .replace("import('./book-curl.js')", 'Promise.resolve({ BookCurl })')
    .replace(/\nif \(typeof document[\s\S]*$/, '');
  const context = { document, window, BookCurl, catalogPages, unit, releaseTarget, springStep,
    pageGesture, movePageGesture, releasePageGesture, console,
    performance: { now: () => now },
    paintPage: markup => Promise.resolve(Number(markup.match(/SELECTED INTERIORS \/ 0(\d+)/)?.[1] || -1)),
    IntersectionObserver: class { constructor(callback) { observer = callback; } observe() {} disconnect() {} },
    requestAnimationFrame(callback) { const id = ++nextFrame; frames.set(id, callback); return id; },
    cancelAnimationFrame(id) { frames.delete(id); } };
  window.IntersectionObserver = context.IntersectionObserver;
  vm.runInNewContext(`${source}\nglobalThis.start = initPortfolioBook;`, context);
  context.start(dataContext.window.WIN_DESIGN_DATA);
  async function flush() {
    for (let iteration = 0; iteration < 35; iteration++) await Promise.resolve();
    const pending = [...frames.values()]; frames.clear(); now += 16;
    pending.forEach(callback => callback(now));
    for (let iteration = 0; iteration < 35; iteration++) await Promise.resolve();
  }
  let id = 0;
  async function drag(direction, { cancel = false, progress = .8, reverseTo = null } = {}) {
    const pointer = ++id, x = direction > 0 ? 300 : 90, distance = 390 * .72;
    canvas.dispatch('pointerdown', point(x, 300, now, pointer));
    canvas.dispatch('pointermove', point(x - direction * distance * progress, 301, now + 16, pointer));
    await flush();
    const final = reverseTo ?? progress;
    if (reverseTo !== null) canvas.dispatch('pointermove', point(x - direction * distance * final, 301, now + 32, pointer));
    await flush();
    canvas.dispatch(cancel ? 'pointercancel' : 'pointerup', point(x - direction * distance * final, 301, now + 200, pointer));
    await flush();
  }
  return { canvas, nodes, document, window, navigated, draws, spreads, flush, drag,
    enter: () => observer([{ isIntersecting: true }]), leave: () => observer([{ isIntersecting: false }]),
    resolveLoad: () => resolveLoad?.(), status: () => nodes.get('#portfolioBook').dataset };
}

test('real controller opens its cover, performs three broad forward and three reverse turns, and resets capture each time', async () => {
  const h = harness(); h.enter(); await h.flush();
  assert.equal(h.status().cover, 'closed');
  await h.drag(1);
  assert.equal(h.status().cover, 'open');
  for (const page of [2, 4, 6]) { await h.drag(1); assert.equal(h.status().page, String(page)); assert.equal(h.status().turning, undefined); }
  assert.equal(h.nodes.get('#bookNext').disabled, true);
  for (const page of [4, 2, 0]) { await h.drag(-1); assert.equal(h.status().page, String(page)); assert.equal(h.status().turning, undefined); }
  assert.equal(h.navigated.length, 0);
  assert.equal(h.status().capacity, '32'); assert.equal(h.status().emptySlots, '26');
  await h.drag(-1);
  assert.equal(h.status().cover, 'closed');
  assert.equal(h.nodes.get('#bookNext').disabled, false);
});

test('real controller preserves photo taps, leaves vertical scrolling alone and returns cancelled/reversed pages', async () => {
  const h = harness(); h.enter(); await h.flush(); await h.drag(1);
  h.canvas.dispatch('pointerdown', point(260, 250, 0, 20));
  h.canvas.dispatch('pointerup', point(262, 252, 30, 20));
  assert.deepEqual(h.navigated, ['/projects/walnut-residence/']);
  h.canvas.dispatch('pointerdown', point(260, 250, 0, 21));
  const vertical = point(262, 330, 30, 21);
  h.canvas.dispatch('pointermove', vertical);
  assert.equal(vertical.prevented, false); assert.equal(h.canvas.hasPointerCapture(21), false);
  h.document.dispatch('pointerup', point(263, 600, 50, 21));
  await h.drag(1, { cancel: true }); assert.equal(h.status().page, '0');
  await h.drag(1, { reverseTo: .1 }); assert.equal(h.status().page, '0');
  await h.drag(1); assert.equal(h.status().page, '2');
  h.leave(); assert.equal(h.status().cover, 'closed'); assert.equal(h.status().page, '0');
  h.enter(); await h.flush(); assert.equal(h.status().cover, 'closed');
});

test('pending preparation cannot reopen the book after leaving the section', async () => {
  const h = harness({ delayLoad: true }); h.enter();
  h.nodes.get('#bookNext').dispatch('click');
  h.leave(); h.resolveLoad(); await h.flush();
  assert.equal(h.status().cover, 'closed'); assert.equal(h.status().turning, undefined);
  assert.equal(h.nodes.get('#bookNext').disabled, false);
  h.enter(); await h.flush(); await h.drag(1);
  assert.equal(h.status().cover, 'open');
});

test('pointerup-only horizontal movement opens and turns pages without following photo links or exceeding bounds', async () => {
  const h = harness(); h.enter(); await h.flush();
  let pointer = 40;
  async function swipe(direction) {
    const id = ++pointer, x = direction > 0 ? 300 : 90;
    h.canvas.dispatch('pointerdown', point(x, 300, 0, id));
    h.canvas.dispatch('pointerup', point(x - direction * 225, 301, 40, id));
    await h.flush();
  }
  await swipe(1);
  assert.equal(h.status().cover, 'open');
  for (const page of [2, 4, 6]) { await swipe(1); assert.equal(h.status().page, String(page)); }
  await swipe(1);
  assert.equal(h.status().page, '6');
  assert.equal(h.status().turning, undefined);
  for (const page of [4, 2, 0]) { await swipe(-1); assert.equal(h.status().page, String(page)); }
  await swipe(-1);
  assert.equal(h.status().cover, 'closed');
  assert.equal(h.status().turning, undefined);
  assert.deepEqual(h.navigated, []);
});

test('lost capture cancels an active page and disposal removes global pointer listeners', async () => {
  const h = harness(); h.enter(); await h.flush(); await h.drag(1);
  h.canvas.dispatch('pointerdown', point(290, 250, 0, 30));
  h.canvas.dispatch('pointermove', point(100, 250, 20, 30)); await h.flush();
  assert.equal(h.canvas.hasPointerCapture(30), true);
  h.canvas.releasePointerCapture(30); await h.flush();
  assert.equal(h.status().page, '0'); assert.equal(h.status().turning, undefined);
  await h.drag(1); assert.equal(h.status().page, '2');
  h.window.dispatch('pagehide');
  h.document.dispatch('pointerup', point(290, 250, 100, 30));
  assert.equal(h.navigated.length, 0);
});
