// A fixed-duration, time-driven loop. Page scrolling never enters this state.
export const clamp01 = value => Math.min(1, Math.max(0, value));
export const smooth = value => {
  const p = clamp01(value);
  return p * p * (3 - 2 * p);
};

export const SEQUENCE = Object.freeze({ build: 7600, daylight: 2400, hold: 2600, transition: 1800 });
export const ROOM_MS = SEQUENCE.build + SEQUENCE.daylight + SEQUENCE.hold + SEQUENCE.transition;
export const CYCLE_MS = 2 * ROOM_MS;

// GLTFLoader normalizes Blender object names by replacing spaces with underscores.
export const isShellCore = name => /structural|back wall|left .*pier|window .*wall|window head/i.test(name.replaceAll('_', ' '));

export function loopState(elapsedMs, reducedMotion = false) {
  if (reducedMotion) return {
    phase: 'reduced', space: 0, from: 0, to: 0,
    firstLocal: 1, secondLocal: 0, firstLight: 1, secondLight: 0,
    blend: 0, progress: 1, cycle: 0
  };
  const cycle = Math.floor(Math.max(0, elapsedMs) / CYCLE_MS);
  const loopTime = ((elapsedMs % CYCLE_MS) + CYCLE_MS) % CYCLE_MS;
  const from = Math.floor(loopTime / ROOM_MS);
  const time = loopTime - from * ROOM_MS;
  const { build, daylight, hold, transition } = SEQUENCE;
  const phase = time < build ? 'build' : time < build + daylight ? 'daylight'
    : time < build + daylight + hold ? 'hold' : 'transition';
  const local = phase === 'build' ? smooth(time / build) : 1;
  const light = clamp01((time - build) / daylight);
  const blend = phase === 'transition' ? smooth((time - build - daylight - hold) / transition) : 0;
  return {
    phase, from, to: phase === 'transition' ? 1 - from : from,
    space: blend < .5 ? from : 1 - from,
    firstLocal: from === 0 ? local : 0, secondLocal: from === 1 ? local : 0,
    firstLight: from === 0 ? light : 0, secondLight: from === 1 ? light : 0,
    blend, progress: loopTime / CYCLE_MS, cycle
  };
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
