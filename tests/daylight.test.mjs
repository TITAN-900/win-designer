import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { CYCLE_MS, ROOM_MS, SEQUENCE, loopState } from '../src/diorama-timeline.js';
import { DAYLIGHT_PRESETS, daylightEnvelope, inspectWindow } from '../src/room-daylight.js';
import { RoomCrossfade } from '../src/room-crossfade.js';

test('each fully constructed room reveals daylight, holds, then overlaps its empty successor', () => {
  assert.equal(CYCLE_MS, 28_800);
  assert.ok(SEQUENCE.daylight >= 1500 && SEQUENCE.daylight <= 3000);
  assert.ok(SEQUENCE.hold >= 2000 && SEQUENCE.hold <= 3000);
  assert.ok(SEQUENCE.transition >= 1200 && SEQUENCE.transition <= 2000);
  for (const space of [0, 1]) {
    const offset = space * ROOM_MS;
    const buildKey = space === 0 ? 'firstLocal' : 'secondLocal';
    const lightKey = space === 0 ? 'firstLight' : 'secondLight';
    const nextBuildKey = space === 0 ? 'secondLocal' : 'firstLocal';
    const nextLightKey = space === 0 ? 'secondLight' : 'firstLight';
    const complete = loopState(offset + SEQUENCE.build);
    assert.equal(complete.phase, 'daylight');
    assert.equal(complete[buildKey], 1);
    assert.equal(complete[lightKey], 0);
    const halfLit = loopState(offset + SEQUENCE.build + SEQUENCE.daylight / 2);
    assert.equal(halfLit[lightKey], .5);
    assert.equal(halfLit[buildKey], 1);
    const hold = loopState(offset + SEQUENCE.build + SEQUENCE.daylight);
    assert.equal(hold.phase, 'hold');
    assert.equal(hold[lightKey], 1);
    const blend = loopState(offset + ROOM_MS - SEQUENCE.transition / 2);
    assert.equal(blend.phase, 'transition');
    assert.equal(blend.blend, .5);
    assert.equal(blend[buildKey], 1);
    assert.equal(blend[lightKey], 1);
    assert.equal(blend[nextBuildKey], 0);
    assert.equal(blend[nextLightKey], 0);
    const next = loopState(offset + ROOM_MS);
    assert.equal(next.phase, 'build');
    assert.equal(next.space, 1 - space);
    assert.equal(next[nextBuildKey], 0);
  }
});

test('three loops preserve identical timing and reduced motion chooses the final lit room', () => {
  for (let ms = 0; ms < CYCLE_MS; ms += 37) {
    const first = loopState(ms);
    for (const cycle of [1, 2, 3]) {
      assert.deepEqual(loopState(ms + cycle * CYCLE_MS), { ...first, cycle });
    }
    for (const key of ['firstLocal', 'secondLocal', 'firstLight', 'secondLight', 'blend']) {
      assert.ok(first[key] >= 0 && first[key] <= 1, key);
    }
  }
  const reduced = loopState(86_400, true);
  assert.equal(reduced.phase, 'reduced');
  assert.equal(reduced.firstLocal, 1);
  assert.equal(reduced.firstLight, 1);
  assert.equal(reduced.blend, 0);
});

test('ambient begins before sunlight and both approach the final value smoothly', () => {
  assert.deepEqual(daylightEnvelope(0), { ambient: 0, sun: 0 });
  assert.ok(daylightEnvelope(.1).ambient > 0);
  assert.equal(daylightEnvelope(.1).sun, 0);
  assert.deepEqual(daylightEnvelope(1), { ambient: 1, sun: 1 });
  let previous = daylightEnvelope(0);
  for (let step = 1; step <= 240; step++) {
    const next = daylightEnvelope(step / 240);
    for (const key of ['ambient', 'sun']) {
      assert.ok(next[key] >= previous[key]);
      assert.ok(next[key] - previous[key] < .01);
    }
    previous = next;
  }
});

function boundsOnlyGLB(path) {
  const buffer = readFileSync(path);
  const gltf = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)));
  const nodes = gltf.nodes.map(node => {
    let object = new THREE.Object3D();
    if (node.mesh !== undefined) {
      const position = gltf.accessors[gltf.meshes[node.mesh].primitives[0].attributes.POSITION];
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute([...position.min, ...position.max], 3));
      object = new THREE.Mesh(geometry);
    }
    object.name = node.name.replaceAll(' ', '_');
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    if (node.matrix) { object.matrix.fromArray(node.matrix); object.matrix.decompose(object.position, object.quaternion, object.scale); }
    return object;
  });
  gltf.nodes.forEach((node, i) => node.children?.forEach(child => nodes[i].add(nodes[child])));
  const root = new THREE.Group();
  gltf.scenes[gltf.scene || 0].nodes.forEach(i => root.add(nodes[i]));
  return root;
}

test('sun directions enter the measured GLB windows and reach the actual room interior', () => {
  for (const roomIndex of [0, 1]) {
    const id = `0${roomIndex + 1}`;
    const root = boundsOnlyGLB(`public/3d/space-${id}/win_space_${id}.glb`);
    const window = inspectWindow(root);
    assert.ok(Math.abs(window.center.x + 3.9) < .001);
    assert.ok(Math.abs(window.center.z - .77) < .001);
    assert.ok(Math.abs(window.aperture.min.y - .86) < .001);
    assert.ok(Math.abs(window.aperture.max.y - 2.38) < .001);
    const direction = new THREE.Vector3(...DAYLIGHT_PRESETS[roomIndex].travel);
    assert.ok(direction.x > 0 && direction.y < 0);
    const floor = window.center.clone().addScaledVector(direction, -window.center.y / direction.y);
    assert.ok(floor.x > -3.8 && floor.x < 3.8);
    assert.ok(floor.z > -3.1 && floor.z < 3.1);
    root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
  assert.notDeepEqual(DAYLIGHT_PRESETS[0].travel, DAYLIGHT_PRESETS[1].travel);
});

test('crossfade allocates two targets once, captures only at entry and reuses them across three loops', () => {
  const renderer = {
    compile() {}, setRenderTarget() {}, render() {},
    getDrawingBufferSize(vector) { return vector.set(390, 540); }
  };
  const fade = new RoomCrossfade(renderer);
  fade.resize();
  const targets = [...fade.targets];
  let captures = 0;
  fade.warm(() => { captures++; }, null);
  assert.equal(captures, 2);
  for (let cycle = 0; cycle < 3; cycle++) {
    for (const from of [0, 1]) {
      const before = captures;
      for (let step = 0; step <= 120; step++) fade.render(from, step / 120, () => { captures++; });
      assert.equal(captures, before + 2);
      assert.deepEqual(fade.targets, targets);
    }
  }
  fade.resize();
  fade.render(1, .5, () => { captures++; });
  assert.equal(captures, 16);
  fade.dispose();
});
