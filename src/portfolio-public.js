import { configured, request, imageUrl } from './portfolio-api.js';
export async function portfolioData(original) {
  if (!configured) return original;
  const [rows, links] = await Promise.all([
    request('/rest/v1/portfolio_projects?status=eq.PUBLISHED&order=created_at.asc'),
    request('/rest/v1/portfolio_legacy_links?select=slug')
  ]);
  return mergePublishedProjects(original, rows, links);
}

export function mergePublishedProjects(original, rows, links) {
  const projects = original.projects.filter(p => !links.some(link => link.slug === p.slug));
  for (const row of rows.filter(row => row.status === 'PUBLISHED')) {
    const gallery = row.photos.map(p => ({ ...p, src: imageUrl(p), alt: row.name }));
    if (!gallery.length) continue;
    projects.push({ slug: row.slug, title: row.name, description: row.description, intro: '', type: '',
      cover: gallery.find((_, i) => row.photos[i].id === row.cover_id) || gallery[0], gallery, externalLink: row.external_link });
  }
  return { ...original, projects };
}
