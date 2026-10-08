import '../assets/data/projects.js';
import { projectPath, renderProjectContent } from './project-content.js';

const { projects, site } = window.WIN_DESIGN_DATA;
const route = location.pathname.match(/^\/projects\/([^/]+)\/?$/);
const slug = route?.[1] || new URLSearchParams(location.search).get('project');
const project = projects.find(item => item.slug === slug) || (!slug ? projects[0] : null);
const content = document.querySelector('#projectContent');
if (project) {
  // Dedicated routes contain static content before JavaScript runs.
  if (!route || !content.querySelector('#projectTitle')) content.innerHTML = renderProjectContent(project, site);
  const canonical = new URL(projectPath(project.slug), site.url).href;
  document.title = `${project.title} | ${site.name}`;
  document.querySelector('link[rel="canonical"]').href = canonical;
  for (const [selector, value] of [
    ['name="description"', `${project.title}. ${project.intro}`],
    ['property="og:title"', document.title],
    ['property="og:description"', project.intro],
    ['property="og:url"', canonical],
    ['property="og:image"', new URL(project.cover.src, site.url).href]
  ]) document.querySelector(`meta[${selector}]`)?.setAttribute('content', value);
} else {
  document.title = 'Project unavailable | WIN DESIGN';
  content.innerHTML = '<section class="project-missing"><h1>Project unavailable.</h1><a href="/#portfolio">Back to portfolio</a></section>';
  const robots = document.createElement('meta');
  robots.name = 'robots';
  robots.content = 'noindex, follow';
  document.head.append(robots);
}
void Promise.all([import('../assets/js/main.js'), import('../assets/js/site-integration.js')]);
