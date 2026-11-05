export const unit = value => Math.min(1, Math.max(0, value));

// Integrate the tangent of an inextensible paper ribbon. Its free edge tracks
// the drag, while its spine remains fixed. Different rows introduce a restrained
// diagonal fold when a corner is grabbed; this is not a rigid page rotation.
export function paperRow(progress, row, corner, segments, destinationAngle = 0) {
  const p = unit(progress + Math.sin(Math.PI * progress) * corner * (row - .5) * .11);
  const bend = 1.9 * Math.sin(Math.PI * p);
  const tangents = [];
  let cosine = 0, sine = 0;
  for (let i = 0; i < segments; i++) {
    const angle = bend * (Math.pow((i + .5) / segments, 1.55) - .38);
    tangents.push(angle);
    cosine += Math.cos(angle) / segments;
    sine += Math.sin(angle) / segments;
  }
  const radius = Math.hypot(cosine, sine);
  // Solve the ribbon's orientation from its moving edge, including a raised
  // destination stack. Rotating an already-curled sheet late in the gesture
  // makes its edge reverse direction; solving here keeps the edge continuous.
  // Zero preserves the flat-spread solution and its exact x = 1 - 2p mapping.
  const landing = Math.max(0, Math.min(Math.PI / 2, destinationAngle));
  const edgeX = 1 - (1 + Math.cos(landing)) * p;
  const base = Math.acos(Math.min(1, Math.max(-1, edgeX / radius))) - Math.atan2(sine, cosine);
  const points = [{ x: 0, z: 0 }];
  let x = 0, z = 0;
  for (const angle of tangents) {
    x += Math.cos(base + angle) / segments;
    z += Math.sin(base + angle) / segments;
    points.push({ x, z: Math.max(0, z) });
  }
  return points;
}

// Velocity is measured in turns/second. A brief pull settles back, an intentional
// flick carries forward, and reversing the drag changes the release decision.
export function releaseTarget(progress, velocity) {
  if (velocity < -.35 && progress < .85) return 0;
  if (velocity > .45 && progress > .10) return 1;
  return progress > .48 ? 1 : 0;
}

export function springStep(position, velocity, target, seconds, hardcover = false) {
  const dt = Math.min(seconds, 1 / 30);
  // A heavier case settles more deliberately than a leaf. Both profiles are
  // critically damped: no decorative bounce, and no time integration while held.
  const stiffness = hardcover ? 166 : 210, damping = hardcover ? 26 : 29;
  const nextVelocity = velocity + ((target - position) * stiffness - velocity * damping) * dt;
  return { position: unit(position + nextVelocity * dt), velocity: nextVelocity };
}
