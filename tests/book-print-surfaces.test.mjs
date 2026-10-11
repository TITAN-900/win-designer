import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { BOOK_CAMERA_NEAR, BOOK_CAMERA_FAR, prepareCoverPrint, createPaperMaterial } from '../src/book-print-surfaces.js';
import { BookCurl } from '../src/book-curl.js';
import { coverPose } from '../src/book-cover-math.js';

const glb = readFileSync(new URL('../public/3d/book/portfolio_book.glb', import.meta.url));
const jsonLength = glb.readUInt32LE(12);
const gltf = JSON.parse(glb.toString('utf8', 20, 20 + jsonLength));
const binary = glb.subarray(28 + jsonLength);
function attribute(number) {
  const accessor = gltf.accessors[number], view = gltf.bufferViews[accessor.bufferView];
  const size = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[accessor.type];
  const [bytes, method] = { 5126: [4, 'readFloatLE'], 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'] }[accessor.componentType];
  const values = [];
  for (let i = 0; i < accessor.count; i++) for (let j = 0; j < size; j++) {
    values.push(binary[method]((view.byteOffset || 0) + (accessor.byteOffset || 0)
      + i * (view.byteStride || size * bytes) + j * bytes));
  }
  return new THREE.Float32BufferAttribute(values, size);
}
function mesh(name) {
  const node = gltf.nodes.find(value => value.name === name);
  const primitive = gltf.meshes[node.mesh].primitives[0];
  const geometry = new THREE.BufferGeometry();
  for (const [key, name] of [['POSITION', 'position'], ['NORMAL', 'normal'], ['TEXCOORD_0', 'uv']]) {
    if (primitive.attributes[key] !== undefined) geometry.setAttribute(name, attribute(primitive.attributes[key]));
  }
  geometry.setIndex([...attribute(primitive.indices).array]);
  const object = new THREE.Object3D();
  if (node.translation) object.position.fromArray(node.translation);
  if (node.rotation) object.quaternion.fromArray(node.rotation);
  if (node.scale) object.scale.fromArray(node.scale);
  object.updateMatrix();
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(object.matrix));
  const result = new THREE.Mesh(geometry, createPaperMaterial());
  result.name = name;
  result.userData.rest = geometry.attributes.position.array.slice();
  return result;
}
const point = (attribute, index) => new THREE.Vector3().fromBufferAttribute(attribute, index);

test('actual cover has one exterior print surface and preserves every bevel, rim and inner triangle', () => {
  const board = mesh('Book_Cover_Left'), print = mesh('Book_Cover_Print_Left');
  const positions = board.geometry.attributes.position.array.slice();
  const printUV = print.geometry.attributes.uv.array.slice();
  const indices = [...board.geometry.index.array];
  board.geometry.computeBoundingBox();
  const outerZ = board.geometry.boundingBox.min.z;
  const expectedKept = [], expectedRemoved = [];
  for (let i = 0; i < indices.length; i += 3) {
    const triangle = indices.slice(i, i + 3);
    (triangle.every(vertex => Math.abs(board.geometry.attributes.position.getZ(vertex) - outerZ) < 1e-7)
      ? expectedRemoved : expectedKept).push(...triangle);
  }
  const removed = prepareCoverPrint(board, print);
  assert.ok(removed > 0);
  assert.equal(removed, expectedRemoved.length / 3);
  assert.deepEqual([...board.geometry.index.array], expectedKept);
  assert.deepEqual(board.geometry.attributes.position.array, positions);
  assert.deepEqual(print.geometry.attributes.uv.array, printUV);
  assert.equal(print.castShadow, false);
  assert.ok(expectedKept.length > expectedRemoved.length, 'the complete thickness and rounded edges remain');
});

test('all cover UVs remain affine and continuous across the original triangulation', () => {
  const print = mesh('Book_Cover_Print_Left');
  const position = print.geometry.attributes.position, uv = print.geometry.attributes.uv;
  for (let i = 0; i < position.count; i++) {
    assert.ok(Math.abs(uv.getX(i) - (-.011 - position.getX(i)) / 1.022) < 1e-7);
    assert.ok(Math.abs(uv.getY(i) - (.681 - position.getY(i)) / 1.362) < 1e-7);
  }
});

test('closed and intermediate cover positions expose the complete printed face without an occluding carrier', () => {
  const board = mesh('Book_Cover_Left'), print = mesh('Book_Cover_Print_Left');
  prepareCoverPrint(board, print);
  const wing = new THREE.Group(); wing.add(board, print);
  const raycaster = new THREE.Raycaster();
  let checked = 0;
  for (const cameraX of [.4, .52]) for (let step = 0; step <= 100; step += 2) {
    const pose = coverPose(step / 100);
    wing.rotation.y = pose.angle; wing.position.set(pose.x, 0, pose.z); wing.updateMatrixWorld(true);
    const origin = new THREE.Vector3(cameraX, -.8, 7);
    const outward = new THREE.Vector3(0, 0, -1).transformDirection(wing.matrixWorld);
    const middle = new THREE.Vector3(-.52, 0, -.00903).applyMatrix4(wing.matrixWorld);
    if (outward.dot(origin.clone().sub(middle)) < .1) continue;
    for (const u of [.115, .16, .24, .35, .5, .72, .82]) for (const v of [.092, .125, .35, .45, .59, .661, .71, .892]) {
      const target = new THREE.Vector3(-.011 - 1.022 * u, .681 - 1.362 * v, -.00903).applyMatrix4(wing.matrixWorld);
      raycaster.set(origin, target.clone().sub(origin).normalize());
      const hit = raycaster.intersectObjects([print, board], false)[0];
      assert.equal(hit?.object, print, `printed area u=${u},v=${v}, cover=${step}%`);
      checked++;
    }
  }
  assert.ok(checked > 2000);
});

test('tight camera clipping contains every cover pose and improves thin-paper depth precision', () => {
  const camera = new THREE.PerspectiveCamera(25, 1, BOOK_CAMERA_NEAR, BOOK_CAMERA_FAR);
  const cover = mesh('Book_Cover_Left');
  for (const cameraY of [0, -.8]) for (let i = 0; i <= 100; i++) {
    const pose = coverPose(i / 100), center = cameraY ? .4 : .52 * (1 - i / 100);
    camera.position.set(center, cameraY, 7); camera.lookAt(center, 0, 0); camera.updateMatrixWorld();
    const transform = new THREE.Matrix4().makeRotationY(pose.angle).setPosition(pose.x, 0, pose.z);
    for (let vertex = 0; vertex < cover.geometry.attributes.position.count; vertex++) {
      const depth = -point(cover.geometry.attributes.position, vertex).applyMatrix4(transform).applyMatrix4(camera.matrixWorldInverse).z;
      assert.ok(depth > BOOK_CAMERA_NEAR && depth < BOOK_CAMERA_FAR);
    }
  }
  const depth = (distance, near, far) => far / (far - near) - far * near / ((far - near) * distance);
  const precision = (near, far) => (depth(7, near, far) - depth(7 - .00072, near, far)) * 65536;
  assert.ok(precision(BOOK_CAMERA_NEAR, BOOK_CAMERA_FAR) > 3, 'real leaf thickness exceeds three 16-bit steps');
  assert.ok(precision(BOOK_CAMERA_NEAR, BOOK_CAMERA_FAR) > precision(.1, 30) * 30);
});

test('one-sided real paper faces preserve their complete UVs, thickness and opposite normals through held and reverse curls', () => {
  const front = mesh('Book_Active_Front'), back = mesh('Book_Active_Back'), edge = mesh('Book_Active_Edge');
  const context = { front, back, active: [front, back, edge], host: { dataset: {} }, leftAngle: .035,
    render() {}, draw: BookCurl.prototype.draw };
  const key = (position, index) => [position[index * 3], position[index * 3 + 1]].map(value => value.toFixed(6)).join(',');
  const reverse = new Map(Array.from({ length: back.geometry.attributes.position.count }, (_, i) => [key(back.userData.rest, i), i]));
  const pairs = Array.from({ length: front.geometry.attributes.position.count }, (_, i) => [i, reverse.get(key(front.userData.rest, i))]);
  const coverTexture = new THREE.Texture();
  for (const direction of [1, -1]) {
    BookCurl.prototype.begin.call(context, { front: coverTexture, back: coverTexture, direction });
    const frontUV = front.geometry.attributes.uv.array.slice(), backUV = back.geometry.attributes.uv.array.slice();
    for (const progress of [0, .02, .1, .25, .5, .75, .9, .98, 1]) for (const corner of [-1, 0, 1]) {
      context.draw(progress, corner);
      for (const [a, b] of pairs) {
        const first = point(front.geometry.attributes.position, a), second = point(back.geometry.attributes.position, b);
        assert.ok(Math.abs(first.distanceTo(second) - .00072) < 2e-7, `leaf thickness at ${progress}`);
        assert.ok(point(front.geometry.attributes.normal, a).dot(point(back.geometry.attributes.normal, b)) < -.98);
      }
      assert.deepEqual(front.geometry.attributes.uv.array, frontUV);
      assert.deepEqual(back.geometry.attributes.uv.array, backUV);
      const held = front.geometry.attributes.position.array.slice();
      context.draw(progress, corner);
      assert.deepEqual(front.geometry.attributes.position.array, held);
      context.direction = -direction;
      context.draw(1 - progress, -corner);
      for (let i = 0; i < held.length; i++) assert.ok(Math.abs(front.geometry.attributes.position.array[i] - held[i]) < 1e-7);
      context.direction = direction;
    }
  }
  assert.equal(front.material.side, THREE.FrontSide);
  assert.equal(back.material.side, THREE.FrontSide);
  assert.equal(front.material.polygonOffset, false);
  assert.equal(front.material.depthTest, true);
  assert.equal(front.material.depthWrite, true);
});
