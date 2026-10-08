import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as THREE from 'three';
import { coverPose, COVER_HINGE, OPEN_ANGLE } from '../src/book-cover-math.js';
import { catalogPages } from '../src/portfolio-catalog.js';
import { releaseTarget } from '../src/page-curl-math.js';
import { canAdvanceBook } from '../src/portfolio-book.js';

const context = { window: {} };
vm.runInNewContext(readFileSync('assets/data/projects.js', 'utf8'), context);
const data = context.window.WIN_DESIGN_DATA;

test('even a minimum two-page book can open, but cannot advance beyond its last spread', () => {
  assert.equal(canAdvanceBook(false, 0, 2), true);
  assert.equal(canAdvanceBook(true, 0, 2), false);
  assert.equal(canAdvanceBook(true, 0, 4), true);
  assert.equal(canAdvanceBook(true, 2, 4), false);
});

test('front cover begins physically closed and opens continuously around its binding', () => {
  assert.equal(coverPose(0).angle, Math.PI);
  assert.ok(Math.abs(coverPose(1).angle - OPEN_ANGLE) < 1e-12);
  let last = Infinity;
  for (let i=0;i<=100;i++) {
    const pose = coverPose(i/100);
    assert.ok(pose.angle <= last);
    const matrix = new THREE.Matrix4().makeRotationY(pose.angle);
    matrix.setPosition(pose.x, 0, pose.z);
    const hinge = new THREE.Vector3(0,0,COVER_HINGE).applyMatrix4(matrix);
    assert.ok(hinge.distanceTo(new THREE.Vector3(0,0,COVER_HINGE)) < 1e-12);
    last = pose.angle;
  }
});

test('cover stays exactly at 20%, 50%, 80% while held, and reverses without accumulated time', () => {
  for (const p of [.2,.5,.8]) {
    const held = coverPose(p);
    for (let frame=0;frame<120;frame++) assert.deepEqual(coverPose(p), held);
    coverPose(.95); coverPose(.05);
    assert.deepEqual(coverPose(p), held);
  }
  assert.equal(releaseTarget(.08,0),0);
  assert.equal(releaseTarget(.8,0),1);
  assert.equal(releaseTarget(.25,2),1);
  assert.equal(releaseTarget(.55,-2),0);
});

test('closed cover and both real leaf stacks remain separated, not deleted or intersecting', () => {
  const file = readFileSync('public/3d/book/portfolio_book.glb');
  const json = JSON.parse(file.toString('utf8',20,20+file.readUInt32LE(12)));
  const conversion = new THREE.Matrix4().makeRotationX(Math.PI/2);
  const pose = coverPose(0);
  const closed = new THREE.Matrix4().makeRotationY(pose.angle).setPosition(pose.x,0,pose.z);
  function box(name, folded=false) {
    const node = json.nodes.find(n=>n.name===name);
    const object = new THREE.Object3D();
    if (node.translation) object.position.fromArray(node.translation);
    if (node.rotation) object.quaternion.fromArray(node.rotation);
    if (node.scale) object.scale.fromArray(node.scale);
    object.updateMatrix();
    const a = json.accessors[json.meshes[node.mesh].primitives[0].attributes.POSITION];
    const bounds = new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max));
    bounds.applyMatrix4(object.matrix).applyMatrix4(conversion);
    if (folded) bounds.applyMatrix4(closed);
    return bounds;
  }
  const right = box('Book_Stack_Right');
  const left = box('Book_Stack_Left',true);
  const front = box('Book_Cover_Left',true);
  const back = box('Book_Cover_Right');
  assert.ok(left.min.z > right.max.z, 'folded left paper sits above right paper');
  assert.ok(front.min.z > left.max.z, 'front board encloses paper');
  assert.ok(back.max.z < right.min.z, 'back board supports right stack');
  for (const name of ['Book_Spine','Book_Binding','Book_Active_Front','Book_Active_Back','Book_Active_Edge']) {
    assert.ok(json.nodes.some(node=>node.name===name));
  }
});

test('catalog has six unique published entries, sixteen slots and ten deliberate blanks', () => {
  const pages = catalogPages(data);
  const entries = pages.flatMap(page=>page.cells).filter(Boolean);
  assert.equal(pages.length,4);
  assert.equal(entries.length,6);
  assert.equal(new Set(entries.map(entry=>entry.slug)).size,6);
  assert.equal(pages.flatMap(page=>page.cells).filter(cell=>!cell).length,10);
  assert.equal(pages[1].cells.filter(Boolean).length,4);
  assert.equal(pages[3].cells.filter(Boolean).length,2);
  assert.ok(pages.every(page=>page.cells.length===4));
});

test('saved capacity can grow without renderer changes, with draft filtering and invalid-data rejection', () => {
  const slots = Array(24).fill(null);
  slots[5] = data.projects[0].slug;
  const pages = catalogPages(data,{pageCount:6,slots});
  assert.equal(pages.length,6); assert.ok(pages[1].cells[1]);
  const privateData = {...data,projects:data.projects.map(project=>({...project,status:'DRAFT'}))};
  assert.ok(catalogPages(privateData,{pageCount:6,slots}).every(page=>page.cells.every(cell=>cell===null)));
  assert.throws(()=>catalogPages(data,{pageCount:3,slots:Array(12).fill(null)}));
  assert.throws(()=>catalogPages(data,{pageCount:4,slots:[]}));
  slots[6] = slots[5];
  assert.throws(()=>catalogPages(data,{pageCount:6,slots}),/Duplicate/);
  slots[6] = 'not-an-invented-project';
  assert.throws(()=>catalogPages(data,{pageCount:6,slots}),/Unknown/);
});
