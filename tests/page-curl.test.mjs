import test from 'node:test';
import assert from 'node:assert/strict';
import { paperRow, releaseTarget, springStep } from '../src/page-curl-math.js';

test('paper stays attached at the spine at every progress and corner', () => {
  for (const p of [0, .1, .25, .5, .8, 1]) for (const row of [0, .5, 1]) for (const corner of [-1, 0, 1]) {
    const points = paperRow(p, row, corner, 72);
    assert.deepEqual(points[0], { x: 0, z: 0 });
    assert.ok(points.every(point => Number.isFinite(point.x) && point.z >= 0));
  }
});
test('unbent endpoints settle flat and preserve paper width', () => {
  for (const p of [0, 1]) {
    const points = paperRow(p, .5, 0, 72);
    assert.ok(points.every(point => point.z < 1e-10));
    assert.ok(Math.abs(points.at(-1).x - (1 - 2 * p)) < 1e-10);
  }
});
test('25%, 50% and 80% have evolving non-rigid curvature without stretching', () => {
  const profiles = [.25, .5, .8].map(p => paperRow(p, .5, 0, 72));
  for (const [index, points] of profiles.entries()) {
    const p = [.25, .5, .8][index];
    assert.ok(Math.abs(points.at(-1).x - (1 - 2 * p)) < 1e-10);
    const first = points[1], last = points.at(-1), middle = points[36];
    assert.ok(Math.abs(first.x * last.z - first.z * last.x) > .002, 'not a straight hinged sheet');
    assert.ok(middle.z > .1);
    for (let i = 1; i < points.length; i++) assert.ok(Math.abs(Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z) - 1 / 72) < 1e-10);
  }
  assert.notDeepEqual(profiles[0], profiles[1]);
  assert.notDeepEqual(profiles[1], profiles[2]);
});
test('held and reverse drags return exactly the same geometry', () => {
  const quarter = paperRow(.25, .2, .9, 48);
  paperRow(.8, .2, .9, 48);
  assert.deepEqual(paperRow(.25, .2, .9, 48), quarter);
  assert.notDeepEqual(paperRow(.5, 0, 1, 48), paperRow(.5, 1, 1, 48));
});

test('a raised mobile stack receives the page directly without a late rotation', () => {
  for (const angle of [.035, 76 * Math.PI / 180, Math.PI / 2]) {
    const start = paperRow(0, .5, 0, 72, angle);
    const finish = paperRow(1, .5, 0, 72, angle);
    for (let i = 0; i <= 72; i++) {
      assert.ok(Math.abs(start[i].x - i / 72) < 1e-10);
      assert.ok(Math.abs(start[i].z) < 1e-10);
      assert.ok(Math.abs(finish[i].x + i / 72 * Math.cos(angle)) < 1e-10);
      assert.ok(Math.abs(finish[i].z - i / 72 * Math.sin(angle)) < 1e-10);
    }
  }
});

test('mobile edge tracks the drag through the middle and end instead of reversing toward the right', () => {
  const angle = 76 * Math.PI / 180;
  for (const row of [0, .5, 1]) for (const corner of [-1, 0, 1]) {
    let previous = Infinity, previousProjected = Infinity;
    for (let step = 0; step <= 1000; step++) {
      const p = step / 1000;
      const edge = paperRow(p, row, corner, 72, angle).at(-1);
      assert.ok(edge.x <= previous + 1e-10, `edge reverses at ${p}`);
      previous = edge.x;
      // Existing mobile camera: x=.35, z=7, paper hinge z=.035. The first
      // percent permits subpixel perspective expansion as a flat edge lifts.
      const projected = (edge.x - .35) / (7 - edge.z - .035);
      if (p >= .02) assert.ok(projected <= previousProjected + 1e-10, `projected edge reverses at ${p}`);
      previousProjected = projected;
    }
  }
});

test('raised-stack curl preserves paper length, evolving curvature, and exact reversal', () => {
  const angle = 76 * Math.PI / 180;
  for (const p of [.02, .2, .25, .5, .8, .95]) for (const row of [0, .5, 1]) for (const corner of [-1, 0, 1]) {
    const points = paperRow(p, row, corner, 72, angle);
    assert.deepEqual(points[0], { x: 0, z: 0 });
    assert.ok(points.every(point => Number.isFinite(point.x) && point.z >= 0));
    for (let i = 1; i < points.length; i++) {
      const length = Math.hypot(points[i].x - points[i - 1].x, points[i].z - points[i - 1].z);
      assert.ok(Math.abs(length - 1 / 72) < 1e-10);
    }
  }
  const quarter = paperRow(.25, .2, .8, 72, angle);
  const middle = paperRow(.5, .2, .8, 72, angle);
  const late = paperRow(.8, .2, .8, 72, angle);
  assert.notDeepEqual(quarter, middle);
  assert.notDeepEqual(middle, late);
  assert.deepEqual(paperRow(.25, .2, .8, 72, angle), quarter);
});
test('short pull cancels, large pull completes, flick and reverse affect release', () => {
  assert.equal(releaseTarget(.15, 0), 0);
  assert.equal(releaseTarget(.65, 0), 1);
  assert.equal(releaseTarget(.2, 1), 1);
  assert.equal(releaseTarget(.65, -1), 0);
});
test('release springs settle boundedly in both directions at 30 and 60fps', () => {
  for (const fps of [30, 60]) for (const target of [0, 1]) {
    let state = { position: .4, velocity: target ? 1 : -1 };
    for (let i = 0; i < fps; i++) {
      state = springStep(state.position, state.velocity, target, 1 / fps);
      assert.ok(state.position >= 0 && state.position <= 1);
    }
    assert.ok(Math.abs(state.position - target) < .001);
    assert.ok(Math.abs(state.velocity) < .02);
  }
});
