// A pure, reversible construction timeline. No elapsed-time animation state.
export const clamp01 = value => Math.min(1, Math.max(0, value));
export const smooth = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

export function storyState(progress, reducedMotion = false) {
  const p = clamp01(progress);
  if (reducedMotion) return { space: 0, local: 1, blend: 0, progress: p };
  // Clean, completed presentation on either side of a brief dissolve.
  const blend = smooth((p - .475) / .05);
  const space = p < .5 ? 0 : 1;
  const local = space === 0 ? clamp01(p / .475) : clamp01((p - .525) / .475);
  return { space, local, blend, progress: p };
}

export function headline(space, local) {
  if (space === 0) {
    if (local < .28) return ['01 / Living + Kitchen', 'From structure.', 'A new way to live.'];
    if (local < .88) return ['01 / Living + Kitchen', 'Into living.', 'Crafted in every detail.'];
    return ['01 / Living + Kitchen', 'Made yours.', 'Interior · Carpentry · Built for living'];
  }
  if (local < .28) return ['02 / Bedroom', 'Room to begin.', 'A quieter kind of space.'];
  if (local < .88) return ['02 / Bedroom', 'Made to belong.', 'Material. Craft. Calm.'];
  return ['02 / Bedroom', 'Rest, considered.', 'A space to call your own.'];
}
