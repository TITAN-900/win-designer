import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { applyBookGilding } from '../src/book-gilding.js';
import { coverPose } from '../src/book-cover-math.js';
import { bindingPoint, bindingRadius } from '../src/book-binding-math.js';

function actualBook() {
  const bytes = readFileSync(new URL('../public/3d/book/portfolio_book.glb', import.meta.url));
  const length = bytes.readUInt32LE(12);
  const gltf = JSON.parse(bytes.subarray(20, 20 + length));
  const binary = bytes.subarray(28 + length);
  const scene = new THREE.Scene(), wing = new THREE.Group(); scene.add(wing);
  const read = index => {
    const accessor = gltf.accessors[index], view = gltf.bufferViews[accessor.bufferView];
    const count = { SCALAR: 1, VEC2: 2, VEC3: 3 }[accessor.type];
    const [size, method] = { 5123: [2, 'readUInt16LE'], 5125: [4, 'readUInt32LE'], 5126: [4, 'readFloatLE'] }[accessor.componentType];
    const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0), stride = view.byteStride || size * count;
    return Array.from({ length: accessor.count * count }, (_, i) =>
      binary[method](offset + Math.floor(i / count) * stride + i % count * size));
  };
  const meshes = gltf.nodes.map(node => {
    const primitive = gltf.meshes[node.mesh].primitives[0], geometry = new THREE.BufferGeometry();
    for (const [key, name, size] of [['POSITION', 'position', 3], ['NORMAL', 'normal', 3], ['TEXCOORD_0', 'uv', 2]]) {
      if (primitive.attributes[key] !== undefined) geometry.setAttribute(name,
        new THREE.Float32BufferAttribute(read(primitive.attributes[key]), size));
    }
    geometry.setIndex(read(primitive.indices));
    const translation = new THREE.Matrix4().makeTranslation(...(node.translation || [0, 0, 0]));
    geometry.applyMatrix4(new THREE.Matrix4().makeRotationX(Math.PI / 2).multiply(translation));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: 0xf4eddd, roughness: .9 }));
    mesh.name = node.name; mesh.userData = { ...node.extras };
    (node.name.endsWith('_Left') ? wing : scene).add(mesh);
    return mesh;
  });
  return { meshes, scene, wing };
}

function triangleCount(mesh) {
  return (mesh.geometry.index?.count || mesh.geometry.attributes.position.count) / 3;
}

test('gilding replaces only existing cut faces, preserving ivory printed faces and the stack topology', () => {
  const { meshes } = actualBook();
  const print = meshes.filter(mesh => /Book_(Page_|Active_Front|Active_Back|Cover_Print)/.test(mesh.name));
  const originals = print.map(mesh => ({ mesh, geometry: mesh.geometry, material: mesh.material,
    positions: [...mesh.geometry.attributes.position.array], uv: [...mesh.geometry.attributes.uv.array] }));
  const stackTriangles = Object.fromEntries(meshes.filter(mesh => mesh.name.startsWith('Book_Stack_'))
    .map(mesh => [mesh.name, triangleCount(mesh)]));
  applyBookGilding(THREE, meshes);
  for (const original of originals) {
    assert.equal(original.mesh.material, original.material, 'print material must stay nonmetallic');
    assert.equal(original.mesh.geometry, original.geometry);
    assert.deepEqual([...original.mesh.geometry.attributes.position.array], original.positions);
    assert.deepEqual([...original.mesh.geometry.attributes.uv.array], original.uv);
  }
  for (const side of ['Left', 'Right']) {
    const stack = meshes.find(mesh => mesh.name === 'Book_Stack_' + side);
    const gold = meshes.find(mesh => mesh.name === 'Book_Gilded_Stack_' + side);
    assert.equal(triangleCount(stack) + triangleCount(gold), stackTriangles[stack.name], 'no duplicated edge skin');
    assert.equal(gold.material.metalness, 1);
    assert.ok(gold.material.roughness < .35 && gold.material.envMapIntensity > 1);
    assert.ok(triangleCount(gold) > 100, 'both head/tail and fore edges have actual gold surfaces');
    const positions = gold.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) assert.ok(
      Math.abs(Math.abs(positions.getX(i)) - 1) < 1e-5 || Math.abs(Math.abs(positions.getY(i)) - .65) < 1e-5,
      'gold never bleeds across a paper face');
  }
  assert.equal(meshes.find(mesh => mesh.name === 'Book_Active_Edge').material.metalness, 1);
});

test('gold cover rules follow the physical front board and never cover the printed safe area', () => {
  const { meshes, wing, scene } = actualBook();
  applyBookGilding(THREE, meshes);
  const rule = meshes.find(mesh => mesh.name === 'Book_Gilded_Cover_Rule_Left');
  assert.equal(rule.parent, wing);
  const position = rule.geometry.attributes.position;
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i);
    assert.ok(x < -1.01 || x > -.035 || Math.abs(y) > .66, 'border stays outside print margin');
    assert.ok(position.getZ(i) < -.0092, 'foil remains outside cover print without coplanar layers');
  }
  for (const progress of [0, .15, .4, .7, 1, .7, .4, .15, 0]) {
    const pose = coverPose(progress);
    wing.rotation.y = pose.angle; wing.position.set(pose.x, 0, pose.z); scene.updateMatrixWorld(true);
    assert.deepEqual(rule.matrixWorld.elements,
      meshes.find(mesh => mesh.name === 'Book_Cover_Left').matrixWorld.elements,
      'gold and printed board remain rigidly attached through forward and reverse drag');
  }
});

test('flexible spine gold follows the binding at every cover angle with bounded geometry overhead', () => {
  const { meshes } = actualBook(), originalTriangles = meshes.reduce((sum, mesh) => sum + triangleCount(mesh), 0);
  const { flexibleMeshes } = applyBookGilding(THREE, meshes);
  assert.equal(flexibleMeshes.length, 2);
  for (const mesh of flexibleMeshes) {
    assert.ok(meshes.includes(mesh), 'tracked for disposal');
    const rest = mesh.userData.bindingRest, uv = mesh.geometry.attributes.uv;
    for (const progress of [0, .1, .25, .5, .75, .9, 1]) for (let i = 0; i < uv.count; i++) {
      const radius = bindingRadius(rest[i * 3], rest[i * 3 + 2]);
      const point = bindingPoint(uv.getX(i), coverPose(progress).angle, radius,
        mesh.userData.binding_anchor_x, mesh.userData.binding_anchor_z);
      assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z));
      assert.ok(Math.abs(bindingRadius(point.x, point.z) - radius) < 1e-10);
    }
  }
  const total = meshes.reduce((sum, mesh) => sum + triangleCount(mesh), 0);
  assert.ok(total - originalTriangles < 5000, 'lightweight foil details respect the mobile geometry budget');
  assert.ok(meshes.every(mesh => !Array.isArray(mesh.material)), 'existing material disposal contract remains valid');
});
