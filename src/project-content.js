// Shared by static routes and the legacy query URL. Content comes exclusively
// from the retained portfolio data; no inferred client facts or scope.
export const projectPath = slug => `/projects/${encodeURIComponent(slug)}/`;
export const assetPath = path => `/${path.replace(/^\/+/, '')}`;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
function imageMarkup(image, hero = false) {
  const responsive = image.srcSet ? ` srcset="${escapeHTML(image.srcSet)}" sizes="${hero ? '(min-width: 1600px) 1600px, 100vw' : '(max-width: 760px) 90vw, (min-width: 1600px) 700px, 44vw'}"` : '';
  return `<img src="${escapeHTML(assetPath(image.src))}"${responsive} alt="${escapeHTML(image.alt)}" width="${image.width}" height="${image.height}" ${hero ? 'class="project-hero-image" id="projectHeroImage" fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function galleryImage(image, group, index, hero = false) {
  const orientation = image.width > image.height ? 'landscape' : 'portrait';
  return `<button class="${hero ? 'project-hero-media' : `gallery-button gallery-button--${orientation}`}" type="button" aria-label="Enlarge: ${escapeHTML(image.alt)}" data-lightbox-group="${escapeHTML(group)}" data-lightbox-index="${index}" data-lightbox-src="${escapeHTML(assetPath(image.src))}" data-lightbox-alt="${escapeHTML(image.alt)}">${imageMarkup(image, hero)}</button>`;
}
export function projectDescription(project, site) {
  return project.intro?.trim() || `${project.title} — real project photography from ${site.name}.`;
}
export function renderProjectContent(project, site) {
  // Existing reference pairs do not establish same-project provenance.
  const pairs = (project.beforeAfter || []).filter(pair => pair.verified === true);
  // The cover is already shown once, at full width. Keep it in the lightbox
  // sequence without downloading/rendering another identical gallery tile.
  const gallery = project.gallery.filter(image => image.src !== project.cover.src);
  const group = `project-${project.slug}`;
  return `<section class="project-hero" aria-labelledby="projectTitle">
    ${galleryImage(project.cover, group, 0, true)}
    <div class="project-hero-copy">${project.type ? `<p class="brand-line">${escapeHTML(project.type)}</p>` : ''}<h1 id="projectTitle">${escapeHTML(project.title)}</h1>${project.intro ? `<p class="lead">${escapeHTML(project.intro)}</p>` : ''}</div>
  </section>
  <section class="project-photography" aria-label="${escapeHTML(project.title)} photography">
    <div class="masonry-gallery" id="projectGallery">${gallery.map((image, index) => galleryImage(image, group, index + 1)).join('')}</div>
    ${project.description ? `<div class="project-note"><h2>Space &amp; detail.</h2><p>${escapeHTML(project.description)}</p></div>` : ''}
  </section>
  ${pairs.length ? `<section class="project-comparison" id="projectBeforeAfter" aria-labelledby="comparisonTitle"><h2 id="comparisonTitle">Before / After</h2>${pairs.map((pair, index) => `<div class="compare-grid"><figure>${galleryImage(pair.before, `comparison-${index}`, 0)}<figcaption>Before</figcaption></figure><figure>${galleryImage(pair.after, `comparison-${index}`, 1)}<figcaption>After</figcaption></figure></div>`).join('')}</section>` : ''}
  <div class="project-return"><a class="portfolio-return" href="/#portfolio">Back to portfolio</a></div>`;
}
export function renderProjectDocument(template, project, site, origin) {
  const title = `${project.title} | ${site.name}`;
  const description = projectDescription(project, site);
  const canonical = `${origin}${projectPath(project.slug)}`;
  let html = template.replace(/<!--PROJECT_CONTENT_START-->[\s\S]*?<!--PROJECT_CONTENT_END-->/,
    `<!--PROJECT_CONTENT_START-->${renderProjectContent(project, site)}<!--PROJECT_CONTENT_END-->`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escapeHTML(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escapeHTML(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escapeHTML(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${canonical}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${origin}${assetPath(project.cover.src)}`)
    .replace(/(<meta property="og:image:alt" content=")[^"]*/, `$1${escapeHTML(project.cover.alt)}`)
    .replace(/(<meta name="twitter:title" content=")[^"]*/, `$1${escapeHTML(title)}`)
    .replace(/(<meta name="twitter:description" content=")[^"]*/, `$1${escapeHTML(description)}`)
    .replace(/(<meta name="twitter:image" content=")[^"]*/, `$1${origin}${assetPath(project.cover.src)}`)
    .replace(/(<meta name="twitter:image:alt" content=")[^"]*/, `$1${escapeHTML(project.cover.alt)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${canonical}`);
  return html.replaceAll('__SITE_ORIGIN__', origin);
}
