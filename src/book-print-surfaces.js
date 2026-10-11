import * as THREE from 'three';

// The book and shadow receiver occupy camera depths of roughly 5–8 units.
// Keeping the clipping planes around that volume preserves thin-leaf depth
// precision on mobile GPUs without changing the projection or composition.
export const BOOK_CAMERA_NEAR = 3;
export const BOOK_CAMERA_FAR = 12;

export function createPaperMaterial() {
  // Front and reverse are separate, oppositely wound physical faces. Drawing
  // both sides of both meshes lets the hidden ink compete at grazing angles.
  return new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: .86, metalness: 0,
    side: THREE.FrontSide, polygonOffset: false
  });
}

export function prepareCoverPrint(board, print) {
  if (!board?.geometry || !print?.geometry) {
    throw new Error('The book is missing its front board or printed surface.');
  }
  const geometry = board.geometry;
  const position = geometry.getAttribute('position');
  const index = geometry.getIndex();
  if (!index || geometry.groups.length > 1) {
    throw new Error('The front board requires one indexed material surface.');
  }
  geometry.computeBoundingBox();
  print.geometry.computeBoundingBox();
  const outerZ = geometry.boundingBox.min.z;
  const printBounds = print.geometry.boundingBox;
  const gap = outerZ - printBounds.max.z;
  const tolerance = 1e-7;
  if (gap < 0 || gap > .001 || printBounds.max.z - printBounds.min.z > tolerance) {
    throw new Error('The cover print must conform to the outer front board.');
  }

  const kept = [];
  let removedTriangles = 0;
  for (let i = 0; i < index.count; i += 3) {
    const vertices = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const planar = vertices.every(vertex => Math.abs(position.getZ(vertex) - outerZ) < tolerance);
    const [a, b, c] = vertices;
    const normalZ = (position.getX(b) - position.getX(a)) * (position.getY(c) - position.getY(a))
      - (position.getY(b) - position.getY(a)) * (position.getX(c) - position.getX(a));
    if (planar && normalZ < 0) {
      if (!vertices.every(vertex => position.getX(vertex) >= printBounds.min.x - tolerance
        && position.getX(vertex) <= printBounds.max.x + tolerance
        && position.getY(vertex) >= printBounds.min.y - tolerance
        && position.getY(vertex) <= printBounds.max.y + tolerance)) {
        throw new Error('The print does not cover the exterior board face.');
      }
      removedTriangles++;
    } else kept.push(...vertices);
  }
  if (!removedTriangles) throw new Error('The exterior front-board surface was not found.');

  // Thirty microns separated the original two opaque surfaces: about ONE
  // 24-bit depth step with the old camera. A single exterior surface removes
  // the cause rather than moving the ink toward the camera or disabling depth.
  geometry.setIndex(kept);
  geometry.setDrawRange(0, kept.length);
  if (geometry.groups.length) geometry.groups[0].count = kept.length;
  // The complete board still supplies the cover silhouette's shadow. The ink
  // must not cast a duplicate, near-coplanar shadow onto its own carrier.
  print.castShadow = false;
  return removedTriangles;
}
