import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import * as THREE from 'three';

function roomAsset(id) {
  const buffer = readFileSync(new URL(`../public/3d/space-${id}/win_space_${id}.glb`, import.meta.url));
  const jsonLength = buffer.readUInt32LE(12);
  const json = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength));
  const binary = buffer.subarray(28 + jsonLength);
  const nodes = json.nodes.map(node => {
    const object = new THREE.Object3D();
    object.name = node.name;
    if (node.matrix) object.applyMatrix4(new THREE.Matrix4().fromArray(node.matrix));
    else {
      if (node.translation) object.position.fromArray(node.translation);
      if (node.rotation) object.quaternion.fromArray(node.rotation);
      if (node.scale) object.scale.fromArray(node.scale);
    }
    if (node.mesh !== undefined) {
      const box = new THREE.Box3();
      for (const primitive of json.meshes[node.mesh].primitives) {
        const accessor = json.accessors[primitive.attributes.POSITION];
        box.union(new THREE.Box3(new THREE.Vector3(...accessor.min), new THREE.Vector3(...accessor.max)));
      }
      object.userData.box = box;
    }
    return object;
  });
  json.nodes.forEach((node, index) => node.children?.forEach(child => nodes[index].add(nodes[child])));
  const root = new THREE.Object3D();
  json.scenes[json.scene || 0].nodes.forEach(index => root.add(nodes[index]));
  root.updateMatrixWorld(true);
  function bounds(pattern) {
    const node = nodes.find(node => pattern.test(node.name));
    assert.ok(node?.userData.box, String(pattern));
    return node.userData.box.clone().applyMatrix4(node.matrixWorld);
  }
  function image(index) {
    const info = json.images[index];
    assert.equal(info.uri, undefined, 'Room maps must be embedded, not external requests');
    const view = json.bufferViews[info.bufferView];
    const bytes = binary.subarray(view.byteOffset || 0, (view.byteOffset || 0) + view.byteLength);
    let width, height;
    if (info.mimeType === 'image/png') {
      width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    } else {
      assert.equal(info.mimeType, 'image/jpeg');
      // JPEG SOF header, without depending on a browser image decoder.
      for (let offset = 2; offset < bytes.length;) {
        assert.equal(bytes[offset++], 0xff);
        while (bytes[offset] === 0xff) offset++;
        const marker = bytes[offset++];
        const length = bytes.readUInt16BE(offset);
        if ([0xc0, 0xc1, 0xc2].includes(marker)) {
          height = bytes.readUInt16BE(offset + 3); width = bytes.readUInt16BE(offset + 5); break;
        }
        offset += length;
      }
    }
    assert.ok(width > 0 && height > 0);
    return { ...info, width, height, bytes };
  }
  return { json, buffer, bounds, image };
}

function pngChannelMeans(image) {
  assert.equal(image.mimeType, 'image/png');
  const { bytes, width, height } = image;
  assert.equal(bytes[24], 8, 'PBR map is an 8-bit PNG');
  const channels = { 2: 3, 6: 4 }[bytes[25]];
  assert.ok(channels, 'Expected RGB or RGBA data');
  const chunks = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    if (bytes.toString('ascii', offset + 4, offset + 8) === 'IDAT') chunks.push(bytes.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
  }
  const raw = inflateSync(Buffer.concat(chunks));
  const stride = width * channels;
  const decoded = new Uint8Array(stride * height);
  const totals = [0, 0, 0];
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    assert.ok(filter <= 4);
    for (let column = 0; column < stride; column++) {
      const at = row * stride + column;
      const left = column >= channels ? decoded[at - channels] : 0;
      const above = row > 0 ? decoded[at - stride] : 0;
      const diagonal = row > 0 && column >= channels ? decoded[at - stride - channels] : 0;
      const p = left + above - diagonal;
      const a = Math.abs(p - left), b = Math.abs(p - above), c = Math.abs(p - diagonal);
      const paeth = a <= b && a <= c ? left : b <= c ? above : diagonal;
      const prediction = [0, left, above, Math.floor((left + above) / 2), paeth][filter];
      decoded[at] = raw[row * (stride + 1) + column + 1] + prediction;
      const channel = column % channels;
      if (channel < 3) totals[channel] += decoded[at];
    }
  }
  return totals.map(total => total / (255 * width * height));
}

for (const id of ['01', '02']) {
  test(`Space ${id} has no detached exterior sky slabs or residence blocks in any stage`, () => {
    const {json} = roomAsset(id);
    const exterior = json.nodes.find(node=>node.name === '08_EXT_WindowView');
    assert.ok(exterior, 'preserve the stage contract');
    assert.equal(exterior.children?.length || 0,0);
    assert.ok(!json.nodes.some(node=>/EXT_.*(?:sky|residence)/i.test(node.name || '')));
    assert.ok(json.nodes.some(node=>/glazing/i.test(node.name || '')));
    assert.ok(json.nodes.some(node=>/mullion/i.test(node.name || '')));
    const source = readFileSync(new URL(`../assets/3d/space-${id}/build_space_${id}.py`,import.meta.url),'utf8');
    assert.doesNotMatch(source,/box\([^\n]*EXT_.*(?:sky|residence)/i);
  });
  test(`Space ${id} exported window has continuous physical piers, sill and head`, () => {
    const { bounds } = roomAsset(id);
    const front = bounds(/left.*front pier/i), rear = bounds(/left.*rear pier/i);
    const sill = bounds(/window sill wall/i), head = bounds(/window head/i);
    const glass = bounds(/glazing/i);
    // glTF Y is source Z; glTF Z is negative source Y.
    assert.ok(Math.abs((sill.max.z - front.min.z) - .005) < .00001);
    assert.ok(Math.abs((rear.max.z - sill.min.z) - .005) < .00001);
    assert.ok(Math.abs(sill.max.y - .86) < .00001);
    assert.ok(Math.abs(head.min.y - 2.60) < .00001);
    assert.ok(Math.abs(head.max.y - 2.92) < .00001);
    for (const pier of [front, rear]) {
      assert.ok(pier.min.y <= .00001 && pier.max.y >= 2.9199);
      assert.ok(Math.abs(pier.min.x - sill.min.x) < .00001);
      assert.ok(Math.abs(pier.max.x - sill.max.x) < .00001);
    }
    assert.ok(glass.min.y < sill.max.y && glass.max.y > head.min.y);
  });

  test(`Space ${id} embeds higher-resolution oak but preserves lossless PBR data maps`, () => {
    const { json, image } = roomAsset(id);
    const oakIndex = json.images.findIndex(item => item.name === 'light-oak-v2-1024');
    const oak = image(oakIndex);
    assert.deepEqual([oak.width, oak.height], [1024, 1024]);
    assert.equal(oak.mimeType, 'image/jpeg');
    for (const material of json.materials) {
      if (material.normalTexture) assert.ok(material.normalTexture.scale <= .16001);
      for (const texture of [material.normalTexture, material.pbrMetallicRoughness?.metallicRoughnessTexture]) {
        if (!texture) continue;
        assert.equal(image(json.textures[texture.index].source).mimeType, 'image/png');
      }
    }
    json.images.forEach((_, index) => image(index));
    assert.equal(json.scenes[json.scene || 0].nodes.length, 8, 'Retain every construction-stage collection');
  });

  test(`Space ${id} encoded normal and roughness pixels retain linear data, not sRGB gamma`, () => {
    const { json, image } = roomAsset(id);
    const find = name => image(json.images.findIndex(item => item.name === name));
    const normal = pngChannelMeans(find('woven-normal-256'));
    assert.ok(Math.abs(normal[0] - .5) < .003 && Math.abs(normal[1] - .5) < .003);
    assert.ok(normal[2] > .999);
    for (const [name, expected] of [['woven-rough-256', .87], ['stone-rough-v2-256', .57], ['limewash-rough-v2-256', .82]]) {
      // glTF's packed metallic-roughness texture reads roughness from green.
      assert.ok(Math.abs(pngChannelMeans(find(name))[1] - expected) < .003, name);
    }
  });
}

test('bedroom floor albedo, roughness and normal share the same plank atlas allocation', () => {
  const { json, image } = roomAsset('02');
  const material = json.materials.find(item => item.name === 'MAT_03_Satin pale oak floor');
  const textures = [material.pbrMetallicRoughness.baseColorTexture,
    material.pbrMetallicRoughness.metallicRoughnessTexture, material.normalTexture];
  for (const texture of textures) {
    const map = image(json.textures[texture.index].source);
    assert.match(map.name, /^bedroom-oak-.*v2-768$/);
    assert.deepEqual([map.width, map.height], [768, 768]);
    assert.equal(texture.texCoord || 0, 0);
  }
  assert.ok(Math.abs(material.normalTexture.scale - .08) < 1e-7);
});
