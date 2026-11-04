import { configured, request, imageUrl } from './portfolio-api.js';
export async function portfolioData(original) {
  if (!configured) return original;
  const [rows, links] = await Promise.all([
    request('/rest/v1/portfolio_projects?status=eq.PUBLISHED&order=created_at.asc'),
    request('/rest/v1/portfolio_legacy_links?select=slug')
  ]);
  const projects = original.projects.filter(p => !links.some(link => link.slug === p.slug));
  for (const row of rows) {
    const gallery = row.photos.map(p => ({ ...p, src: imageUrl(p), alt: row.name }));
    if (!gallery.length) continue;
    projects.push({ slug: row.slug, title: row.name, description: row.description, intro: '', type: '',
      cover: gallery.find((_, i) => row.photos[i].id === row.cover_id) || gallery[0], gallery, externalLink: row.external_link });
  }
  const pageCount = Math.max(6, Math.ceil(projects.length / 8) * 2);
  return { ...original, projects, book: { pageCount, slots: Array.from({length:pageCount * 4}, (_, i) => projects[i]?.slug || null) } };
}
