import * as THREE from 'three';
import { clamp01, smooth } from './diorama-timeline.js';

// Travel direction in the exported GLBs' Y-up coordinates. Both openings are
// in the west wall; the living room beam crosses the seating-side limestone,
// while the lower bedroom sun reaches the foot of the bed and its linen.
export const DAYLIGHT_PRESETS = Object.freeze([
  Object.freeze({ travel: [1, -.42, .08], sun: 4.1, color: 0xfff4e3, environment: .42 }),
  Object.freeze({ travel: [1, -.33, -.26], sun: 3.6, color: 0xfff6e9, environment: .38 })
]);

export function daylightEnvelope(progress) {
  return {
    ambient: smooth(clamp01(progress / .8)),
    sun: smooth(clamp01((progress - .12) / .88))
  };
}

export function inspectWindow(root) {
  root.updateMatrixWorld(true);
  let glazing, sill, head;
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    const name = mesh.name.replaceAll('_', ' ');
    if (/^ARCH .*glazing/i.test(name)) glazing = mesh;
    if (/window sill wall/i.test(name)) sill = mesh;
    if (/window head/i.test(name)) head = mesh;
  });
  if (!glazing || !sill || !head) throw new Error(`${root.name}: incomplete daylight opening`);
  const bounds = new THREE.Box3().setFromObject(glazing);
  const aperture = bounds.clone();
  aperture.min.y = Math.max(bounds.min.y, new THREE.Box3().setFromObject(sill).max.y);
  aperture.max.y = Math.min(bounds.max.y, new THREE.Box3().setFromObject(head).min.y);
  return { bounds, aperture, center: aperture.getCenter(new THREE.Vector3()) };
}

function shadowAperture(window) {
  // A cutaway omits its ceiling and the rest of the exterior wall. Continue
  // that wall ONLY in the shadow pass, so sunlight cannot spill over its cut
  // edge. The opening is measured from this room's actual glazing/sill/head;
  // its original mullions and furniture cast the detailed shadows themselves.
  const { min, max } = window.aperture;
  const x = window.bounds.min.x - .025;
  const positions = [];
  const rectangle = (y0, y1, z0, z1) => {
    positions.push(x, y0, z0, x, y1, z0, x, y1, z1,
      x, y0, z0, x, y1, z1, x, y0, z1);
  };
  rectangle(-12, min.y, -12, 12);
  rectangle(max.y, 12, -12, 12);
  rectangle(min.y, max.y, -12, min.z);
  rectangle(min.y, max.y, max.z, 12);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, colorWrite: false, depthWrite: false });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Cutaway exterior wall shadow continuation';
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

function windowEnvironment(generator, window, roomIndex) {
  // One small, prefiltered 3D interior environment per room: a neutral room
  // enclosure and its actual window. No HDR download or per-frame capture.
  const environment = new THREE.Scene();
  environment.background = new THREE.Color(.11, .12, .13);
  const geometry = new THREE.BoxGeometry(7.8, 3, 6.3);
  const wall = new THREE.MeshBasicMaterial({ color: 0x77736c, side: THREE.BackSide });
  const enclosure = new THREE.Mesh(geometry, wall);
  enclosure.position.y = 1.4;
  environment.add(enclosure);
  const size = window.aperture.getSize(new THREE.Vector3());
  const openingGeometry = new THREE.PlaneGeometry(size.z, size.y);
  const openingMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(5.4, 5.8, 6.2), side: THREE.DoubleSide });
  const opening = new THREE.Mesh(openingGeometry, openingMaterial);
  opening.position.copy(window.center);
  opening.position.x += .06;
  opening.rotation.y = Math.PI / 2;
  environment.add(opening);
  const target = generator.fromScene(environment, .06, .1, 30, {
    size: 128, position: new THREE.Vector3(roomIndex === 0 ? -.25 : .65, 1.1, 0)
  });
  geometry.dispose(); wall.dispose(); openingGeometry.dispose(); openingMaterial.dispose();
  return target;
}

export class RoomDaylight {
  constructor(renderer, scene, rooms, small = false) {
    this.scene = scene;
    this.windows = rooms.map(inspectWindow);
    this.apertures = this.windows.map(shadowAperture);
    this.apertures.forEach(mesh => { mesh.visible = false; scene.add(mesh); });
    const generator = new THREE.PMREMGenerator(renderer);
    this.environments = this.windows.map((window, i) => windowEnvironment(generator, window, i));
    generator.dispose();

    this.ambient = new THREE.HemisphereLight(0xeaf0f6, 0x817365, .92);
    this.key = new THREE.DirectionalLight(0xfff9f0, 1.7);
    this.key.position.set(4.8, 8, 6);
    this.key.target.position.set(0, .8, 0);
    this.fill = new THREE.DirectionalLight(0xe7eff8, .28);
    this.fill.position.set(4, 4, -4);
    this.sun = new THREE.DirectionalLight(0xfff4e3, 0);
    for (const light of [this.key, this.sun]) {
      light.castShadow = true;
      light.shadow.autoUpdate = false;
      Object.assign(light.shadow.camera, { left: -5.8, right: 5.8, top: 5.2, bottom: -5.2, near: .5, far: 35 });
      light.shadow.bias = -.00008;
      light.shadow.normalBias = .012;
      light.shadow.radius = 2;
      light.shadow.intensity = light === this.sun ? .97 : .58;
      scene.add(light, light.target);
    }
    scene.add(this.ambient, this.fill);
    this.room = -1;
    this.lastBuild = -1;
    this.lastSun = -1;
    this.resize(small);
  }

  resize(small) {
    for (const [light, size] of [[this.key, small ? 512 : 1024], [this.sun, small ? 1024 : 1536]]) {
      if (light.shadow.mapSize.x === size && light.shadow.map) continue;
      light.shadow.mapSize.set(size, size);
      light.shadow.map?.dispose();
      light.shadow.map = null;
      light.shadow.needsUpdate = true;
    }
  }

  apply(roomIndex, progress, build, force = false) {
    const changed = this.room !== roomIndex;
    const preset = DAYLIGHT_PRESETS[roomIndex];
    const envelope = daylightEnvelope(progress);
    if (changed) {
      const travel = new THREE.Vector3(...preset.travel).normalize();
      this.sun.target.position.set(0, .8, 0);
      this.sun.position.copy(this.sun.target.position).addScaledVector(travel, -16);
      this.sun.color.setHex(preset.color);
      this.scene.environment = this.environments[roomIndex].texture;
      this.apertures.forEach((mesh, i) => { mesh.visible = i === roomIndex; });
    }
    this.ambient.intensity = .92 + .13 * envelope.ambient;
    this.key.intensity = 1.7 - .32 * envelope.ambient;
    this.fill.intensity = .28 + .08 * envelope.ambient;
    this.sun.intensity = preset.sun * envelope.sun;
    this.scene.environmentIntensity = .23 + (preset.environment - .23) * envelope.ambient;
    // Furniture moves only during construction. Keep final shadow maps cached
    // throughout the light reveal/hold; updating light intensity needs no map.
    this.key.shadow.needsUpdate ||= force || changed || this.lastBuild !== build;
    this.sun.shadow.needsUpdate ||= force || changed || (envelope.sun > 0 && this.lastSun <= 0);
    this.room = roomIndex;
    this.lastBuild = build;
    this.lastSun = envelope.sun;
  }

  dispose() {
    this.scene.environment = null;
    this.environments.forEach(target => target.dispose());
    this.apertures.forEach(mesh => {
      this.scene.remove(mesh); mesh.geometry.dispose(); mesh.material.dispose();
    });
    for (const light of [this.ambient, this.key, this.fill, this.sun]) {
      this.scene.remove(light);
      if (light.target) this.scene.remove(light.target);
      light.dispose();
    }
  }
}
