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
  return Math.min(pageCount - (mobile ? 1 : 2), current < 0 ? 0 : current + (mobile ? 1 : 2));
}
export function previousBookPosition(current, mobile) {
  return Math.max(-1, current - (mobile ? 1 : 2));
}

function pageMarkup(page) {
  return `<div class="book-paper">
    <div class="book-paper-top"><span>WIN DESIGN</span><span>SELECTED INTERIORS / 0${page.number}</span></div>
    <div class="book-grid">${page.cells.map(cell => `
      <a class="book-cell" href="project.html?project=${encodeURIComponent(cell.slug)}" aria-label="View ${escapeHTML(cell.project)}">
        <img src="${escapeHTML(cell.image.src)}" alt="${escapeHTML(cell.image.alt)}"
          width="${cell.image.width}" height="${cell.image.height}" loading="lazy" decoding="async">
        <span>${escapeHTML(cell.project)}</span>
      </a>`).join('')}</div>
    <div class="book-paper-foot"><span>SPACES / MATERIAL / DETAIL</span><span>0${page.number}</span></div>
  </div>`;
}

function coverMarkup() {
  return `<div class="book-cover">
    <span class="book-cover-edition">WIN DESIGN / PORTFOLIO 01</span>
    <img src="assets/win20/win-design-logo-nav-compact.png" alt="" width="946" height="512">
    <div><span>SELECTED</span><strong>Interiors.</strong></div>
    <span class="book-cover-bottom">A COLLECTION OF CONSIDERED SPACES</span>
  </div>`;
}

function insideMarkup() {
  return `<div class="book-inside"><span>WIN DESIGN</span><span>INTERIORS & CARPENTRY<br>MALAYSIA</span></div>`;
}

function preloadPages(pages) {
  const images = pages.flatMap(page => page?.cells.map(cell => cell.image.src) || []);
  return Promise.all(images.map(src => new Promise(resolve => {
    const image = new Image();
    image.onload = resolve;
    image.onerror = resolve;
    image.src = src;
    if (image.complete) resolve();
  })));
}

export function initPortfolioBook(data) {
  const book = document.querySelector('#portfolioBook');
  if (!book) return;
  const pages = createBookPages(data);
  const left = book.querySelector('[data-book-left]');
  const right = book.querySelector('[data-book-right]');
  const turning = book.querySelector('[data-book-turn]');
  const previous = document.querySelector('#bookPrevious');
  const next = document.querySelector('#bookNext');
  const status = document.querySelector('#bookStatus');
  const mobileQuery = window.matchMedia('(max-width: 760px)');
  let position = -1;
  let busy = false;

  function mobile() { return mobileQuery.matches; }
  function markup(pageIndex) { return pageIndex < 0 ? coverMarkup() : pageMarkup(pages[pageIndex]); }
  function updateControls() {
    previous.disabled = position < 0 || busy;
    next.disabled = position >= pages.length - (mobile() ? 1 : 2) || busy;
    status.textContent = position < 0 ? 'COVER / 04'
      : mobile() ? `0${position + 1} / 04`
        : `0${Math.floor(position / 2) * 2 + 1}—0${Math.floor(position / 2) * 2 + 2} / 04`;
    book.dataset.page = String(position);
    book.dataset.mode = mobile() ? 'single' : 'spread';
  }
  function render() {
    left.innerHTML = position < 0 ? insideMarkup() : pageMarkup(pages[Math.floor(position / 2) * 2]);
    right.innerHTML = position < 0 ? coverMarkup()
      : pageMarkup(pages[mobile() ? position : Math.floor(position / 2) * 2 + 1]);
    book.classList.toggle('is-cover', position < 0);
    updateControls();
  }
  async function turn(direction) {
    if (busy) return;
    const target = direction > 0
      ? nextBookPosition(position, mobile(), pages.length)
      : previousBookPosition(position, mobile());
    if (target === position) return;
    busy = true;
    updateControls();
    await preloadPages(mobile() ? [pages[target]] : [pages[target], pages[target + 1]]);
    const oldLeft = left.innerHTML;
    const oldRight = right.innerHTML;
    if (mobile()) {
      right.innerHTML = markup(target);
      turning.innerHTML = `<div class="book-turn-front">${oldRight}</div><div class="book-turn-back">${markup(target)}</div>`;
    } else if (direction > 0) {
      right.innerHTML = pageMarkup(pages[target + 1]);
      turning.innerHTML = `<div class="book-turn-front">${oldRight}</div><div class="book-turn-back">${pageMarkup(pages[target])}</div>`;
    } else {
      left.innerHTML = target < 0 ? insideMarkup() : pageMarkup(pages[target]);
      turning.innerHTML = `<div class="book-turn-front">${oldLeft}</div><div class="book-turn-back">${target < 0 ? coverMarkup() : pageMarkup(pages[target + 1])}</div>`;
    }
    turning.hidden = false;
    turning.className = `book-turn-sheet ${direction > 0 ? 'turn-forward' : 'turn-backward'}`;
    book.dataset.turning = 'true';
    await new Promise(resolve => {
      const timer = window.setTimeout(resolve, 1150);
      turning.addEventListener('animationend', () => {
        window.clearTimeout(timer);
        resolve();
      }, { once: true });
    });
    position = target;
    turning.hidden = true;
    turning.className = 'book-turn-sheet';
    turning.innerHTML = '';
    delete book.dataset.turning;
    busy = false;
    render();
    const upcoming = nextBookPosition(position, mobile(), pages.length);
    if (upcoming !== position) void preloadPages(mobile() ? [pages[upcoming]] : [pages[upcoming], pages[upcoming + 1]]);
  }
  previous.addEventListener('click', () => void turn(-1));
  next.addEventListener('click', () => void turn(1));
  book.addEventListener('keydown', event => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    event.preventDefault();
    void turn(event.key === 'ArrowRight' ? 1 : -1);
  });
  mobileQuery.addEventListener('change', () => { if (!busy) render(); });
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      if (!entries[0].isIntersecting) return;
      void preloadPages([pages[0], pages[1]]);
      observer.disconnect();
    }, { rootMargin: '350px' });
    observer.observe(book);
  }
  render();
}

if (typeof document !== 'undefined' && typeof window !== 'undefined') {
  const start = () => initPortfolioBook(window.WIN_DESIGN_DATA);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
