// Gilding is confined to physical cut edges and the case's perimeter. Printed
// leaf faces and the cover's single print master are never painted over.
function foilGrain(THREE) {
  const width = 128, height = 64;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const value = Math.round(224 + 16 * Math.sin(y * 2.399) + 5 * Math.sin(x * .71 + y * .19));
    pixels.set([value, value, value, 255], (y * width + x) * 4);
  }
  const texture = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  texture.name = 'Fine burnished gold roughness';
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

function edgeSurface(THREE, stack) {
  const source = stack.geometry, position = source.attributes.position;
  const normal = source.attributes.normal, indices = source.index.array;
  const retained = [], points = [], normals = [], uv = [];
  // Use the real exported cut faces; do not lay a second coplanar skin over
  // them. This also leaves the upper/bottom stack surfaces as uncoated paper.
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = [indices[i], indices[i + 1], indices[i + 2]];
    const head = triangle.every(index => Math.abs(position.getY(index) - .65) < 1e-5);
    const tail = triangle.every(index => Math.abs(position.getY(index) + .65) < 1e-5);
    const fore = triangle.every(index => Math.abs(Math.abs(position.getX(index)) - 1) < 1e-5);
    if (!head && !tail && !fore) { retained.push(...triangle); continue; }
    for (const index of triangle) {
      const x = position.getX(index), y = position.getY(index), z = position.getZ(index);
      points.push(x, y, z);
      normals.push(normal.getX(index), normal.getY(index), normal.getZ(index));
      uv.push(fore ? (y + .65) / 1.3 : Math.abs(x), (z - .0078) / .026);
    }
  }
  source.setIndex(retained);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return geometry;
}

function roundedOutline(path, x0, x1, y0, y1, radius) {
  path.moveTo(x0 + radius, y0);
  path.lineTo(x1 - radius, y0);
  path.quadraticCurveTo(x1, y0, x1, y0 + radius);
  path.lineTo(x1, y1 - radius);
  path.quadraticCurveTo(x1, y1, x1 - radius, y1);
  path.lineTo(x0 + radius, y1);
  path.quadraticCurveTo(x0, y1, x0, y1 - radius);
  path.lineTo(x0, y0 + radius);
  path.quadraticCurveTo(x0, y0, x0 + radius, y0);
  return path;
}

function coverRing(THREE, side, inset, lineWidth, depth, z) {
  const sign = side === 'Left' ? -1 : 1;
  const x0 = (sign < 0 ? -1.033 : .011) + inset;
  const x1 = (sign < 0 ? -.011 : 1.033) - inset;
  const y0 = -.681 + inset, y1 = .681 - inset;
  const shape = roundedOutline(new THREE.Shape(), x0, x1, y0, y1, .004);
  const hole = roundedOutline(new THREE.Path(), x0 + lineWidth, x1 - lineWidth,
    y0 + lineWidth, y1 - lineWidth, .002);
  shape.holes.push(hole);
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, steps: 1,
    bevelEnabled: true, bevelThickness: .00022, bevelSize: .00022,
    bevelSegments: 2, curveSegments: 4 });
  geometry.translate(0, 0, z);
  return geometry;
}

/** Call after the GLB meshes have been baked into book coordinates and parented.
 * Register returned flexibleMeshes with BookCurl.bindingMeshes; all additions
 * are already appended to meshes for the existing disposal/material lifecycle.
 */
export function applyBookGilding(THREE, meshes) {
  const grain = foilGrain(THREE);
  const gold = new THREE.MeshStandardMaterial({ name: 'Burnished 23K paper-edge gold',
    color: 0xd9a849, metalness: 1, roughness: .27, roughnessMap: grain,
    envMapIntensity: 1.9 });
  const polished = new THREE.MeshStandardMaterial({ name: 'Polished case-edge gold',
    color: 0xe7bd65, metalness: 1, roughness: .22, envMapIntensity: 1.9 });
  const grooves = new THREE.MeshStandardMaterial({ name: 'Gilded interleaf seams',
    color: 0xb18a42, metalness: .95, roughness: .43,
    envMapIntensity: 1.4, side: THREE.DoubleSide });
  const replaced = new Set(), added = [], flexibleMeshes = [];
  const find = name => meshes.find(mesh => mesh.name === name);
  const replace = (mesh, material) => {
    if (!mesh) return;
    replaced.add(mesh.material); mesh.material = material;
  };
  const add = (name, geometry, material, parent) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = name;
    // Submillimetre foil does not cast a second shadow on its own paper/board.
    mesh.receiveShadow = true; mesh.castShadow = false;
    parent.add(mesh); added.push(mesh);
    return mesh;
  };
  for (const side of ['Left', 'Right']) {
    const stack = find('Book_Stack_' + side), cover = find('Book_Cover_' + side);
    if (stack) add('Book_Gilded_Stack_' + side, edgeSurface(THREE, stack), gold, stack.parent);
    replace(find('Book_EdgeLines_' + side), grooves);
    if (!cover) continue;
    // Visible gilt on the board thickness, plus a narrow, softly bevelled
    // traditional rule at the outside cover margin, clear of all print.
    add('Book_Gilded_Case_Edge_' + side,
      coverRing(THREE, side, -.0003, .0015, .0036, -.0033), polished, cover.parent);
    add('Book_Gilded_Cover_Rule_' + side,
      coverRing(THREE, side, .014, .0036, .00040, -.0101), polished, cover.parent);
  }
  replace(find('Book_Active_Edge'), gold);
  replace(find('Book_Headband_Head'), grooves);
  replace(find('Book_Headband_Tail'), grooves);
  const spine = find('Book_Spine');
  if (spine) for (const [label, center] of [['Head', .548], ['Tail', -.548]]) {
    const geometry = spine.geometry.clone(), position = geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      // The bands wrap the curved spine, including at intermediate cover poses.
      // Radial clearance prevents overlap with the existing cloth wrapper.
      const x = position.getX(i), z = position.getZ(i) - .042;
      const radius = Math.hypot(x, z), scale = (radius + .00035) / radius;
      position.setXYZ(i, x * scale, center + position.getY(i) * .006 / 1.356, .042 + z * scale);
    }
    const band = add('Book_Gilded_Spine_' + label, geometry, polished, spine.parent);
    band.userData = { ...spine.userData, bindingRest: position.array.slice() };
    position.setUsage(THREE.DynamicDrawUsage);
    band.frustumCulled = false;
    flexibleMeshes.push(band);
  }
  meshes.push(...added);
  for (const material of replaced) if (!meshes.some(mesh => mesh.material === material)) material.dispose();
  return { flexibleMeshes };
}
