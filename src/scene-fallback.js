export function activateSceneFallback(document, error) {
  document.body.classList.add('scene-fallback');
  document.querySelector('#loading')?.classList.add('is-complete');
  const panel = document.querySelector('#error');
  if (error) {
    document.querySelector('#error-detail').textContent = error.message || String(error);
    panel.hidden = false;
  }
  const cue = document.querySelector('.scroll-cue');
  if (cue) {
    cue.href = '#about-home';
    cue.innerHTML = 'EXPLORE THE SITE <span aria-hidden="true">↓</span>';
  }
}
