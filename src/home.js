import '../assets/data/projects.js';
import '../assets/js/main.js';
import '../assets/js/site-integration.js';
import '../assets/js/editorial.js';

// Keep the editorial site interactive immediately while the high-quality 3D
// renderer downloads as a separate production chunk.
import { activateSceneFallback } from './scene-fallback.js';

const viewer = document.querySelector('#viewer');
const errorPanel = document.querySelector('#error');
const fallbackObserver = new MutationObserver(() => {
  if (!errorPanel.hidden) {
    activateSceneFallback(document);
    fallbackObserver.disconnect();
  } else if (viewer.dataset.loaded === 'true') {
    document.body.classList.add('scene-ready');
    fallbackObserver.disconnect();
  }
});
fallbackObserver.observe(errorPanel, { attributes: true, attributeFilter: ['hidden'] });
fallbackObserver.observe(viewer, { attributes: true, attributeFilter: ['data-loaded'] });

function loadInterior() {
  void import('./diorama.js').catch(error => {
    console.error('Interior initialization failed:', error);
    activateSceneFallback(document, error);
    fallbackObserver.disconnect();
  });
}

// Paint the navigation and matching diorama poster before loading Three.js.
requestAnimationFrame(() => requestAnimationFrame(() => {
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadInterior, { timeout: 800 });
  } else {
    window.setTimeout(loadInterior, 0);
  }
}));
