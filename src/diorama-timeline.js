// A pure, reversible construction timeline. No elapsed-time animation state.
export const clamp01 = value => Math.min(1, Math.max(0, value));
export const smooth = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

// GLTFLoader normalizes Blender object names by replacing spaces with underscores.
export const isShellCore = name => /structural|back wall|left .*pier|window .*wall|window head/i.test(name.replaceAll('_', ' '));

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
    if (local < .28) return ['01 / Living + Kitchen', 'From structure.', 'Structure · Space'];
    if (local < .88) return ['01 / Living + Kitchen', 'Into living.', 'Joinery · Material'];
    return ['01 / Living + Kitchen', 'Made yours.', 'Ready for living'];
  }
  if (local < .28) return ['02 / Bedroom', 'Room to begin.', 'Space · Light'];
  if (local < .88) return ['02 / Bedroom', 'Made to belong.', 'Timber · Linen'];
  return ['02 / Bedroom', 'Rest, considered.', 'A quiet retreat'];
}
