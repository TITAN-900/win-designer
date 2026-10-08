import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { clamp01, smooth } from './diorama-timeline.js';

// Travel direction in the exported GLBs' Y-up coordinates. Both openings are
// in the west wall; the living room beam crosses the seating-side limestone,
// while the lower bedroom sun reaches the foot of the bed and its linen.
export const DAYLIGHT_PRESETS = Object.freeze([
  Object.freeze({ travel: [1, -.42, .08], sun: 4.1, color: 0xfff4e3, environment: .42,
    keyFinal: 1.65, fillFinal: .52, fillColor: 0xfff1df, fillPosition: [2.8, 3.8, 6] }),
  Object.freeze({ travel: [1, -.33, -.26], sun: 3.6, color: 0xfff6e9, environment: .38,
    keyFinal: 1.46, fillFinal: .4, fillColor: 0xf5f0e6, fillPosition: [3.5, 4.3, 5] })
]);

export function heroQualityProfile(width, height, deviceRatio, small, maxAnisotropy = 1) {
  const pixelBudget = small ? 1_100_000 : 4_000_000;
  const capped = Math.min(deviceRatio || 1, small ? 1.8 : 2,
    Math.sqrt(pixelBudget / Math.max(1, width * height)));
  return {
    pixelRatio: Math.max(.5, Math.floor(capped * 100) / 100), pixelBudget,
    anisotropy: Math.max(1, Math.min(maxAnisotropy, small ? 4 : 8)),
    contactShadow: small ? 768 : 1024, sunShadow: 1536,
    transmissionScale: small ? .5 : 1
  };
}

export function setRoomTextureQuality(root, anisotropy) {
  const textures = new Set();
  root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      for (const texture of Object.values(material)) {
        if (texture?.isTexture && !texture.isRenderTargetTexture && !texture.isDataTexture && !texture.isCompressedTexture) textures.add(texture);
      }
    }
  });
  for (const texture of textures) {
    if (texture.anisotropy === anisotropy && texture.minFilter === THREE.LinearMipmapLinearFilter && texture.magFilter === THREE.LinearFilter) continue;
    texture.anisotropy = anisotropy;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.needsUpdate = true;
  }
  return textures.size;
}

export function daylightEnvelope(progress) {
  return {
    ambient: smooth(clamp01(progress / .8)),
    sun: smooth(clamp01((progress - .12) / .88))
  };
}

export const interiorEnvelope = progress => smooth(clamp01((progress - .04) / .9));

export function captureRoomEmission(materials) {
  // Keep the GLB's authored warm color and peak intensity. Construction has
  // opaque and transparent variants; both must follow the same reveal so a
  // material swap cannot switch a diffuser on prematurely.
  return [...new Set(materials)].filter(material => material.emissiveIntensity > 0
    && material.emissive && Math.max(material.emissive.r, material.emissive.g, material.emissive.b) > 0)
    .map(material => ({ material, peak: material.emissiveIntensity }));
}

export function setRoomEmission(emitters, progress) {
  const intensity = interiorEnvelope(progress);
  for (const { material, peak } of emitters) material.emissiveIntensity = peak * intensity;
}

export function inspectFixtures(root, roomIndex) {
  root.updateMatrixWorld(true);
  const meshes = [];
  root.traverse(mesh => { if (mesh.isMesh) meshes.push(mesh); });
  const source = expression => {
    const mesh = meshes.find(mesh => expression.test(mesh.name.replaceAll('_', ' ')));
    if (!mesh) throw new Error(`${root.name}: missing interior light ${expression}`);
    const bounds = new THREE.Box3().setFromObject(mesh);
    return { source: mesh.name, position: bounds.getCenter(new THREE.Vector3()), size: bounds.getSize(new THREE.Vector3()) };
  };
  const spot = (expression, intensity, distance, angle) => {
    const fixture = source(expression);
    fixture.position.y -= fixture.size.y / 2 + .012;
    return { ...fixture, kind: 'spot', intensity, distance, angle,
      target: fixture.position.clone().add(new THREE.Vector3(0, -1, 0)) };
  };
  const strip = (expression, intensity, direction) => {
    const fixture = source(expression);
    fixture.position.y -= fixture.size.y / 2 + .008;
    return { ...fixture, kind: 'area', intensity,
      width: fixture.size.x, height: Math.max(.012, fixture.size.z),
      target: fixture.position.clone().add(new THREE.Vector3(...direction)) };
  };
  // Restrained direct light from the visible emitters. Keep the same two area
  // lights and four wide, non-shadowing spots in both rooms so shader variants
  // and GPU allocations stay constant. Existing sun/key provide occlusion.
  if (roomIndex === 0) return [
    strip(/Under cabinet warm LED$/i, 24, [0, -1, -.12]),
    strip(/TV under console light$/i, 7, [0, -1, .18]),
    spot(/Pendant lower diffuser 1$/i, 1.8, 4, Math.PI / 3),
    spot(/Pendant lower diffuser 2$/i, 1.8, 4, Math.PI / 3),
    spot(/Recessed ceiling spot diffuser 3$/i, 3.2, 7, Math.PI / 2.6),
    spot(/Recessed ceiling spot diffuser 4$/i, 3.2, 7, Math.PI / 2.6)
  ];
  return [
    strip(/Headboard continuous warm cove$/i, 18, [0, 1, -.3]),
    strip(/Niche concealed diffuser 1[. ]?(?:32|33)$/i, 20, [0, -1, -.1]),
    spot(/Bedside lower warm diffuser 1$/i, .7, 2.2, Math.PI / 3),
    spot(/Bedside lower warm diffuser 2$/i, .7, 2.2, Math.PI / 3),
    spot(/Bedroom recessed spot diffuser 2$/i, 1.8, 6, Math.PI / 2.6),
    spot(/Bedroom recessed spot diffuser 3$/i, 1.8, 6, Math.PI / 2.6)
  ];
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

    this.fixtures = rooms.map(inspectFixtures);
    if (!THREE.UniformsLib.LTC_FLOAT_1) RectAreaLightUniformsLib.init();
    this.interior = this.fixtures[0].map(fixture => {
      const light = fixture.kind === 'area' ? new THREE.RectAreaLight(0xffd9ad, 0)
        : new THREE.SpotLight(0xffe0ba, 0, fixture.distance, fixture.angle, .8, 2);
      light.castShadow = false;
      scene.add(light);
      if (light.target) scene.add(light.target);
      return light;
    });

    this.ambient = new THREE.HemisphereLight(0xeaf0f6, 0x817365, .92);
    this.key = new THREE.DirectionalLight(0xfff9f0, 1.7);
    this.key.position.set(4.8, 8, 6);
    this.key.target.position.set(0, .8, 0);
    this.fill = new THREE.DirectionalLight(0xe7eff8, .28);
    this.fill.position.set(4, 4, -4);
    this.fillOrigin = this.fill.position.clone();
    this.fillBaseColor = this.fill.color.clone();
    this.fillPositions = DAYLIGHT_PRESETS.map(preset => new THREE.Vector3(...preset.fillPosition));
    this.fillColors = DAYLIGHT_PRESETS.map(preset => new THREE.Color(preset.fillColor));
    this.sun = new THREE.DirectionalLight(0xfff4e3, 0);
    for (const light of [this.key, this.sun]) {
      light.castShadow = true;
      light.shadow.autoUpdate = false;
      Object.assign(light.shadow.camera, { left: -5.8, right: 5.8, top: 5.2, bottom: -5.2, near: .5, far: 35 });
      // The window sun grazes the floor: neighboring PCF taps span more
      // receiver depth than the steep key light. Its original 2.8mm depth
      // allowance caused stippled self-shadowing on flat, double-sided GLB
      // slabs. Give only the grazing sun a 14.5mm allowance; keep the key's
      // close-contact bias unchanged instead of flattening its shadows.
      light.shadow.bias = light === this.sun ? -.00042 : -.00008;
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
    const quality = heroQualityProfile(1, 1, 1, small);
    for (const [light, size] of [[this.key, quality.contactShadow], [this.sun, quality.sunShadow]]) {
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
      this.interior.forEach((light, i) => {
        const fixture = this.fixtures[roomIndex][i];
        light.position.copy(fixture.position);
        if (light.isRectAreaLight) {
          light.width = fixture.width; light.height = fixture.height;
          light.lookAt(fixture.target);
        } else {
          light.target.position.copy(fixture.target);
          light.distance = fixture.distance; light.angle = fixture.angle;
        }
      });
    }
    this.ambient.intensity = .92 + .13 * envelope.ambient;
    this.key.intensity = 1.7 + (preset.keyFinal - 1.7) * envelope.ambient;
    this.fill.intensity = .28 + (preset.fillFinal - .28) * envelope.ambient;
    this.fill.position.copy(this.fillOrigin).lerp(this.fillPositions[roomIndex], envelope.ambient);
    this.fill.color.copy(this.fillBaseColor).lerp(this.fillColors[roomIndex], envelope.ambient);
    const interior = interiorEnvelope(progress);
    this.interior.forEach((light, i) => { light.intensity = this.fixtures[roomIndex][i].intensity * interior; });
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
    for (const light of [this.ambient, this.key, this.fill, this.sun, ...this.interior]) {
      this.scene.remove(light);
      if (light.target) this.scene.remove(light.target);
      light.dispose();
    }
  }
}
