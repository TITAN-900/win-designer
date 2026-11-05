import { portfolioData } from './portfolio-public.js';
import { escapeHTML, projectPath, assetPath } from './project-content.js';

export function portfolioMarkup(projects) {
  return projects.filter(project => (!project.status || project.status === 'PUBLISHED') && project.cover?.src)
    .map(project => {
      const photo = project.cover;
      const responsive = photo.srcSet
        ? ` srcset="${escapeHTML(photo.srcSet)}" sizes="(max-width: 340px) 90vw, (max-width: 899px) 44vw, (max-width: 1199px) 29vw, 23vw"`
        : '';
      return `<article class="portfolio-item">
        <a class="portfolio-link" href="${projectPath(project.slug)}" aria-label="View ${escapeHTML(project.title)}">
          <div class="portfolio-image">
            <img src="${escapeHTML(assetPath(photo.src))}"${responsive} alt="${escapeHTML(photo.alt || project.title)}"
              width="${photo.width}" height="${photo.height}" loading="lazy" decoding="async">
            <span class="portfolio-image-error" hidden>Photograph unavailable</span>
          </div>
          <h3>${escapeHTML(project.title)}</h3>
        </a>
      </article>`;
    }).join('');
}

export function initPortfolioGrid(original, load = portfolioData) {
  const grid = document.querySelector('#portfolioGrid');
  const status = document.querySelector('#portfolio-status');
  if (!grid || !status) return;
  let pending = false, disposed = false, signature = '', lastRead = 0;

  async function refresh(force = false) {
    if (pending || disposed || (!force && Date.now() - lastRead < 30000)) return;
    pending = true;
    grid.setAttribute('aria-busy', 'true');
    try {
      const data = await load(original);
      if (disposed) return;
      const markup = portfolioMarkup(data.projects);
      if (markup !== signature) {
        grid.innerHTML = markup;
        signature = markup;
        grid.querySelectorAll('img').forEach(img => {
          img.addEventListener('error', () => {
            img.hidden = true;
            img.nextElementSibling.hidden = false;
            console.error('Portfolio photograph failed to load:', img.currentSrc || img.src);
          }, { once: true });
        });
      }
      status.textContent = markup ? '' : 'New projects will appear here.';
      status.hidden = Boolean(markup);
      lastRead = Date.now();
    } catch (error) {
      if (disposed) return;
      // Never replace a failed CMS request with potentially unpublished static data.
      grid.replaceChildren();
      signature = '';
      status.hidden = false;
      status.textContent = 'Unable to load projects. ';
      const retry = document.createElement('button');
      retry.type = 'button';
      retry.textContent = 'Try again';
      retry.onclick = () => refresh(true);
      status.append(retry);
      console.error('Portfolio load failed:', error);
    } finally {
      pending = false;
      grid.setAttribute('aria-busy', 'false');
    }
  }

  const onVisible = () => { if (!document.hidden) void refresh(); };
  const timer = window.setInterval(() => {
    const rect = grid.getBoundingClientRect();
    if (!document.hidden && rect.bottom > 0 && rect.top < window.innerHeight) void refresh();
  }, 60000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('focus', onVisible);
  const onPageHide = event => {
    if (event.persisted) return;
    disposed = true;
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('focus', onVisible);
    window.removeEventListener('pagehide', onPageHide);
  };
  window.addEventListener('pagehide', onPageHide);
  void refresh(true);
}

if (typeof document !== 'undefined') initPortfolioGrid(window.WIN_DESIGN_DATA);
