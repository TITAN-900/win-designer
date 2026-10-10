import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paperRow } from './page-curl-math.js';
import { bookFrame, bookPixelRatio, visibleGrabBounds } from './book-quality.js';
import { coverPose } from './book-cover-math.js';
import { bindingPoint, bindingRadius } from './book-binding-math.js';

const paperMaterial = () => new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: .86, metalness: 0, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
});

// Covers, binding, both stacks and the deformable sheet are authored in Blender.
// JavaScript poses the exported topology and supplies the printed photography.
export class BookCurl {
  constructor(host, onFailure) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'book-curl-canvas';
    this.canvas.setAttribute('aria-label', 'Three-dimensional WIN DESIGN portfolio. Swipe a page horizontally or tap a project photograph.');
    host.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    const environment = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(environment, .03, .1, 1000);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .32;
    environment.dispose(); pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(25, 1, .1, 30);
    this.raycaster = new THREE.Raycaster();
    this.scene.add(new THREE.HemisphereLight(0xfffcf5, 0xc7bfb0, 1.35));
    this.light = new THREE.DirectionalLight(0xfffaf1, 2.3);
    this.light.position.set(-2, 3, 7);
    this.light.castShadow = true;
    Object.assign(this.light.shadow.camera, { left: -1.6, right: 1.6, top: 1.4, bottom: -1.4, near: .1, far: 14 });
    this.light.shadow.bias = -.00012;
    this.light.shadow.normalBias = .001;
    this.light.shadow.radius = 2;
    this.scene.add(this.light);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(5, 4), new THREE.ShadowMaterial({ color: 0x5d5142, opacity: .16 }));
    this.ground.position.z = -.06;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    this.onLost = event => { event.preventDefault(); onFailure(new Error('The portfolio graphics context was interrupted.')); };
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.active = [];
    this.leftWing = new THREE.Group();
    this.scene.add(this.leftWing);
    this.meshes = [];
    this.bindingMeshes = [];
    this.coverProgress = 0;
  }

  async load() {
    const gltf = await new GLTFLoader().loadAsync(import.meta.env.BASE_URL + '3d/book/portfolio_book.glb');
    if (this.disposed) {
      gltf.scene.traverse(mesh => { if (mesh.isMesh) { mesh.geometry.dispose(); mesh.material.dispose(); } });
      return;
    }
    const conversion = new THREE.Matrix4().makeRotationX(Math.PI / 2);
    gltf.scene.updateMatrixWorld(true);
    const exported = [];
    gltf.scene.traverse(mesh => { if (mesh.isMesh) exported.push(mesh); });
    for (const mesh of exported) {
      mesh.geometry = mesh.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(conversion, mesh.matrixWorld));
      mesh.position.set(0, 0, 0); mesh.rotation.set(0, 0, 0); mesh.scale.set(1, 1, 1);
      mesh.castShadow = mesh.receiveShadow = true;
      this.meshes.push(mesh);
      if (mesh.userData.binding_flexible) {
        const position = mesh.geometry.attributes.position;
        mesh.userData.bindingRest = position.array.slice();
        position.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false;
        this.bindingMeshes.push(mesh);
      }
      if (mesh.name.startsWith('Book_Active_')) {
        mesh.userData.rest = mesh.geometry.attributes.position.array.slice();
        mesh.geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
        mesh.frustumCulled = false; mesh.visible = false;
        this.active.push(mesh);
        this.scene.add(mesh);
      } else if (mesh.name.endsWith('_Left')) this.leftWing.add(mesh);
      else this.scene.add(mesh);
    }
    this.front = this.meshes.find(mesh => mesh.name === 'Book_Active_Front');
    this.back = this.meshes.find(mesh => mesh.name === 'Book_Active_Back');
    this.pages = ['Left', 'Right'].map(side => this.meshes.find(mesh => mesh.name === 'Book_Page_' + side));
    if (!this.front || !this.back || this.pages.some(page => !page)) throw new Error('The Blender book is missing a required paper mesh.');
    const printSurfaces = [this.front, this.back, ...this.pages];
    const replaced = new Set(printSurfaces.map(page => page.material));
    printSurfaces.forEach(page => { page.material = paperMaterial(); });
    for (const material of replaced) {
      if (!this.meshes.some(mesh => mesh.material === material)) material.dispose();
    }
    // Normalize print coordinates from the actual Blender surface positions.
    for (const [index, page] of this.pages.entries()) {
      const position = page.geometry.attributes.position, uv = page.geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) + (index === 0 ? 1 : 0), (position.getY(i) + .65) / 1.3);
      uv.needsUpdate = true;
    }
    // Printed bookcloth is an actual surface on the outside of the existing
    // front board, not a DOM overlay or a replacement for the Blender cover.
    this.coverPrint = this.meshes.find(mesh => mesh.name === 'Book_Cover_Print_Left');
    if (!this.coverPrint || this.bindingMeshes.length < 2) throw new Error('The bound book is missing its authored cover or flexible spine.');
    this.coverPrint.material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: .86, metalness: 0 });
    this.host.dataset.bookAsset = 'blender';
    this.host.dataset.bookMeshes = String(this.meshes.length);
    this.host.dataset.curlVertices = String(this.front.geometry.attributes.position.count);
    this.ready = true;
    this.resize(this.width || 1000, this.pixelHeight || 720, this.mobile || false);
  }

  resize(width, height, mobile) {
    this.width = width; this.pixelHeight = height; this.mobile = mobile;
    const framing = bookFrame(width, height, mobile);
    this.leftAngle = framing.leftAngle;
    this.renderer.setPixelRatio(bookPixelRatio(width, height, devicePixelRatio || 1, mobile));
    this.renderer.setSize(width, height, false);
    Object.assign(this.canvas.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    const aspect = width / height;
    const { worldHeight, centerX, cameraY } = framing;
    Object.assign(this.camera, { fov: THREE.MathUtils.radToDeg(2 * Math.atan(worldHeight / 14)), aspect });
    this.camera.position.set(centerX, cameraY, 7);
    this.camera.lookAt(centerX, 0, 0);
    this.camera.updateProjectionMatrix();
    const shadowSize = mobile ? 768 : 1024;
    if (this.light.shadow.mapSize.x !== shadowSize) {
      this.light.shadow.mapSize.set(shadowSize, shadowSize);
      this.light.shadow.map?.dispose(); this.light.shadow.map = null;
    }
    Object.assign(this.host.dataset, { bookDpr: this.renderer.getPixelRatio().toFixed(2),
      bookBuffer: `${this.canvas.width}x${this.canvas.height}`, bookWorldWidth: framing.worldWidth.toFixed(3),
      bookLeftAngle: this.leftAngle.toFixed(3), bookShadow: String(shadowSize) });
    if (this.ready) this.setCover(this.coverProgress);
  }

  setCover(progress, render = true) {
    this.coverProgress = Math.max(0, Math.min(1, progress));
    const pose = coverPose(this.coverProgress);
    this.leftWing.rotation.y = pose.angle;
    this.leftWing.position.set(pose.x, 0, pose.z);
    for (const mesh of this.bindingMeshes) {
      const rest = mesh.userData.bindingRest;
      const position = mesh.geometry.attributes.position, uv = mesh.geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) {
        const point = bindingPoint(uv.getX(i), pose.angle,
          bindingRadius(rest[i * 3], rest[i * 3 + 2]),
          mesh.userData.binding_anchor_x, mesh.userData.binding_anchor_z);
        position.setXYZ(i, point.x, rest[i * 3 + 1], point.z);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    // Center the closed book on desktop; keep the approved immersive mobile
    // crop. Framing follows the finger, never a delayed camera animation.
    const center = this.mobile ? .40 : .52 * (1 - this.coverProgress);
    this.camera.position.x = center;
    this.camera.lookAt(center, 0, 0);
    this.camera.updateMatrixWorld();
    this.host.dataset.coverProgress = this.coverProgress.toFixed(3);
    if (render && this.ready) this.render();
  }
  setCoverTexture(texture) {
    this.coverPrint.material.map = texture;
    this.coverPrint.material.roughnessMap = texture.userData.coverMaps?.orm || null;
    this.coverPrint.material.metalnessMap = texture.userData.coverMaps?.orm || null;
    this.coverPrint.material.normalMap = texture.userData.coverMaps?.normal || null;
    this.coverPrint.material.normalScale.set(.45, .45);
    this.coverPrint.material.roughness = 1;
    this.coverPrint.material.metalness = 1;
    this.coverPrint.material.needsUpdate = true;
  }

  setSpread(left, right, render = true) {
    if (!this.ready) return;
    [left, right].forEach((texture, i) => {
      this.pages[i].material.map = texture;
      this.pages[i].material.needsUpdate = true;
    });
    if (render) this.render();
  }

  begin({ front, back, direction }) {
    this.direction = direction;
    this.front.material.map = direction > 0 ? front : back;
    this.back.material.map = direction > 0 ? back : front;
    this.front.material.needsUpdate = this.back.material.needsUpdate = true;
    for (const mesh of [this.front, this.back]) {
      const uv = mesh.geometry.attributes.uv, rest = mesh.userData.rest;
      for (let i = 0; i < uv.count; i++) {
        const u = rest[i * 3];
        uv.setXY(i, mesh === this.front ? u : 1 - u, (rest[i * 3 + 1] + .65) / 1.3);
      }
      uv.needsUpdate = true;
    }
    this.active.forEach(mesh => { mesh.visible = true; });
    this.draw(0, 0);
  }

  draw(progress, corner) {
    const p = this.direction > 0 ? progress : 1 - progress;
    const ribbons = new Map();
    for (const mesh of this.active) {
      const position = mesh.geometry.attributes.position, rest = mesh.userData.rest;
      for (let i = 0; i < position.count; i++) {
        const u = Math.max(0, Math.min(1, rest[i * 3]));
        const row = (.65 - rest[i * 3 + 1]) / 1.3;
        const key = row.toFixed(6);
        if (!ribbons.has(key)) ribbons.set(key, paperRow(p, row, corner * this.direction, 72, this.leftAngle));
        const ribbon = ribbons.get(key), sample = u * 72;
        const a = Math.floor(sample), b = Math.min(72, a + 1), f = sample - a;
        const x = THREE.MathUtils.lerp(ribbon[a].x, ribbon[b].x, f);
        const z = THREE.MathUtils.lerp(ribbon[a].z, ribbon[b].z, f);
        const offset = rest[i * 3 + 2] - .035;
        const before = ribbon[Math.max(0, a - 1)], after = ribbon[Math.min(72, b + 1)];
        const length = Math.hypot(after.x - before.x, after.z - before.z) || 1;
        const nx = -(after.z - before.z) / length, nz = (after.x - before.x) / length;
        position.setXYZ(i, x + offset * nx, rest[i * 3 + 1], z + .035 + offset * nz);
      }
      position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    this.host.dataset.curlProgress = progress.toFixed(3);
    this.render();
  }

  render() {
    if (this.disposed) return;
    const started = performance.now();
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
    this.host.dataset.bookTextures = String(this.renderer.info.memory.textures);
    this.host.dataset.bookGeometries = String(this.renderer.info.memory.geometries);
    this.host.dataset.bookDrawCalls = String(this.renderer.info.render.calls);
    this.host.dataset.bookRenderMs = (performance.now() - started).toFixed(2);
  }
  texture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.userData.links = canvas.pageLinks;
    if (canvas.coverMaps) {
      texture.flipY = false; texture.needsUpdate = true;
      const maps = Object.fromEntries(Object.entries(canvas.coverMaps).map(([key, source]) => {
        const map = new THREE.CanvasTexture(source);
        map.colorSpace = THREE.NoColorSpace;
        map.flipY = false;
        map.anisotropy = texture.anisotropy;
        this.renderer.initTexture(map);
        return [key, map];
      }));
      texture.userData.coverMaps = maps;
      texture.addEventListener('dispose', () => Object.values(maps).forEach(map => map.dispose()));
    }
    this.renderer.initTexture(texture);
    this.host.dataset.pageTexture = `${canvas.width}x${canvas.height}`;
    this.host.dataset.pageAnisotropy = String(texture.anisotropy);
    return texture;
  }
  pageLayoutWidth() {
    // Match the projected reading page, not an arbitrary fraction of the canvas.
    const a = new THREE.Vector3(0, 0, .035).project(this.camera);
    const b = new THREE.Vector3(1, 0, .035).project(this.camera);
    return Math.abs(b.x - a.x) * this.width / 2;
  }
  pageSurfaceHit(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.scene.updateMatrixWorld(true);
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    if (this.coverProgress < .999) {
      return this.raycaster.intersectObject(this.coverPrint, false).length ? { side: 'right', href: null } : null;
    }
    const hit = this.raycaster.intersectObjects(this.pages, false)[0];
    if (!hit?.uv) return null;
    const href = hit.object.material.map?.userData.links?.find(link => hit.uv.x >= link.x && hit.uv.x <= link.x + link.w && 1 - hit.uv.y >= link.y && 1 - hit.uv.y <= link.y + link.h)?.href || null;
    return { side: hit.object === this.pages[0] ? 'left' : 'right', href };
  }
  pageHit(clientX, clientY) { return this.pageSurfaceHit(clientX, clientY)?.href || null; }
  grabBounds(direction) {
    const x = direction > 0 ? 1 : -Math.cos(this.leftAngle);
    const z = direction > 0 ? .035 : Math.sin(this.leftAngle) + .035;
    const top = new THREE.Vector3(x, .65, z).project(this.camera);
    const bottom = new THREE.Vector3(x, -.65, z).project(this.camera);
    return visibleGrabBounds({ x: (top.x + 1) * this.width / 2,
      y: (1 - top.y) * this.pixelHeight / 2, height: (top.y - bottom.y) * this.pixelHeight / 2 },
    this.width, this.pixelHeight, this.mobile ? 24 : 32);
  }
  hide() { this.active.forEach(mesh => { mesh.visible = false; }); delete this.host.dataset.curlProgress; if (this.ready) this.render(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    const materials = new Set(), maps = new Set();
    for (const mesh of [...this.meshes, this.ground]) {
      mesh.geometry.dispose(); materials.add(mesh.material);
      for (const value of Object.values(mesh.material)) if (value?.isTexture) maps.add(value);
    }
    maps.forEach(map => map.dispose());
    materials.forEach(material => material.dispose());
    this.light.shadow.map?.dispose(); this.environment?.dispose(); this.renderer.dispose(); this.canvas.remove();
  }
}
