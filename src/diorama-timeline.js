// A fixed-duration, time-driven loop. Page scrolling never enters this state.
export const clamp01 = value => Math.min(1, Math.max(0, value));
export const smooth = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

export const SEQUENCE = Object.freeze({ build: 7600, hold: 2400, transition: 1600 });
export const CYCLE_MS = 2 * (SEQUENCE.build + SEQUENCE.hold + SEQUENCE.transition);

// GLTFLoader normalizes Blender object names by replacing spaces with underscores.
export const isShellCore = name => /structural|back wall|left .*pier|window .*wall|window head/i.test(name.replaceAll('_', ' '));

export function loopState(elapsedMs, reducedMotion = false) {
  if (reducedMotion) return {
    phase: 'reduced', space: 0, from: 0, to: 0,
    firstLocal: 1, secondLocal: 0, blend: 0, progress: 1, cycle: 0
  };
  const cycle = Math.floor(Math.max(0, elapsedMs) / CYCLE_MS);
  let time = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const { build, hold, transition } = SEQUENCE;
  if (time < build) return {
    phase: 'build', space: 0, from: 0, to: 0,
    firstLocal: smooth(time / build), secondLocal: 0,
    blend: 0, progress: time / CYCLE_MS, cycle
  };
  time -= build;
  if (time < hold) return {
    phase: 'hold', space: 0, from: 0, to: 0,
    firstLocal: 1, secondLocal: 0, blend: 0,
    progress: (build + time) / CYCLE_MS, cycle
  };
  time -= hold;
  if (time < transition) {
    const blend = smooth(time / transition);
    return { phase: 'transition', space: blend < .5 ? 0 : 1,
      from: 0, to: 1, firstLocal: 1, secondLocal: 0, blend,
      progress: (build + hold + time) / CYCLE_MS, cycle };
  }
  time -= transition;
  if (time < build) return {
    phase: 'build', space: 1, from: 1, to: 1,
    firstLocal: 0, secondLocal: smooth(time / build), blend: 0,
    progress: (build + hold + transition + time) / CYCLE_MS, cycle
  };
  time -= build;
  if (time < hold) return {
    phase: 'hold', space: 1, from: 1, to: 1,
    firstLocal: 0, secondLocal: 1, blend: 0,
    progress: (2 * build + hold + transition + time) / CYCLE_MS, cycle
  };
  time -= hold;
  const blend = smooth(time / transition);
  return { phase: 'transition', space: blend < .5 ? 1 : 0,
    from: 1, to: 0, firstLocal: 0, secondLocal: 1, blend,
    progress: (2 * build + 2 * hold + transition + time) / CYCLE_MS, cycle };
}

export function headline(space, local) {
  if (space === 0) {
    if (local < .24) return ['01 / Living + Kitchen', 'From structure.', 'Structure · Space'];
    if (local < .86) return ['01 / Living + Kitchen', 'Into living.', 'Joinery · Material'];
    return ['01 / Living + Kitchen', 'Made yours.', 'Ready for living'];
  }
  if (local < .24) return ['02 / Bedroom', 'Room to begin.', 'Space · Light'];
  if (local < .86) return ['02 / Bedroom', 'Made to belong.', 'Timber · Linen'];
  return ['02 / Bedroom', 'Rest, considered.', 'A quiet retreat'];
}
