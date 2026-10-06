import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as zlib from 'node:zlib';

const read = path => readFileSync(new URL(`../${path}`, import.meta.url));
const glb = read('public/3d/book/portfolio_book.glb');
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8'));
const binary = glb.subarray(28 + jsonLength);
const manifest = JSON.parse(read('public/3d/book/portfolio_book.manifest.json'));
const partNames = [
  'Book_Cover_Left', 'Book_Cover_Right', 'Book_Endpaper_Left', 'Book_Endpaper_Right',
  'Book_Spine', 'Book_Binding', 'Book_Stack_Left', 'Book_Stack_Right',
  'Book_EdgeLines_Left', 'Book_EdgeLines_Right', 'Book_Page_Left', 'Book_Page_Right',
  'Book_Active_Front', 'Book_Active_Back', 'Book_Active_Edge',
];
const near = (actual, expected, label, epsilon = 2e-6) =>
  assert.ok(Math.abs(actual - expected) < epsilon, `${label}: ${actual} ≈ ${expected}`);

function accessor(index) {
  const a = gltf.accessors[index];
  const view = gltf.bufferViews[a.bufferView];
  const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
  const [bytes, method] = {
    5121: [1, 'readUInt8'], 5123: [2, 'readUInt16LE'],
    5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'],
  }[a.componentType];
  const offset = (view.byteOffset || 0) + (a.byteOffset || 0);
  const stride = view.byteStride || width * bytes;
  return Array.from({ length: a.count }, (_, i) =>
    Array.from({ length: width }, (_, j) => binary[method](offset + i * stride + j * bytes)));
}

function part(name) {
  const node = gltf.nodes.find(node => node.name === name);
  assert.ok(node, `Missing physical part: ${name}`);
  const primitives = gltf.meshes[node.mesh].primitives;
  assert.equal(primitives.length, 1, `${name}: one predictable draw call`);
  const primitive = primitives[0];
  return {
    node, primitive,
    position: accessor(primitive.attributes.POSITION),
    normal: accessor(primitive.attributes.NORMAL),
    uv: primitive.attributes.TEXCOORD_0 === undefined ? null : accessor(primitive.attributes.TEXCOORD_0),
    indices: accessor(primitive.indices).flat(),
  };
}

function bounds(points) {
  return {
    min: [0, 1, 2].map(axis => Math.min(...points.map(point => point[axis]))),
    max: [0, 1, 2].map(axis => Math.max(...points.map(point => point[axis]))),
  };
}

// Welding by coordinate is intentional: glTF splits vertices at hard normals
// and UV seams, while the physical object must still have a closed boundary.
function assertClosedOutward(parts, label, minVolume) {
  const edges = new Map();
  let volume = 0;
  const key = point => point.map(value => Math.round(value * 1e6)).join(',');
  for (const { position, indices } of parts) {
    for (let i = 0; i < indices.length; i += 3) {
      const points = indices.slice(i, i + 3).map(index => position[index]);
      const [a, b, c] = points;
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) +
                 a[1] * (b[2] * c[0] - b[0] * c[2]) +
                 a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
      for (let j = 0; j < 3; j++) {
        const from = key(points[j]), to = key(points[(j + 1) % 3]);
        const forward = from < to;
        const edgeKey = forward ? `${from}|${to}` : `${to}|${from}`;
        const edge = edges.get(edgeKey) || { count: 0, orientation: 0 };
        edge.count++;
        edge.orientation += forward ? 1 : -1;
        edges.set(edgeKey, edge);
      }
    }
  }
  assert.ok([...edges.values()].every(edge => edge.count === 2), `${label}: watertight after welding`);
  assert.ok([...edges.values()].every(edge => edge.orientation === 0), `${label}: consistent winding`);
  assert.ok(volume > minVolume, `${label}: positive physical volume (${volume})`);
}

test('book export is a self-contained GLB within the mobile resource budget', () => {
  assert.equal(glb.subarray(0, 4).toString(), 'glTF');
  assert.equal(glb.readUInt32LE(4), 2);
  assert.equal(glb.readUInt32LE(8), glb.length);
  assert.equal(glb.readUInt32LE(16), 0x4e4f534a);
  assert.equal(glb.readUInt32LE(24 + jsonLength), 0x004e4942);
  assert.ok(glb.length < 2 * 1024 * 1024);
  assert.equal(manifest.glb_bytes, glb.length);
  assert.equal(gltf.buffers.length, 1);
  assert.equal(gltf.buffers[0].uri, undefined);
  assert.equal(gltf.images?.length || 0, 0, 'photography is supplied by reusable canvas textures');
  assert.equal(gltf.animations?.length || 0, 0, 'turns are controlled by live geometry');
  assert.equal(gltf.skins?.length || 0, 0);
  assert.equal(gltf.cameras?.length || 0, 0);
  assert.ok(gltf.meshes.every(mesh => mesh.primitives.every(primitive => !primitive.targets)));
  const triangles = gltf.meshes.reduce((sum, mesh) => sum + mesh.primitives.reduce(
    (count, primitive) => count + gltf.accessors[primitive.indices].count / 3, 0), 0);
  assert.equal(triangles, manifest.total_triangles);
  assert.ok(triangles <= 25_000, `triangle budget: ${triangles}`);
});

test('all fifteen book parts stay independent, including both permanent stacks', () => {
  assert.deepEqual(gltf.nodes.map(node => node.name).sort(), [...partNames].sort());
  assert.equal(gltf.meshes.length, 15);
  assert.equal(new Set(gltf.nodes.map(node => node.mesh)).size, 15);
  assert.deepEqual([...manifest.permanent_meshes, ...manifest.active_meshes].sort(), [...partNames].sort());
  for (const side of ['Left', 'Right']) {
    const stack = part(`Book_Stack_${side}`);
    const range = bounds(stack.position);
    assert.ok(range.min[1] > 0 && range.max[1] - range.min[1] > .025);
    near(range.min[2], -.65, `${side} head`);
    near(range.max[2], .65, `${side} tail`);
    if (side === 'Left') assert.ok(range.max[0] < 0 && range.min[0] <= -.999);
    else assert.ok(range.min[0] > 0 && range.max[0] >= .999);
    assertClosedOutward([stack], `${side} stack`, .025);
  }
});

test('resting and active pages have continuous grids, useful UVs and the declared glTF axes', () => {
  for (const name of ['Book_Page_Left', 'Book_Page_Right', 'Book_Active_Front', 'Book_Active_Back']) {
    const page = part(name);
    assert.equal(page.position.length, 73 * 19, `${name}: dense deformable surface`);
    assert.equal(page.indices.length / 3, 72 * 18 * 2);
    assert.ok(page.indices.every(index => index >= 0 && index < page.position.length));
    const range = bounds(page.position);
    const left = name.endsWith('Left'), reverse = name.endsWith('Back');
    near(range.min[0], left ? -1 : 0, `${name} X min`);
    near(range.max[0], left ? 0 : 1, `${name} X max`);
    near(range.min[2], -.65, `${name} Z min`);
    near(range.max[2], .65, `${name} Z max`);
    assert.ok(range.max[1] - range.min[1] > .006, 'bound paper has a shaped gutter');
    assert.equal(new Set(page.uv.map(uv => uv[0].toFixed(6))).size, 73);
    assert.equal(new Set(page.uv.map(uv => uv[1].toFixed(6))).size, 19);
    for (let i = 0; i < page.position.length; i++) {
      const [x, height, z] = page.position[i], [u, v] = page.uv[i];
      near(u, left ? 1 + x : x, `${name} horizontal UV`);
      near(v, z / 1.3 + .5, `${name} top-to-bottom CanvasTexture UV`);
      assert.ok(height > .02 && height < .045);
      assert.ok(page.normal[i][1] * (reverse ? -1 : 1) > .85, `${name}: outward normal`);
    }
  }
});

test('the turning page has a closed thin rim and matching front/back UVs', () => {
  const front = part('Book_Active_Front'), back = part('Book_Active_Back'), edge = part('Book_Active_Edge');
  const uvKey = uv => uv.map(value => value.toFixed(6)).join(',');
  const reverse = new Map(back.uv.map((uv, i) => [uvKey(uv), back.position[i]]));
  for (let i = 0; i < front.position.length; i++) {
    const a = front.position[i], b = reverse.get(uvKey(front.uv[i]));
    assert.ok(b, 'every front sample has a corresponding reverse surface');
    near(a[0], b[0], 'front/back X');
    near(a[2], b[2], 'front/back Z');
    near(a[1] - b[1], manifest.page.thickness, 'actual paper thickness', 2e-8);
  }
  assert.equal(edge.position.length, 2 * (72 + 18) * 2);
  assert.equal(edge.indices.length / 3, 360);
  assertClosedOutward([front, back, edge], 'complete turning leaf', .0009);
});

test('exported book materials remain matte paper and cloth', () => {
  for (const material of gltf.materials) {
    assert.ok((material.pbrMetallicRoughness.roughnessFactor ?? 1) >= .9, material.name);
    assert.equal(material.pbrMetallicRoughness.metallicFactor, 0, material.name);
    assert.equal(material.alphaMode || 'OPAQUE', 'OPAQUE');
  }
});

test('editable source is a real Blender file and all four inspection renders are present', () => {
  const source = read('design/portfolio_book.blend');
  let header = source;
  if (source.readUInt32LE(0) === 0xfd2fb528) {
    assert.equal(typeof zlib.zstdDecompressSync, 'function', 'compressed Blender source validation requires Node 22.15+');
    // Blender writes separate Zstandard frames. The first contains its actual
    // file header; validating it catches placeholders and corrupt wrappers.
    header = zlib.zstdDecompressSync(source);
  } else if (source[0] === 0x1f && source[1] === 0x8b) header = zlib.gunzipSync(source);
  assert.equal(header.subarray(0, 7).toString(), 'BLENDER');
  assert.ok(source.length > 100_000);
  const hashes = new Set();
  for (const name of ['portfolio_book_preview', 'portfolio_book_curl_20_preview', 'portfolio_book_curl_preview', 'portfolio_book_curl_80_preview']) {
    const png = read(`design/${name}.png`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1400);
    assert.equal(png.readUInt32BE(20), 1050);
    assert.ok(png.length > 100_000);
    hashes.add(createHash('sha256').update(png).digest('hex'));
  }
  assert.equal(hashes.size, 4, 'neutral, early, middle and late poses have distinct renders');
});
