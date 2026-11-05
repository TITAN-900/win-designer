// Content/capacity is separate from the physical book. A future authenticated CMS
// can provide the same layout; no browser storage pretends to persist edits.
import savedLayout from '../assets/data/book-layout.json' with { type: 'json' };

export function catalogPages(data, layout = data.book || savedLayout) {
  const count = layout.pageCount;
  if (!Number.isInteger(count) || count < 2 || count > 100 || count % 2) {
    throw new Error('The portfolio requires an even number of printed pages (2–100).');
  }
  if (!Array.isArray(layout.slots) || layout.slots.length !== count * 4) {
    throw new Error('Each portfolio page must have exactly four saved slots.');
  }
  const used = new Set();
  return Array.from({ length: count }, (_, page) => ({
    number: page + 1,
    cells: layout.slots.slice(page * 4, page * 4 + 4).map(slug => {
      if (slug == null) return null;
      if (used.has(slug)) throw new Error(`Duplicate portfolio slot: ${slug}`);
      used.add(slug);
      const project = data.projects.find(item => item.slug === slug);
      if (!project) throw new Error(`Unknown portfolio project: ${slug}`);
      if (project.status && project.status !== 'PUBLISHED') return null;
      if (!project.cover) return null;
      return { project: project.title, slug, image: project.cover };
    })
  }));
}
