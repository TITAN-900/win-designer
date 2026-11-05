export const OPEN_ANGLE = .035;
export const COVER_HINGE = .042;

// Both halves of the original physical book stay present. The left front board,
// endpaper and leaf block close over the right block around a raised binding axis.
export function coverPose(progress) {
  const p = Math.max(0, Math.min(1, progress));
  const angle = Math.PI + (OPEN_ANGLE - Math.PI) * p;
  return { angle, x: -COVER_HINGE * Math.sin(angle),
    z: COVER_HINGE * (1 - Math.cos(angle)) };
}
