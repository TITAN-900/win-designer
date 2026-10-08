import { unit, releaseTarget, springStep } from './page-curl-math.js';
import { paintPage } from './book-page-texture.js';

const picks = [
  [['walnut-residence', 0], ['walnut-residence', 1], ['walnut-residence', 2], ['walnut-residence', 3]],
  [['stone-kitchen', 0], ['stone-kitchen', 1], ['stone-kitchen', 2], ['foyer-cabinetry', 0]],
  [['private-suite', 0], ['private-suite', 1], ['private-suite', 2], ['open-living', 0]],
  [['open-living', 1], ['foyer-cabinetry', 1], ['built-in-study', 0], ['built-in-study', 1]]
];
const escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export function createBookPages(data) {
  return picks.map((page, pageIndex) => ({
    number: pageIndex + 1,
    cells: page.map(([slug, imageIndex]) => {
      const project = data.projects.find(item => item.slug === slug);
      if (!project?.gallery[imageIndex]) throw new Error(`Missing book image: ${slug}/${imageIndex}`);
      return { project: project.title, slug, image: project.gallery[imageIndex] };
    })
  }));
}

export function nextBookPosition(current, mobile, pageCount) {
  return Math.min(pageCount - 2, current < 0 ? 0 : current + 2);
}
export function previousBookPosition(current, mobile) {
  return Math.max(0, current - 2);
}

function pageMarkup(page) {
  return `<div class="book-paper">
    <div class="book-paper-top"><span>WIN DESIGN</span><span>SELECTED INTERIORS / 0${page.number}</span></div>
    <div class="book-grid">${page.cells.map(cell => `
      <a class="book-cell" href="/projects/${encodeURIComponent(cell.slug)}/" aria-label="View ${escapeHTML(cell.project)}">
        <img src="${escapeHTML(cell.image.src)}" alt="${escapeHTML(cell.image.alt)}"
          width="${cell.image.width}" height="${cell.image.height}" loading="lazy" decoding="async">
        <span>${escapeHTML(cell.project)}</span>
      </a>`).join('')}</div>
    <div class="book-paper-foot"><span>SPACES / MATERIAL / DETAIL</span><span>0${page.number}</span></div>
  </div>`;
}

export function initPortfolioBook(data) {
  const book = document.querySelector('#portfolioBook');
  if (!book) return;
  const pages = createBookPages(data);
  const left = book.querySelector('[data-book-left]');
  const right = book.querySelector('[data-book-right]');
  const object = book.querySelector('.book-object');
  const previous = document.querySelector('#bookPrevious');
  const next = document.querySelector('#bookNext');
  const status = document.querySelector('#bookStatus');
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let position = 0;
  let busy = false;
  let curl, preparation, gesture, turn, observer;
  let frame = 0, resizeFrame = 0, version = 0;
  let disposed = false, near = false, failure = false;
  let width = 0, height = 0;
  const textures = new Map();
  const textureValues = new Map();
  const retiredTextures = new Set();
  const releaseRetired = () => { retiredTextures.forEach(value => value.dispose()); retiredTextures.clear(); };
  const handles = [-1, 1].map(direction => {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = `book-grab book-grab--${direction > 0 ? 'next' : 'previous'}`;
    handle.setAttribute('aria-label', direction > 0 ? 'Drag page edge for next page' : 'Drag page edge for previous page');
    handle.setAttribute('aria-keyshortcuts', 'Space ArrowLeft ArrowRight Enter Escape');
    handle.title = 'Drag to turn. Keyboard: Space to hold, arrows to bend, Enter to release, Escape to cancel.';
    handle.addEventListener('keydown', event => keyTurn(event, direction, handle));
    object.append(handle);
    handle.addEventListener('pointerdown', event => grab(event, direction, handle));
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', cancel);
    return handle;
  });
  function mobile() { return mobileQuery.matches; }
  function markup(pageIndex) { return pageMarkup(pages[pageIndex]); }
  function spread(pageIndex) { return [Math.floor(pageIndex / 2) * 2, Math.floor(pageIndex / 2) * 2 + 1]; }
  function destination(direction) { return direction > 0 ? nextBookPosition(position, mobile(), pages.length) : previousBookPosition(position, mobile()); }
  function updateControls() {
    previous.disabled = position <= 0 || busy;
    next.disabled = position >= pages.length - 2 || busy;
    status.textContent = `0${Math.floor(position / 2) * 2 + 1}—0${Math.floor(position / 2) * 2 + 2} / 04`;
    book.dataset.page = String(position);
    book.dataset.mode = mobile() ? 'single' : 'spread';
    handles[0].disabled = position <= 0 || (busy && gesture?.direction !== -1);
    handles[1].disabled = position >= pages.length - 2 || (busy && gesture?.direction !== 1);
  }
  function render() {
    const pair = spread(position);
    left.innerHTML = markup(pair[0]);
    right.innerHTML = markup(pair[1]);
    updateControls();
  }

  function reportFailure(error) {
    if (disposed) return;
    console.error('Portfolio page curl failed:', error);
    failure = true;
    book.classList.add('book-fallback');
    book.classList.remove('book-ready');
    finish(false);
    let notice = document.querySelector('#bookError');
    if (!notice) {
      notice = document.createElement('p'); notice.id = 'bookError'; notice.className = 'book-error';
      notice.setAttribute('role', 'status'); document.querySelector('.book-controls').after(notice);
    }
    notice.textContent = 'Interactive paper is unavailable on this device. Use the page controls to view the portfolio.';
  }

  async function prepare() {
    if (!preparation) preparation = import('./book-curl.js').then(async ({ BookCurl }) => {
      if (disposed) return;
      curl = new BookCurl(object, reportFailure);
      await curl.load();
      if (disposed) { curl.dispose(); return; }
      const rect = object.getBoundingClientRect();
      width = rect.width; height = rect.height;
      curl.resize(width, height, mobile());
      book.dataset.renderer = 'blender-curved-mesh';
      let tap;
      curl.canvas.addEventListener('pointerdown', event => { if (!busy) tap = { x: event.clientX, y: event.clientY, id: event.pointerId }; });
      curl.canvas.addEventListener('pointercancel', () => { tap = null; });
      curl.canvas.addEventListener('pointerup', event => {
        if (!busy && tap?.id === event.pointerId && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) < 7) {
          const href = curl.pageHit(event.clientX, event.clientY);
          if (href) window.location.assign(href);
        }
        tap = null;
      });
      placeHandles();
    });
    await preparation;
  }

  function texture(pageIndex) {
    if (!textures.has(pageIndex)) {
      const currentVersion = version;
      const pageWidth = curl.pageLayoutWidth();
      textures.set(pageIndex, paintPage(markup(pageIndex), pageWidth, pageWidth * 1.3,
        mobile(), curl.renderer.capabilities.maxTextureSize).then(canvas => {
        if (disposed || currentVersion !== version) return null;
        const value = curl.texture(canvas);
        textureValues.set(pageIndex, value);
        return value;
      }));
    }
    return textures.get(pageIndex);
  }

  async function warm() {
    if (!near || disposed || failure) return;
    const token = version;
    try {
      await prepare();
      if (disposed) return;
      const keys = new Set();
      for (const index of [position, destination(1), destination(-1)]) {
        const pair = spread(index);
        pair.forEach(key => keys.add(key));
      }
      await Promise.all([...keys].map(texture));
      if (!busy && !disposed && !failure && token === version) {
        const pair = spread(position);
        const front = textureValues.get(pair[0]), back = textureValues.get(pair[1]);
        if (!front || !back) return;
        curl.setSpread(front, back);
        releaseRetired();
        book.classList.add('book-ready');
      }
    } catch (error) { reportFailure(error); }
  }

  async function begin(direction, intent = null) {
    if (busy || disposed) return;
    const target = destination(direction);
    if (target === position) return;
    if (failure) { position = target; render(); return; }
    busy = true;
    updateControls();
    const token = version;
    try {
      await prepare();
      const old = spread(position), upcoming = spread(target);
      const frontKey = old[direction > 0 ? 1 : 0];
      const backKey = upcoming[direction > 0 ? 0 : 1];
      await Promise.all([...new Set([...old, ...upcoming])].map(texture));
      const [front, back] = await Promise.all([texture(frontKey), texture(backKey)]);
      if (disposed || token !== version || !front || !back) return;
      turn = { target, progress: intent?.progress || 0, corner: intent?.corner || 0 };
      book.classList.add('book-ready');
      const underneath = direction > 0 ? [old[0], upcoming[1]] : [upcoming[0], old[1]];
      curl.setSpread(textureValues.get(underneath[0]), textureValues.get(underneath[1]), false);
      if (direction > 0) right.innerHTML = markup(upcoming[1]);
      else left.innerHTML = markup(upcoming[0]);
      // These are no longer offscreen content: reveal the cached photos at
      // once, rather than waiting for native lazy-loading's next intersection.
      for (const image of object.querySelectorAll('.book-page img')) image.loading = 'eager';
      book.dataset.turning = intent ? 'dragging' : 'settling';
      curl.begin({ front, back, direction });
      curl.draw(turn.progress, turn.corner);
      releaseRetired();
      if (!intent) settle(1, .3);
      else if (intent.released) settle(intent.cancelled ? 0 : intent.moved < 6 ? 1 : releaseTarget(intent.progress, intent.velocity), intent.velocity);
    } catch (error) { reportFailure(error); }
  }

  function grab(event, direction, handle) {
    if (busy || (event.pointerType !== 'touch' && event.button !== 0)) return;
    event.preventDefault();
    const rect = object.getBoundingClientRect();
    gesture = { pointerId: event.pointerId, direction, handle, startX: event.clientX, lastX: event.clientX,
      time: event.timeStamp, velocity: 0, progress: 0, moved: 0,
      corner: Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1)),
      distance: rect.width * (mobile() ? .72 : .82), released: false };
    handle.setPointerCapture(event.pointerId);
    void begin(direction, gesture);
  }

  function move(event) {
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.released) return;
    const nextProgress = unit((gesture.startX - event.clientX) * gesture.direction / gesture.distance);
    const dt = Math.max(8, event.timeStamp - gesture.time) / 1000;
    gesture.velocity = .35 * gesture.velocity + .65 * (nextProgress - gesture.progress) / dt;
    gesture.moved = Math.max(gesture.moved, Math.abs(gesture.startX - event.clientX));
    gesture.lastX = event.clientX; gesture.time = event.timeStamp; gesture.progress = nextProgress;
    if (turn && !frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!turn || !gesture || gesture.released) return;
      turn.progress = gesture.progress;
      curl.draw(turn.progress, turn.corner);
    });
  }

  function release(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.released = true;
    if (event.timeStamp - gesture.time > 100) gesture.velocity = 0;
    if (gesture.handle.hasPointerCapture(event.pointerId)) gesture.handle.releasePointerCapture(event.pointerId);
    if (turn) {
      turn.progress = gesture.progress;
      settle(gesture.moved < 6 ? 1 : releaseTarget(turn.progress, gesture.velocity), gesture.velocity);
    }
  }
  function cancel(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    gesture.released = true; gesture.cancelled = true;
    if (turn) settle(0, 0);
  }

  // The same held-paper interaction is available without a pointer. This also
  // lets keyboard users inspect a photograph during a partially completed turn.
  function keyTurn(event, direction, handle) {
    if (![' ', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (!busy && (event.key === ' ' || event.key === 'Enter')) {
      gesture = { direction, handle, progress: 0, corner: .8, moved: 10, velocity: 0, keyboard: true, released: false };
      void begin(direction, gesture);
    } else if (turn && gesture?.keyboard) {
      if (event.key === 'Escape') settle(0, 0);
      else if (event.key === 'Enter' || event.key === ' ') settle(releaseTarget(turn.progress, 0), 0);
      else {
        gesture.progress = unit(gesture.progress + (event.key === 'ArrowLeft' ? direction : -direction) * .05);
        turn.progress = gesture.progress;
        curl.draw(turn.progress, turn.corner);
      }
    }
  }

  function settle(target, initialVelocity) {
    cancelAnimationFrame(frame); frame = 0;
    book.dataset.turning = 'settling';
    let velocity = Math.max(-2, Math.min(2, initialVelocity));
    let previousTime = performance.now();
    const started = previousTime;
    const advance = now => {
      if (!turn || disposed) return;
      const state = springStep(turn.progress, velocity, target, (now - previousTime) / 1000);
      previousTime = now; velocity = state.velocity; turn.progress = state.position;
      if (reducedQuery.matches || now - started > 1000 || (Math.abs(turn.progress - target) < .001 && Math.abs(velocity) < .018)) {
        curl.draw(target, turn.corner); finish(target === 1); return;
      }
      curl.draw(turn.progress, turn.corner);
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
  }

  function finish(completed) {
    cancelAnimationFrame(frame); frame = 0;
    if (completed && turn) position = turn.target;
    const pair = spread(position);
    if (textureValues.has(pair[0]) && textureValues.has(pair[1])) curl?.setSpread(textureValues.get(pair[0]), textureValues.get(pair[1]), false);
    curl?.hide();
    turn = null; gesture = null; busy = false;
    delete book.dataset.turning;
    render();
    if (!failure) void warm();
  }
  function placeHandles() {
    if (!curl?.ready) return;
    handles.forEach((handle, i) => {
      const bounds = curl.grabBounds(i ? 1 : -1);
      Object.assign(handle.style, { left: `${bounds.x - bounds.width / 2}px`, right: 'auto',
        top: `${bounds.y}px`, bottom: 'auto', height: `${bounds.height}px`, width: `${bounds.width}px` });
    });
  }
  function resize() {
    cancelAnimationFrame(resizeFrame);
    resizeFrame = requestAnimationFrame(() => {
      const rect = object.getBoundingClientRect();
      if (Math.abs(rect.width - width) < .5 && Math.abs(rect.height - height) < .5) return;
      version++;
      for (const value of textureValues.values()) retiredTextures.add(value);
      textures.clear();
      textureValues.clear();
      if (!mobile() && position >= 0) position = Math.floor(position / 2) * 2;
      width = rect.width; height = rect.height;
      curl?.resize(width, height, mobile());
      placeHandles();
      finish(false);
    });
  }
  const previousClick = () => void begin(-1);
  const nextClick = () => void begin(1);
  previous.addEventListener('click', previousClick);
  next.addEventListener('click', nextClick);
  book.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    void begin(event.key === 'ArrowRight' ? 1 : -1);
  });
  window.addEventListener('resize', resize, { passive: true });
  const onVisibility = () => { if (document.hidden && turn) finish(false); };
  document.addEventListener('visibilitychange', onVisibility);
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      near = entries[0].isIntersecting;
      if (near) void warm();
      else if (turn) finish(false);
    }, { rootMargin: '350px' });
    observer.observe(book);
  } else { near = true; void warm(); }
  window.addEventListener('pagehide', () => {
    disposed = true; version++;
    observer?.disconnect();
    cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    previous.removeEventListener('click', previousClick); next.removeEventListener('click', nextClick);
    for (const pending of textures.values()) void pending.then(value => value?.dispose(), () => {});
    releaseRetired();
    textures.clear(); textureValues.clear(); curl?.dispose();
  }, { once: true });
  render();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const start = () => initPortfolioBook(window.WIN_DESIGN_DATA);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
