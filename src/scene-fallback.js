export function activateSceneFallback(document, error) {
  document.body.classList.add('scene-fallback');
  document.querySelector('#loading')?.classList.add('is-complete');
  const panel = document.querySelector('#error');
  if (error) {
    document.querySelector('#error-detail').textContent = error.message || String(error);
    panel.hidden = false;
  }
  // Keep the same cutaway composition and project CTA; only the WebGL layer
  // disappears. Never fall back to an unrelated full-screen photograph.
  document.querySelector('#viewer')?.setAttribute('aria-hidden', 'true');
}
