// The case spine is authored as a hollow curved ribbon in Blender. Its two
// ends attach to the actual inside edges of the back and front cover boards.
// Rest positions retain each vertex's radius (including the 1.4 mm wrapper),
// while UV.u records its position along the flexible binding cross-section.
export const BINDING_HINGE = .042;
export const SPINE_ANCHOR_X = .014;
export const SPINE_ANCHOR_Z = -.009;

export function bindingPoint(u, angle, radius, anchorX = SPINE_ANCHOR_X,
  anchorZ = SPINE_ANCHOR_Z) {
  const right = Math.atan2(anchorZ - BINDING_HINGE, anchorX);
  const left = Math.atan2(anchorZ - BINDING_HINGE, -anchorX);
  const theta = right + Math.max(0, Math.min(1, u)) * (left - angle - right);
  return { x: Math.cos(theta) * radius,
    z: BINDING_HINGE + Math.sin(theta) * radius };
}

export function bindingRadius(x, z) {
  return Math.hypot(x, z - BINDING_HINGE);
}
