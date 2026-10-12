import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const original = new URL('./before.glb', import.meta.url);
const destination = new URL('../../public/3d/space-01/win_space_01.glb', import.meta.url);
function parse(file) {
  const bytes = readFileSync(file), length = bytes.readUInt32LE(12);
  return { json: JSON.parse(bytes.toString('utf8', 20, 20 + length)), binary: bytes.subarray(28 + length) };
}
const old = parse(original), fresh = parse(destination);
writeFileSync(new URL('./full-export.glb', import.meta.url), readFileSync(destination));
const sinkName = 'JOINERY_Island inset sink dark well';
const tapName = 'JOINERY_Island faucet arch';
const oldSink = old.json.nodes.find(node => node.name === sinkName);
const newSink = fresh.json.nodes.find(node => node.name === sinkName);
assert.deepEqual(oldSink.translation.filter((_, i) => i !== 1), newSink.translation.filter((_, i) => i !== 1));
oldSink.translation = newSink.translation;
const primitive = (asset, name) => asset.json.meshes[asset.json.nodes.find(node => node.name === name).mesh].primitives[0];
const before = primitive(old, tapName), after = primitive(fresh, tapName);
const binary = Buffer.from(old.binary);
// Preserve the original export exactly outside the two changed fittings. The
// current Blender exporter also recalculates unrelated UVs, which this job
// must not ship. Faucet topology and UVs did not change, only its shape/normals.
for (const name of ['POSITION', 'NORMAL']) {
  const oa = old.json.accessors[before.attributes[name]], na = fresh.json.accessors[after.attributes[name]];
  assert.equal(oa.count, na.count); assert.equal(oa.type, 'VEC3'); assert.equal(na.type, 'VEC3');
  assert.equal(oa.componentType, 5126); assert.equal(na.componentType, 5126);
  const ov = old.json.bufferViews[oa.bufferView], nv = fresh.json.bufferViews[na.bufferView];
  for (let i = 0; i < oa.count; i++) {
    const from = (nv.byteOffset || 0) + (na.byteOffset || 0) + i * (nv.byteStride || 12);
    const to = (ov.byteOffset || 0) + (oa.byteOffset || 0) + i * (ov.byteStride || 12);
    fresh.binary.copy(binary, to, from, from + 12);
  }
  if (na.min) oa.min = na.min;
  if (na.max) oa.max = na.max;
}
const text = Buffer.from(JSON.stringify(old.json));
const json = Buffer.alloc(Math.ceil(text.length / 4) * 4, 0x20); text.copy(json);
const output = Buffer.alloc(28 + json.length + binary.length);
output.write('glTF'); output.writeUInt32LE(2, 4); output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(json.length, 12); output.writeUInt32LE(0x4e4f534a, 16); json.copy(output, 20);
output.writeUInt32LE(binary.length, 20 + json.length); output.writeUInt32LE(0x004e4942, 24 + json.length);
binary.copy(output, 28 + json.length); writeFileSync(destination, output);
console.log('Preserved all original export data except sink height and faucet positions/normals.');
