import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CYCLE_MS, ROOM_MS, SEQUENCE, loopState } from '../src/diorama-timeline.js';
import { DAYLIGHT_PRESETS, daylightEnvelope, inspectWindow, inspectFixtures, interiorEnvelope,
  heroQualityProfile, setRoomTextureQuality, captureRoomEmission, setRoomEmission } from '../src/room-daylight.js';
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

test('mobile quality improves fine detail within a fixed backing-store and sampling budget', () => {
  for (const width of [390, 430]) {
    const quality = heroQualityProfile(width * .98, 844 * .74, 3, true, 16);
    assert.equal(quality.pixelRatio, 1.8);
    assert.equal(quality.anisotropy, 4);
    assert.equal(quality.contactShadow, 768);
    assert.equal(quality.sunShadow, 1536);
    assert.equal(quality.transmissionScale, .5);
    assert.ok(width * .98 * 844 * .74 * quality.pixelRatio ** 2 <= quality.pixelBudget);
  }
  const tall = heroQualityProfile(760, 1600, 3, true, 2);
  assert.ok(tall.pixelRatio < 1.8);
  assert.ok(760 * 1600 * tall.pixelRatio ** 2 <= tall.pixelBudget);
  assert.equal(tall.anisotropy, 2);
  assert.equal(heroQualityProfile(390, 600, 1, true, 1).pixelRatio, 1);
  const desktop = heroQualityProfile(1100, 700, 3, false, 16);
  assert.equal(desktop.pixelRatio, 2);
  assert.equal(desktop.anisotropy, 8);
  assert.equal(desktop.transmissionScale, 1);
});

test('texture quality preserves authored color and wrapping, shares maps and does not re-upload each resize', () => {
  const texture = new THREE.Texture();
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 2);
  const material = new THREE.MeshStandardMaterial({ map: texture, roughnessMap: texture });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.PlaneGeometry(), material), new THREE.Mesh(new THREE.PlaneGeometry(), material.clone()));
  const originalVersion = texture.version;
  assert.equal(setRoomTextureQuality(root, 4), 1);
  assert.equal(texture.anisotropy, 4);
  assert.equal(texture.minFilter, THREE.LinearMipmapLinearFilter);
  assert.equal(texture.magFilter, THREE.LinearFilter);
  assert.equal(texture.version, originalVersion + 1);
  setRoomTextureQuality(root, 4);
  assert.equal(texture.version, originalVersion + 1);
  assert.equal(texture.colorSpace, THREE.SRGBColorSpace);
  assert.equal(texture.wrapS, THREE.RepeatWrapping);
  assert.deepEqual(texture.repeat.toArray(), [4, 2]);
  root.traverse(mesh => { mesh.geometry?.dispose(); mesh.material?.dispose(); });
  texture.dispose();
});

test('warm interior fixtures remain off during construction and reveal continuously with daylight', () => {
  assert.equal(interiorEnvelope(0), 0);
  assert.equal(interiorEnvelope(.04), 0);
  assert.equal(interiorEnvelope(1), 1);
  let previous = 0;
  for (let step = 1; step <= 240; step++) {
    const next = interiorEnvelope(step / 240);
    assert.ok(next >= previous && next - previous < .008);
    previous = next;
  }
  for (const space of [0, 1]) {
    assert.equal(interiorEnvelope(loopState(space * ROOM_MS + SEQUENCE.build - 1)[space ? 'secondLight' : 'firstLight']), 0);
  }
});

test('authored diffuser emission and construction variants reveal together without new shader programs', () => {
  const original = new THREE.MeshStandardMaterial({ emissive: 0xffd7a0, emissiveIntensity: 2.5 });
  const faded = original.clone();
  faded.transparent = true;
  const unlit = new THREE.MeshStandardMaterial({ color: 0xf5f1e9 });
  const colors = [original.emissive.clone(), faded.emissive.clone()];
  const versions = [original.version, faded.version];
  const emitters = captureRoomEmission([original, faded, original, unlit]);
  assert.equal(emitters.length, 2);
  for (const progress of [0, .15, .5, 1, .5, 0, 1]) {
    setRoomEmission(emitters, progress);
    for (const [index, material] of [original, faded].entries()) {
      assert.equal(material.emissiveIntensity, 2.5 * interiorEnvelope(progress));
      assert.deepEqual(material.emissive, colors[index]);
      assert.equal(material.version, versions[index]);
    }
    assert.equal(unlit.emissiveIntensity, 1);
  }
  original.dispose(); faded.dispose(); unlit.dispose();
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
    object.name = THREE.PropertyBinding.sanitizeNodeName(node.name);
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
    assert.ok(Math.abs(window.aperture.max.y - 2.60) < .001);
    const direction = new THREE.Vector3(...DAYLIGHT_PRESETS[roomIndex].travel);
    assert.ok(direction.x > 0 && direction.y < 0);
    const floor = window.center.clone().addScaledVector(direction, -window.center.y / direction.y);
    assert.ok(floor.x > -3.8 && floor.x < 3.8);
    assert.ok(floor.z > -3.1 && floor.z < 3.1);
    root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
  assert.notDeepEqual(DAYLIGHT_PRESETS[0].travel, DAYLIGHT_PRESETS[1].travel);
});

test('each interior lighting rig uses its own six existing GLB fixtures', () => {
  const layouts = [];
  for (const roomIndex of [0, 1]) {
    const id = `0${roomIndex + 1}`;
    const root = boundsOnlyGLB(`public/3d/space-${id}/win_space_${id}.glb`);
    const fixtures = inspectFixtures(root, roomIndex);
    assert.equal(fixtures.length, 6);
    assert.equal(fixtures.filter(fixture => fixture.kind === 'area').length, 2);
    assert.equal(fixtures.filter(fixture => fixture.kind === 'spot').length, 4);
    for (const fixture of fixtures) {
      const source = root.getObjectByName(fixture.source);
      assert.ok(source);
      const center = new THREE.Box3().setFromObject(source).getCenter(new THREE.Vector3());
      assert.ok(fixture.position.distanceTo(center) < .035);
      assert.ok(fixture.intensity > 0 && fixture.intensity <= 24);
      assert.equal(fixture.position.x, center.x);
      assert.equal(fixture.position.z, center.z);
      if (fixture.kind === 'spot') assert.ok(fixture.target.y < fixture.position.y);
    }
    layouts.push(fixtures.map(fixture => fixture.source));
    root.traverse(object => { object.geometry?.dispose(); object.material?.dispose(); });
  }
  assert.notDeepEqual(layouts[0], layouts[1]);
});

test('real GLTFLoader node names resolve fixtures and retain authored emissive strengths', async () => {
  for (const roomIndex of [0, 1]) {
    const id = `0${roomIndex + 1}`;
    const buffer = readFileSync(`public/3d/space-${id}/win_space_${id}.glb`);
    const loader = new GLTFLoader();
    // Node has no image decoder. Stub only image upload; real GLTFLoader still
    // parses all nodes, transforms, geometry, materials and emissive metadata.
    loader.register(() => ({ name: 'TEST_IMAGE_UPLOAD', loadTexture: () => Promise.resolve(new THREE.Texture()) }));
    const gltf = await loader.parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
    const fixtures = inspectFixtures(gltf.scene, roomIndex);
    assert.equal(fixtures.length, 6);
    if (roomIndex === 1) assert.ok(fixtures.some(fixture => /diffuser_132$/.test(fixture.source)));
    for (const fixture of fixtures) {
      const source = gltf.scene.getObjectByName(fixture.source);
      assert.ok(source.isMesh);
      const materials = Array.isArray(source.material) ? source.material : [source.material];
      const emitted = captureRoomEmission(materials);
      assert.ok(emitted.length > 0, `${fixture.source} has no authored emission`);
      assert.ok(emitted.every(entry => entry.peak === 2.5));
    }
    const geometries = new Set(), materials = new Set(), textures = new Set();
    gltf.scene.traverse(mesh => {
      if (!mesh.isMesh) return;
      geometries.add(mesh.geometry);
      for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  }
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
