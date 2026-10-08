import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { bookFrame, bookPixelRatio, pageRasterSize, visibleGrabBounds } from '../src/book-quality.js';
import { paperRow } from '../src/page-curl-math.js';

test('390/430 portrait deliberately crop the flat left stack and retain the complete active reading page', () => {
  for (const width of [390, 430]) {
    const frame = bookFrame(width, width / .78, true);
    const left = frame.centerX - frame.worldWidth / 2;
    const right = frame.centerX + frame.worldWidth / 2;
    assert.ok(frame.leftAngle < .04, 'no artificial raised left wing');
    assert.ok(left > -.3 && left < -.1, 'left stack continues beyond viewport');
    assert.ok(right >= 1, 'active right page is retained');
    assert.ok(1 / frame.worldWidth > .8, 'reading page exceeds 80% viewport width');
    assert.ok((left + 1) / 2 > .35, 'intentional crop removes over 35% of total spread width from view, not geometry');
  }
  const desktop = bookFrame(1300, 1300 / 1.5, false);
  assert.equal(desktop.centerX, 0);
  assert.ok(desktop.worldWidth > 2.3, 'desktop retains full spread');
});

test('high-DPR output is bounded by mobile DPR 2 and a 2.2M pixel budget', () => {
  for (const [width, height, mobile] of [[390, 500, true], [430, 552, true], [520, 667, true], [1300, 867, false]]) {
    for (const device of [1, 2, 3, 4]) {
      const ratio = bookPixelRatio(width, height, device, mobile);
      assert.ok(ratio <= device && ratio <= (mobile ? 2 : 1.75));
      assert.ok(width * height * ratio ** 2 <= 2_200_001);
    }
  }
  assert.equal(bookPixelRatio(390, 500, 3, true), 2);
});

test('page raster prioritises photographs without exceeding four-page memory or device texture limits', () => {
  for (const width of [390 / 1.22, 430 / 1.22]) {
    const size = pageRasterSize(width, width * 1.3, true);
    assert.ok(size.width >= 950 && size.width <= 1024);
    assert.ok(size.height <= 1332);
    assert.ok(size.width * size.height * 4 * 4 * 4 / 3 < 29 * 1024 ** 2, 'four pages including mipmaps below 29 MiB');
  }
  const limited = pageRasterSize(400, 520, true, 1024);
  assert.ok(limited.width <= 1024 && limited.height <= 1024);
  const desktop = pageRasterSize(538, 699, false);
  assert.ok(desktop.width > 1100 && desktop.width <= 1536);
});

test('cropped paper edges remain reachable without making the entire page a gesture blocker', () => {
  for (const width of [390, 430]) for (const x of [-290, width - 4, width + 180]) {
    const handle = visibleGrabBounds({ x, y: 25, height: 410 }, width, 500, 24);
    assert.ok(handle.x >= 12 && handle.x <= width - 12);
    assert.equal(handle.width, 24);
    assert.equal(handle.height, 410);
    assert.ok(handle.width / width < .065);
  }
});

test('flat cropped camera preserves UV project-cell hits and monotonic live curl', () => {
  for (const width of [390, 430]) {
    const height = width / .78;
    const frame = bookFrame(width, height, true);
    const camera = new THREE.PerspectiveCamera(THREE.MathUtils.radToDeg(2 * Math.atan(frame.worldHeight / 14)), width / height, .1, 30);
    camera.position.set(frame.centerX, frame.cameraY, 7); camera.lookAt(frame.centerX, 0, 0); camera.updateMatrixWorld();
    const page = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.3), new THREE.MeshBasicMaterial());
    page.position.set(.5, 0, .035); page.updateMatrixWorld();
    const ray = new THREE.Raycaster();
    for (const [u, v] of [[.25,.25],[.75,.25],[.25,.75],[.75,.75]]) {
      const point = new THREE.Vector3(u, (v - .5) * 1.3, .035).project(camera);
      assert.ok(Math.abs(point.x) < 1 && Math.abs(point.y) < 1, 'each photo center remains visible');
      ray.setFromCamera(new THREE.Vector2(point.x, point.y), camera);
      const hit = ray.intersectObject(page)[0];
      assert.ok(hit && Math.abs(hit.uv.x-u)<1e-6 && Math.abs(hit.uv.y-v)<1e-6);
    }
    let previous = Infinity, previousWorld = Infinity;
    for (let step=2; step<=100; step++) {
      const edge = paperRow(step/100, .5, 0, 72, frame.leftAngle).at(-1);
      const projected = new THREE.Vector3(edge.x, 0, edge.z+.035).project(camera);
      assert.ok(edge.x <= previousWorld + 1e-9, 'physical sheet edge follows the pull monotonically');
      // Once fully outside the viewport, perspective foreshortening of the
      // settling tip is immaterial; the visible edge must still follow input.
      if (projected.x > -1) assert.ok(projected.x <= previous + 1e-9, 'visible drag edge must never jump backwards');
      previous = projected.x;
      previousWorld = edge.x;
    }
    page.geometry.dispose(); page.material.dispose();
  }
});
