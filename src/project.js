import '../assets/data/projects.js';
import { projectPath, projectDescription, renderProjectContent } from './project-content.js';

import { portfolioData } from './portfolio-public.js';
import { configured } from './portfolio-api.js';
let data = window.WIN_DESIGN_DATA;
let dataError;
try { data = await portfolioData(data); } catch(error) { console.error('Project load failed:', error); dataError = error; data = {...data, projects: []}; }
const { projects, site } = data;
const route = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
const slug = route?.[1] || new URLSearchParams(location.search).get('project');
const project = projects.find(item => item.slug === slug) || (!slug ? projects[0] : null);
const content = document.querySelector('#projectContent');
if (project) {
  // Dedicated routes contain static content before JavaScript runs.
  if (configured || !route || !content.querySelector('#projectTitle')) content.innerHTML = renderProjectContent(project, site);
  const canonical = new URL(projectPath(project.slug), site.url).href;
  document.title = `${project.title} | ${site.name}`;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [selector, value] of [
    ['name="description"', projectDescription(project, site)],
    ['property="og:title"', document.title],
    ['property="og:description"', projectDescription(project, site)],
    ['property="og:url"', canonical],
    ['property="og:image"', new URL(project.cover.src, site.url).href],
    ['property="og:image:alt"', project.cover.alt],
    ['name="twitter:title"', document.title],
    ['name="twitter:description"', projectDescription(project, site)],
    ['name="twitter:image"', new URL(project.cover.src, site.url).href],
    ['name="twitter:image:alt"', project.cover.alt]
  ]) document.querySelector(`meta[${selector}]`)?.setAttribute('content', value);
} else {
  document.title = `Project unavailable | ${site.name}`;
  content.innerHTML = '<section class="project-missing"><h1>Project unavailable.</h1><a href="/#portfolio">Back to portfolio</a></section>';
  if (dataError) content.querySelector('h1').textContent = 'Unable to load project. Please reload to retry.';
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, follow';
  document.head.append(robots);
}
void Promise.all([import('../assets/js/main.js'), import('../assets/js/site-integration.js')]);
