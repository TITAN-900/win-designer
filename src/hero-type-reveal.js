// Three shared text layers, only while a headline changes. There are no
// character/particle nodes and no persistent animation frame loop.
export const TYPE_REVEAL_MS = 720;
export const TYPE_REVEAL_EASING = 'cubic-bezier(.32,0,.18,1)';

export function scanFrames(kind) {
  if (kind === 'outgoing') return [
    { clipPath: 'inset(0 0% 0 0%)', transform: 'translateX(0)' },
    { clipPath: 'inset(0 0% 0 100%)', transform: 'translateX(.012em)' }
  ];
  if (kind === 'incoming') return [
    { clipPath: 'inset(0 100% 0 0%)', transform: 'translateX(-.012em)' },
    { clipPath: 'inset(0 0% 0 0%)', transform: 'translateX(0)' }
  ];
  return [
    { clipPath: 'inset(0 100% 0 0%)', transform: 'translateY(.025em)', offset: 0 },
    { clipPath: 'inset(0 88% 0 5%)', transform: 'translateY(.015em)', offset: .1 },
    { clipPath: 'inset(0 0% 0 100%)', transform: 'translateY(0)', offset: 1 }
  ];
}

export class HeroTypeReveal {
  constructor(heading, { reducedMotion = () => false } = {}) {
    this.heading = heading;
    this.reducedMotion = reducedMotion;
    this.text = heading.textContent.trim();
    this.animations = [];
    this.version = 0;
    this.disposed = false;
    const document = heading.ownerDocument;
    this.layers = ['outgoing', 'incoming', 'trace'].map(kind => {
      const layer = document.createElement('span');
      layer.className = `hero-type-layer hero-type-${kind}`;
      layer.setAttribute('aria-hidden', 'true');
      return layer;
    });
    heading.replaceChildren(...this.layers);
    heading.classList.add('hero-type-reveal');
    this.settle();
  }

  settle() {
    this.animations.forEach(animation => animation.cancel());
    this.animations = [];
    this.layers[0].textContent = '';
    this.layers[1].textContent = this.text;
    this.layers[2].textContent = '';
    this.heading.setAttribute('aria-label', this.text);
    this.heading.dataset.typeState = 'still';
  }

  show(text) {
    if (this.disposed) return;
    if (text === this.text) {
      if (this.reducedMotion() && this.animations.length) {
        ++this.version;
        this.settle();
      }
      return;
    }
    const previous = this.text;
    const version = ++this.version;
    this.text = text;
    this.settle();
    // Reduced motion and browsers without WAAPI retain exactly one readable
    // heading. Neither path depends on the WebGL renderer succeeding.
    if (this.reducedMotion() || typeof this.layers[0].animate !== 'function') return;
    this.layers[0].textContent = previous;
    this.layers[2].textContent = text;
    this.heading.dataset.typeState = 'scanning';
    this.animations = this.layers.map((layer, i) => layer.animate(
      scanFrames(['outgoing', 'incoming', 'trace'][i]),
      { duration: TYPE_REVEAL_MS, easing: TYPE_REVEAL_EASING, fill: 'both' }
    ));
    this.animations[1].finished.then(() => {
      if (!this.disposed && this.version === version) this.settle();
    }).catch(() => { /* superseded reveal / pagehide cancels the short sweep */ });
  }

  dispose() {
    if (this.disposed) return;
    ++this.version;
    this.disposed = true;
    this.settle();
  }
}
