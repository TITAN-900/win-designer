import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

const SINK = 'JOINERY_Island inset sink dark well';
const FAUCET = 'JOINERY_Island faucet arch';
const EPSILON = 1e-5;
const digest = value => createHash('sha256').update(value).digest('hex');

function readGLB(buffer) {
  assert.equal(buffer.readUInt32LE(0), 0x46546c67);
  assert.equal(buffer.readUInt32LE(4), 2);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  let json, binary;
  for (let offset = 12; offset < buffer.length;) {
    const length = buffer.readUInt32LE(offset);
    const type = buffer.readUInt32LE(offset + 4);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'));
    if (type === 0x004e4942) binary = data;
    offset += length + 8;
  }
  assert.ok(json && binary);
  const componentBytes = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
  const components = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  function accessorBytes(index) {
    const accessor = json.accessors[index];
    assert.equal(accessor.sparse, undefined);
    const view = json.bufferViews[accessor.bufferView];
    const size = componentBytes[accessor.componentType] * components[accessor.type];
    assert.ok(size > 0);
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
    const packed = Buffer.alloc(accessor.count * size);
    for (let i = 0; i < accessor.count; i++) {
      binary.copy(packed, i * size, offset + i * (view.byteStride || size), offset + i * (view.byteStride || size) + size);
    }
    return packed;
  }
  const objects = json.nodes.map(node => {
    const object = new THREE.Object3D();
    if (node.matrix) object.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    return object;
  });
  json.nodes.forEach((node, index) => node.children?.forEach(child => objects[index].add(objects[child])));
  const root = new THREE.Object3D();
  json.scenes[json.scene || 0].nodes.forEach(index => root.add(objects[index]));
  root.updateMatrixWorld(true);

  function geometry(name) {
    const index = json.nodes.findIndex(node => node.name === name);
    assert.ok(index >= 0, `Missing ${name}`);
    const mesh = json.meshes[json.nodes[index].mesh];
    const positions = [], triangles = [];
    for (const primitive of mesh.primitives) {
      assert.equal(primitive.mode ?? 4, 4);
      const accessor = json.accessors[primitive.attributes.POSITION];
      assert.equal(accessor.componentType, 5126);
      assert.equal(accessor.type, 'VEC3');
      const bytes = accessorBytes(primitive.attributes.POSITION);
      const start = positions.length;
      for (let i = 0; i < accessor.count; i++) {
        const point = new THREE.Vector3(bytes.readFloatLE(i * 12), bytes.readFloatLE(i * 12 + 4), bytes.readFloatLE(i * 12 + 8))
          .applyMatrix4(objects[index].matrixWorld);
        // Inspect in Blender coordinates: Z is height and +Y faces the stove.
        positions.push(new THREE.Vector3(point.x, -point.z, point.y));
      }
      const indices = json.accessors[primitive.indices];
      const indexBytes = accessorBytes(primitive.indices);
      const readers = { 5121: 'readUInt8', 5123: 'readUInt16LE', 5125: 'readUInt32LE' };
      assert.ok(readers[indices.componentType]);
      for (let i = 0; i < indices.count; i += 3) {
        triangles.push([0, 1, 2].map(j => start + indexBytes[readers[indices.componentType]]((i + j) * componentBytes[indices.componentType])));
      }
    }
    return { positions, triangles, bounds: new THREE.Box3().setFromPoints(positions) };
  }
  return { json, binary, accessorBytes, geometry };
}

const room = readGLB(readFileSync(new URL('../public/3d/space-01/win_space_01.glb', import.meta.url)));

// Recover the two actual open pipe rims from indexed triangles. Weld only seam
// duplicates, so a moved node or changed mesh cannot pass via stale accessor bounds.
function pipeEnds({ positions, triangles }) {
  const unique = [], welded = new Map();
  const ids = positions.map(point => {
    const key = point.toArray().map(value => Math.round(value / 1e-6)).join(',');
    if (!welded.has(key)) {
      welded.set(key, unique.length);
      unique.push(point);
    }
    return welded.get(key);
  });
  const edges = new Map();
  for (const triangle of triangles) {
    const face = triangle.map(index => ids[index]);
    for (let i = 0; i < 3; i++) {
      const edge = [face[i], face[(i + 1) % 3]].sort((a, b) => a - b);
      const key = edge.join(',');
      edges.set(key, (edges.get(key) || 0) + 1);
    }
  }
  const neighbors = new Map();
  for (const [edge, count] of edges) {
    assert.ok(count <= 2, 'Faucet must have manifold pipe surfaces');
    if (count !== 1) continue;
    const [a, b] = edge.split(',').map(Number);
    for (const [from, to] of [[a, b], [b, a]]) {
      if (!neighbors.has(from)) neighbors.set(from, []);
      neighbors.get(from).push(to);
    }
  }
  assert.ok(neighbors.size > 0, 'Faucet has measurable open inlet/outlet rims');
  for (const adjacent of neighbors.values()) assert.equal(adjacent.length, 2);
  const remaining = new Set(neighbors.keys()), centers = [];
  while (remaining.size) {
    const pending = [remaining.values().next().value], ring = [];
    while (pending.length) {
      const vertex = pending.pop();
      if (!remaining.delete(vertex)) continue;
      ring.push(unique[vertex]);
      pending.push(...neighbors.get(vertex));
    }
    assert.ok(ring.length >= 8, 'Pipe end retains a round section');
    centers.push({ center: ring.reduce((center, point) => center.add(point), new THREE.Vector3()).divideScalar(ring.length), ring });
  }
  assert.equal(centers.length, 2);
  return centers.sort((a, b) => a.center.z - b.center.z);
}

function near(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < EPSILON, `${label}: ${actual} vs ${expected}`);
}

test('island sink rests on its countertop and remains accessible from the stove aisle', () => {
  const sink = room.geometry(SINK).bounds;
  const top = room.geometry('JOINERY_Island stone waterfall top').bounds;
  const stove = room.geometry('JOINERY_Back run stone countertop').bounds;
  const center = sink.getCenter(new THREE.Vector3());
  near(sink.min.z, top.max.z, 'Basin underside touches stone');
  near(center.x, -1.91, 'Original basin lateral position');
  near(center.y, .60, 'Original basin depth position');
  near(sink.max.x - sink.min.x, .53, 'Original basin width');
  near(sink.max.y - sink.min.y, .35, 'Original basin depth');
  assert.ok(stove.min.y - top.max.y > 1, 'Working aisle remains between stove and island');
  assert.ok(top.max.y > sink.max.y && top.max.y - sink.max.y < .20, 'Basin rim is within 20cm of working edge');
  assert.ok(top.max.y - center.y < center.y - top.min.y, 'Basin is nearer the working edge than the seating edge');
  for (const number of [1, 2]) {
    const stool = room.geometry(`FURN_Island stool pedestal ${number}`).bounds;
    assert.ok(stool.max.y < top.min.y, 'Stools remain on the opposite side of the island');
  }
});

test('faucet mounts on the far rim with its outlet centered over the basin toward the worker', () => {
  const sink = room.geometry(SINK).bounds;
  const top = room.geometry('JOINERY_Island stone waterfall top').bounds;
  const center = sink.getCenter(new THREE.Vector3());
  const [{ center: base }, { center: outlet, ring: outletRing }] = pipeEnds(room.geometry(FAUCET));
  near(base.z, top.max.z, 'Faucet inlet touches stone');
  assert.ok(base.y < sink.min.y - .016, 'Faucet base clears basin on the far rim');
  assert.ok(base.y > top.min.y + .016 && base.x > top.min.x + .016 && base.x < top.max.x - .016, 'Faucet is supported by the countertop');
  near(outlet.x, center.x, 'Outlet centered across basin');
  near(outlet.y, center.y, 'Outlet centered across basin depth');
  near(Math.max(...outletRing.map(point => point.z)), Math.min(...outletRing.map(point => point.z)),
    'Outlet faces straight down so the stream lands at the basin center');
  assert.ok(outlet.y > base.y, 'Spout points from seating side toward the working aisle');
  assert.ok(outlet.z > sink.max.z + .20 && outlet.z < sink.max.z + .35, 'Outlet retains usable basin clearance');
});

function protectedFingerprints({ json, binary, accessorBytes }) {
  const fingerprint = value => digest(JSON.stringify(value));
  const nodes = json.nodes.map(node => {
    const result = { ...node };
    if (node.mesh !== undefined) result.mesh = json.meshes[node.mesh].name;
    if (node.children) result.children = node.children.map(index => json.nodes[index].name);
    if (node.name === SINK || node.name === FAUCET) {
      delete result.translation;
      delete result.rotation;
      delete result.scale;
      delete result.matrix;
    }
    return result;
  }).sort((a, b) => a.name.localeCompare(b.name));
  function accessorSignature(index) {
    const { componentType, count, type, normalized } = json.accessors[index];
    return { componentType, count, type, normalized, data: digest(accessorBytes(index)) };
  }
  const meshes = json.meshes.map(mesh => ({
    ...mesh,
    primitives: mesh.primitives.map(primitive => ({
      ...primitive,
      attributes: Object.fromEntries(Object.entries(primitive.attributes).sort().map(([name, index]) => {
        const signature = accessorSignature(index);
        // Only the faucet's positions and normals change; retain its topology,
        // UVs and material assignment along with every other complete mesh.
        if (mesh.name === FAUCET && ['POSITION', 'NORMAL'].includes(name)) delete signature.data;
        return [name, signature];
      })),
      indices: accessorSignature(primitive.indices),
      material: json.materials[primitive.material].name,
    })),
  })).sort((a, b) => a.name.localeCompare(b.name));
  const images = json.images.map(({ bufferView, ...image }) => {
    const view = json.bufferViews[bufferView];
    return { ...image, data: digest(binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength)) };
  });
  return {
    nodes: fingerprint({ nodes, scene: json.scene, scenes: json.scenes, cameras: json.cameras, animations: json.animations, extensions: json.extensions }),
    geometry: fingerprint(meshes),
    materials: fingerprint({ materials: json.materials, textures: json.textures, samplers: json.samplers }),
    images: fingerprint(images),
  };
}

test('sink correction preserves every other Space 01 mesh, stage, material and embedded image', () => {
  // Recorded from a826a4f30131f0fdb08661bcd7507c04c466ceb4 before this correction.
  // Semantic hashes ignore GLB byte offsets; the sink mesh is also protected.
  assert.deepEqual(protectedFingerprints(room), {
    nodes: '147836fba162fcea39daad4cb4d2fc3e9b867b125120c3fb2c17cb13d49ad9a4',
    geometry: '838849ae04d41b7a8e98de1a3e18758f36eeb7177b0eba082be33059870a1dae',
    materials: '4fb062bf0d070b0705c76ad3e8915931a1eab436f598cf447c486ca0283f8410',
    images: 'e4effc63509ca4b87b381f92210fdad4f8e334e5b53770be0f7ffcb61182863f',
  });
});
