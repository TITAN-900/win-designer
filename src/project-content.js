// Shared by static routes and the legacy query URL. Content comes exclusively
// from the retained portfolio data; no inferred client facts or scope.
export const projectPath = slug => `/projects/${encodeURIComponent(slug)}/`;
export const assetPath = path => `/${path.replace(/^\/+/, '')}`;
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));
const arrow = '<svg class="action-arrow" viewBox="0 0 20 20" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12"/></svg>';
function imageMarkup(image, hero = false) {
  return `<img src="${escapeHTML(assetPath(image.src))}" alt="${escapeHTML(image.alt)}" width="${image.width}" height="${image.height}" ${hero ? 'class="project-hero-image" id="projectHeroImage" fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}
function galleryImage(image, group, index) {
  return `<button class="gallery-button" type="button" aria-label="Enlarge: ${escapeHTML(image.alt)}" data-lightbox-group="${escapeHTML(group)}" data-lightbox-index="${index}" data-lightbox-src="${escapeHTML(assetPath(image.src))}" data-lightbox-alt="${escapeHTML(image.alt)}">${imageMarkup(image)}</button>`;
}
export function renderProjectContent(project, site) {
  // Existing reference pairs do not establish same-project provenance.
  const pairs = (project.beforeAfter || []).filter(pair => pair.verified === true);
  const whatsapp = `${site.whatsappBase}?text=${encodeURIComponent(`Hi WIN DESIGN, I would like to discuss a space inspired by ${project.title}.`)}`;
  return `<section class="project-hero" aria-labelledby="projectTitle">
    ${imageMarkup(project.cover, true)}
    <div class="project-hero-copy"><p class="brand-line">${escapeHTML(project.type)}</p><h1 id="projectTitle">${escapeHTML(project.title)}</h1><p class="lead">${escapeHTML(project.intro)}</p></div>
  </section>
  <section class="project-photography" aria-label="${escapeHTML(project.title)} photography">
    <div class="masonry-gallery" id="projectGallery">${project.gallery.map((image, index) => galleryImage(image, `project-${project.slug}`, index)).join('')}</div>
    <div class="project-note"><h2>Space &amp; detail.</h2><p>${escapeHTML(project.description)}</p></div>
  </section>
  ${pairs.length ? `<section class="project-comparison" id="projectBeforeAfter" aria-labelledby="comparisonTitle"><h2 id="comparisonTitle">Before / After</h2>${pairs.map((pair, index) => `<div class="compare-grid"><figure>${galleryImage(pair.before, `comparison-${index}`, 0)}<figcaption>Before</figcaption></figure><figure>${galleryImage(pair.after, `comparison-${index}`, 1)}<figcaption>After</figcaption></figure></div>`).join('')}</section>` : ''}
  <section class="minimal-contact" id="contact" aria-labelledby="contact-title" data-nav-section>
    <div><a class="portfolio-return" href="/#portfolio">Back to portfolio</a><h2 id="contact-title">Your next space.</h2></div>
    <div class="minimal-contact-actions"><a href="${escapeHTML(whatsapp)}" target="_blank" rel="noopener">WhatsApp ${arrow}</a><a class="contact-phone" href="${escapeHTML(site.phoneHref)}">${escapeHTML(site.phoneDisplay)}</a></div>
  </section>`;
}
export function renderProjectDocument(template, project, site, origin) {
  const title = `${project.title} | ${site.name}`;
  const description = `${project.title}. ${project.intro}`;
  const canonical = `${origin}${projectPath(project.slug)}`;
  let html = template.replace(/<!--PROJECT_CONTENT_START-->[\s\S]*?<!--PROJECT_CONTENT_END-->/,
    `<!--PROJECT_CONTENT_START-->${renderProjectContent(project, site)}<!--PROJECT_CONTENT_END-->`);
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHTML(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${escapeHTML(description)}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${escapeHTML(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${escapeHTML(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${canonical}`)
    .replace(/(<meta property="og:image" content=")[^"]*/, `$1${origin}${assetPath(project.cover.src)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${canonical}`);
  return html.replaceAll('__SITE_ORIGIN__', origin);
}
