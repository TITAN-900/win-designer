import { unit, releaseTarget, springStep } from './page-curl-math.js';
import { paintPage } from './book-page-texture.js';
import { catalogPages } from './portfolio-catalog.js';
import { pageGesture, movePageGesture, releasePageGesture } from './book-gesture.js';

const escapeHTML = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');

export function createBookPages(data) {
  return catalogPages(data);
}

export function nextBookPosition(current, mobile, pageCount) {
  return Math.min(pageCount - 2, current < 0 ? 0 : current + 2);
}
export function previousBookPosition(current, mobile) {
  return Math.max(0, current - 2);
}
export function canAdvanceBook(coverOpen, position, pageCount) {
  return !coverOpen || position < pageCount - 2;
}

function pageMarkup(page) {
  return `<div class="book-paper">
    <div class="book-paper-top"><span>WIN DESIGN</span><span>SELECTED INTERIORS / 0${page.number}</span></div>
    <div class="book-grid">${page.cells.map(cell => cell ? `
      <a class="book-cell" href="/projects/${encodeURIComponent(cell.slug)}/" aria-label="View ${escapeHTML(cell.project)}">
        <img src="${escapeHTML(cell.image.src)}" alt="${escapeHTML(cell.image.alt)}"
          width="${cell.image.width}" height="${cell.image.height}" loading="lazy" decoding="async">
        <span>${escapeHTML(cell.project)}</span>
      </a>` : '<div class="book-cell book-cell--empty" aria-hidden="true"></div>').join('')}</div>
    <div class="book-paper-foot"><span>SPACES / MATERIAL / DETAIL</span><span>0${page.number}</span></div>
  </div>`;
}

function bookCoverMarkup(logo) {
  return `<div class="book-cover"><span class="book-cover-edition">WIN DESIGN / PORTFOLIO</span>
    <img src="/${escapeHTML(logo)}" alt="WIN DESIGN" width="946" height="512">
    <div><span>SELECTED INTERIORS</span><strong>Between form<br>and life.</strong></div>
    <span class="book-cover-bottom">SPACE / MATERIAL / DETAIL</span></div>`;
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
  let coverOpen = false;
  let coverProgress = 0;
  let busy = false;
  let curl, preparation, gesture, turn, observer;
  let frame = 0, resizeFrame = 0, version = 0, operation = 0;
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
    handle.setAttribute('aria-label', direction > 0 ? 'Drag right page for next page' : 'Drag left page for previous page');
    handle.setAttribute('aria-keyshortcuts', 'Space ArrowLeft ArrowRight Enter Escape');
    handle.title = 'Drag to turn. Keyboard: Space to hold, arrows to bend, Enter to release, Escape to cancel.';
    handle.addEventListener('keydown', event => keyTurn(event, direction, handle));
    object.append(handle);
    handle.addEventListener('pointerdown', event => grab(event, direction, handle));
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', cancel);
    handle.addEventListener('lostpointercapture', lostCapture);
    return handle;
  });
  function mobile() { return mobileQuery.matches; }
  function markup(pageIndex) { return pageIndex === -1 ? bookCoverMarkup(data.site.logo) : pageMarkup(pages[pageIndex]); }
  function spread(pageIndex) { return [Math.floor(pageIndex / 2) * 2, Math.floor(pageIndex / 2) * 2 + 1]; }
  function destination(direction) { return direction > 0 ? nextBookPosition(position, mobile(), pages.length) : previousBookPosition(position, mobile()); }
  function updateControls() {
    previous.disabled = !coverOpen || busy || (failure && position === 0);
    next.disabled = !canAdvanceBook(coverOpen, position, pages.length) || busy;
    const number = n => String(n).padStart(2, '0');
    status.textContent = coverOpen ? `${number(position + 1)}—${number(position + 2)} / ${number(pages.length)}` : 'COVER';
    next.setAttribute('aria-label', coverOpen ? 'Next portfolio pages' : 'Open portfolio cover');
    book.dataset.cover = coverOpen ? 'open' : 'closed';
    book.dataset.capacity = String(pages.length * 4);
    book.dataset.emptySlots = String(pages.flatMap(page => page.cells).filter(cell => !cell).length);
    const hint = document.querySelector('.book-hint');
    if (hint) hint.textContent = coverOpen ? 'Swipe a page to explore · Tap a project to view' : 'Drag the cover to open';
    book.dataset.page = String(position);
    book.dataset.mode = mobile() ? 'single' : 'spread';
    handles[0].disabled = !coverOpen || (busy && gesture?.direction !== -1);
    handles[1].disabled = !canAdvanceBook(coverOpen, position, pages.length) || (busy && gesture?.direction !== 1);
    handles[1].setAttribute('aria-label', coverOpen ? 'Drag right page for next page' : 'Drag portfolio cover to open');
    handles[0].setAttribute('aria-label', position === 0 ? 'Drag portfolio cover to close' : 'Drag left page for previous page');
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
    coverOpen = true; coverProgress = 1;
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
      curl.canvas.addEventListener('pointerdown', event => {
        const hit = curl.pageSurfaceHit(event.clientX, event.clientY);
        if (!hit) return;
        grab(event, !coverOpen || hit.side === 'right' ? 1 : -1, curl.canvas, hit.href);
      });
      curl.canvas.addEventListener('pointermove', move);
      curl.canvas.addEventListener('pointercancel', cancel);
      curl.canvas.addEventListener('lostpointercapture', lostCapture);
      curl.canvas.addEventListener('pointerup', release);
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
      const keys = new Set([-1]);
      for (const index of [position, destination(1)]) {
        const pair = spread(index);
        pair.forEach(key => keys.add(key));
      }
      await Promise.all([...keys].map(texture));
      if (!busy && !disposed && !failure && token === version) {
        const pair = spread(position);
        const front = textureValues.get(pair[0]), back = textureValues.get(pair[1]);
        if (!front || !back) return;
        curl.setSpread(front, back);
        curl.setCoverTexture(textureValues.get(-1));
        curl.setCover(coverProgress);
        placeHandles();
        releaseRetired();
        // Bound future data-driven books to the visible spread and its next
        // neighbour, plus the cover. Earlier pages are repainted on demand.
        for (const [key, value] of textureValues) if (!keys.has(key)) {
          value.dispose(); textureValues.delete(key); textures.delete(key);
        }
        book.classList.add('book-ready');
      }
    } catch (error) { reportFailure(error); }
  }

  async function begin(direction, intent = null) {
    if (busy || disposed) return;
    if (failure) { position = destination(direction); render(); return; }
    if (!coverOpen || (direction < 0 && position === 0)) {
      if (!coverOpen && direction < 0) return;
      busy = true; updateControls();
      const token = version, pendingOperation = ++operation;
      try {
        await prepare();
        const pair = spread(position);
        await Promise.all([-1, ...pair].map(texture));
        if (disposed || token !== version || pendingOperation !== operation) return;
        curl.setSpread(textureValues.get(pair[0]), textureValues.get(pair[1]), false);
        curl.setCoverTexture(textureValues.get(-1));
        turn = { kind: 'cover', direction, progress: intent?.progress || 0, corner: 0 };
        book.classList.add('book-ready');
        book.dataset.turning = intent ? 'dragging-cover' : 'settling-cover';
        drawTurn();
        if (!intent) settle(1, .3);
        else if (intent.released) settle(intent.cancelled ? 0 : releaseTarget(intent.progress, intent.velocity), intent.velocity);
      } catch (error) { reportFailure(error); }
      return;
    }
    const target = destination(direction);
    if (target === position) return;
    busy = true;
    updateControls();
    const token = version, pendingOperation = ++operation;
    try {
      await prepare();
      const old = spread(position), upcoming = spread(target);
      const frontKey = old[direction > 0 ? 1 : 0];
      const backKey = upcoming[direction > 0 ? 0 : 1];
      await Promise.all([...new Set([...old, ...upcoming])].map(texture));
      const [front, back] = await Promise.all([texture(frontKey), texture(backKey)]);
      if (disposed || token !== version || pendingOperation !== operation || !front || !back) return;
      turn = { kind: 'page', target, progress: intent?.progress || 0, corner: intent?.corner || 0 };
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
      else if (intent.released) settle(intent.cancelled ? 0 : releaseTarget(intent.progress, intent.velocity), intent.velocity);
    } catch (error) { reportFailure(error); }
  }

  function grab(event, direction, handle, href = null) {
    if (busy || failure || disposed || event.isPrimary === false || (event.pointerType !== 'touch' && event.button !== 0)) return;
    if (gesture && !gesture.released && gesture.pointerId !== event.pointerId) return;
    const rect = object.getBoundingClientRect();
    gesture = pageGesture(event, { direction, handle, href: coverOpen ? href : null,
      corner: Math.max(-1, Math.min(1, (event.clientY - rect.top) / rect.height * 2 - 1)),
      distance: rect.width * (mobile() ? .72 : .82) });
  }

  function move(event) {
    if (!gesture || gesture.pointerId !== event.pointerId || gesture.released) return;
    const action = movePageGesture(gesture, event);
    if (action === 'scroll' || action === 'pending' || action === 'ignore') return;
    if (event.cancelable) event.preventDefault();
    if (action === 'start') {
      if ((gesture.direction > 0 && !canAdvanceBook(coverOpen, position, pages.length)) || (gesture.direction < 0 && !coverOpen)) {
        clearGesture(); return;
      }
      gesture.handle.setPointerCapture(event.pointerId);
      void begin(gesture.direction, gesture);
    }
    if (turn && !frame) frame = requestAnimationFrame(() => {
      frame = 0;
      if (!turn || !gesture || gesture.released) return;
      turn.progress = gesture.progress;
      drawTurn();
    });
  }

  function release(event) {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const action = releasePageGesture(gesture, event);
    if (action === 'tap') {
      const href = gesture.href;
      clearGesture();
      if (href && coverOpen && !busy) window.location.assign(href);
      return;
    }
    if (action !== 'release') { if (!busy) clearGesture(); return; }
    if (!busy) {
      const intent = gesture;
      if ((intent.direction > 0 && !canAdvanceBook(coverOpen, position, pages.length)) || (intent.direction < 0 && !coverOpen)) {
        clearGesture(); return;
      }
      // Coalesced input can first cross the horizontal threshold on pointerup.
      // The released intent lets preparation begin and settle the same turn.
      releaseCapture(intent);
      void begin(intent.direction, intent);
      return;
    }
    releaseCapture(gesture);
    if (turn) {
      turn.progress = gesture.progress;
      settle(releaseTarget(turn.progress, gesture.velocity), gesture.velocity);
    }
  }
  function cancel(event) {
    if (!gesture || gesture.released || gesture.pointerId !== event.pointerId) return;
    releasePageGesture(gesture, event, true);
    releaseCapture(gesture);
    if (turn) settle(0, 0);
    else finish(false); // Also invalidate a turn still waiting on textures.
  }
  function lostCapture(event) {
    if (gesture && !gesture.released && gesture.pointerId === event.pointerId) cancel(event);
  }
  function releaseCapture(intent) {
    if (intent?.pointerId !== undefined && intent.handle.hasPointerCapture(intent.pointerId)) intent.handle.releasePointerCapture(intent.pointerId);
  }
  function clearGesture() {
    const previousGesture = gesture;
    gesture = null;
    releaseCapture(previousGesture);
  }

  // The same held-paper interaction is available without a pointer. This also
  // lets keyboard users inspect a photograph during a partially completed turn.
  function keyTurn(event, direction, handle) {
    if (![' ', 'Enter', 'Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    if (!busy && (event.key === ' ' || event.key === 'Enter')) {
      gesture = { direction, handle, progress: 0, corner: .8, moved: 10, velocity: 0, keyboard: true, released: false };
      void begin(direction, gesture);
    } else if (gesture?.keyboard && !gesture.released) {
      if (event.key === 'Escape' || event.key === 'Enter' || event.key === ' ') {
        gesture.released = true;
        gesture.cancelled = event.key === 'Escape';
        if (turn) settle(gesture.cancelled ? 0 : releaseTarget(turn.progress, 0), 0);
      }
      else {
        gesture.progress = unit(gesture.progress + (event.key === 'ArrowLeft' ? direction : -direction) * .05);
        // Retain input even while the first GLB/page textures are preparing.
        if (turn) { turn.progress = gesture.progress; drawTurn(); }
      }
    }
  }

  function drawTurn() {
    if (!turn) return;
    if (turn.kind === 'cover') {
      coverProgress = turn.direction > 0 ? turn.progress : 1 - turn.progress;
      curl.setCover(coverProgress);
    } else curl.draw(turn.progress, turn.corner);
  }

  function settle(target, initialVelocity) {
    cancelAnimationFrame(frame); frame = 0;
    book.dataset.turning = 'settling';
    let velocity = Math.max(-2, Math.min(2, initialVelocity));
    let previousTime = performance.now();
    const started = previousTime;
    const advance = now => {
      if (!turn || disposed) return;
      const state = springStep(turn.progress, velocity, target, (now - previousTime) / 1000, turn.kind === 'cover');
      previousTime = now; velocity = state.velocity; turn.progress = state.position;
      if (reducedQuery.matches || now - started > 1000 || (Math.abs(turn.progress - target) < .001 && Math.abs(velocity) < .018)) {
        turn.progress = target; drawTurn(); finish(target === 1); return;
      }
      drawTurn();
      frame = requestAnimationFrame(advance);
    };
    frame = requestAnimationFrame(advance);
  }

  function finish(completed) {
    operation++;
    cancelAnimationFrame(frame); frame = 0;
    if (turn?.kind === 'cover') {
      if (completed) coverOpen = turn.direction > 0;
      coverProgress = coverOpen ? 1 : 0;
      curl?.setCover(coverProgress, false);
    } else if (completed && turn) position = turn.target;
    const pair = spread(position);
    if (textureValues.has(pair[0]) && textureValues.has(pair[1])) curl?.setSpread(textureValues.get(pair[0]), textureValues.get(pair[1]), false);
    curl?.hide();
    turn = null; clearGesture(); busy = false;
    delete book.dataset.turning;
    render();
    // Cover movement also changes the desktop camera center. Reproject the
    // narrow drag gutters after release, without moving a captured handle.
    placeHandles();
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
  // Release a pending (uncaptured) tap/scroll even if it ends outside canvas.
  document.addEventListener('pointerup', release);
  document.addEventListener('pointercancel', cancel);
  const onVisibility = () => { if (document.hidden && (busy || gesture)) finish(false); };
  document.addEventListener('visibilitychange', onVisibility);
  if ('IntersectionObserver' in window) {
    observer = new IntersectionObserver(entries => {
      near = entries[0].isIntersecting;
      if (near) void warm();
      else {
        if (busy || gesture) finish(false);
        coverOpen = false; coverProgress = 0; position = 0;
        curl?.setCover(0); render(); placeHandles();
      }
    }, { rootMargin: '350px' });
    observer.observe(book);
  } else { near = true; void warm(); }
  window.addEventListener('pagehide', () => {
    disposed = true; version++; operation++; clearGesture();
    observer?.disconnect();
    cancelAnimationFrame(frame); cancelAnimationFrame(resizeFrame);
    window.removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', onVisibility);
    document.removeEventListener('pointerup', release);
    document.removeEventListener('pointercancel', cancel);
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
