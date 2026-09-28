// Modest image movement only. No smooth-scroll engine and no animation loop.
// The 3D Hero has its own unmodified scroll controller.
export function mediaOffset(top, height, viewportHeight) {
  const progress = Math.max(0, Math.min(1, (viewportHeight - top) / (viewportHeight + height)));
  return (progress - 0.5) * 16;
}

function initEditorial() {
  const media = [...document.querySelectorAll('.content-sheet .media-drift')];
  if (!media.length || !('IntersectionObserver' in window)) return;
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const active = new Set();
  let frame = 0;

  function render() {
    frame = 0;
    if (motion.matches || document.hidden) return;
    // Batch reads before writes, and visit only images near the viewport.
    const positions = [...active].map(element => {
      const rect = element.getBoundingClientRect();
      return [element, mediaOffset(rect.top, rect.height, window.innerHeight)];
    });
    positions.forEach(([element, offset]) => element.style.setProperty('--media-shift', `${offset.toFixed(2)}px`));
  }
  function schedule() {
    if (!frame && !motion.matches && !document.hidden) frame = requestAnimationFrame(render);
  }
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => entry.isIntersecting ? active.add(entry.target) : active.delete(entry.target));
    schedule();
  }, {rootMargin: '80px'});
  media.forEach(element => observer.observe(element));
  window.addEventListener('scroll', schedule, {passive:true});
  window.addEventListener('resize', schedule, {passive:true});
  document.addEventListener('visibilitychange', schedule);
  motion.addEventListener('change', () => {
    if (motion.matches) {
      cancelAnimationFrame(frame);
      frame = 0;
      media.forEach(element => element.style.removeProperty('--media-shift'));
    } else schedule();
  });
}
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initEditorial);
  else initEditorial();
}
