import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { paperRow } from './page-curl-math.js';

const paperMaterial = () => new THREE.MeshStandardMaterial({
  color: 0xffffff, roughness: .94, metalness: 0, side: THREE.DoubleSide,
  polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1
});

// Covers, binding, both stacks and the deformable sheet are authored in Blender.
// JavaScript poses the exported topology and supplies the printed photography.
export class BookCurl {
  constructor(host, onFailure) {
    this.host = host;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'book-curl-canvas';
    this.canvas.setAttribute('aria-label', 'Three-dimensional WIN DESIGN portfolio. Drag a page edge or select a project photograph.');
    host.append(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(25, 1, .1, 30);
    this.raycaster = new THREE.Raycaster();
    this.scene.add(new THREE.HemisphereLight(0xfffcf5, 0xc7bfb0, 2.1));
    this.light = new THREE.DirectionalLight(0xfffaf1, 2.3);
    this.light.position.set(-2, 3, 7);
    this.light.castShadow = true;
    Object.assign(this.light.shadow.camera, { left: -1.6, right: 1.6, top: 1.4, bottom: -1.4, near: .1, far: 14 });
    this.light.shadow.bias = -.00012;
    this.light.shadow.normalBias = .002;
    this.light.shadow.radius = 3;
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
    this.front.material = paperMaterial();
    this.back.material = paperMaterial();
    this.pages.forEach(page => { page.material = paperMaterial(); });
    // Normalize print coordinates from the actual Blender surface positions.
    for (const [index, page] of this.pages.entries()) {
      const position = page.geometry.attributes.position, uv = page.geometry.attributes.uv;
      for (let i = 0; i < position.count; i++) uv.setXY(i, position.getX(i) + (index === 0 ? 1 : 0), (position.getY(i) + .65) / 1.3);
      uv.needsUpdate = true;
    }
    this.host.dataset.bookAsset = 'blender';
    this.host.dataset.bookMeshes = String(this.meshes.length);
    this.host.dataset.curlVertices = String(this.front.geometry.attributes.position.count);
    this.ready = true;
    this.resize(this.width || 1000, this.pixelHeight || 720, this.mobile || false);
  }

  resize(width, height, mobile) {
    this.width = width; this.pixelHeight = height; this.mobile = mobile;
    this.leftAngle = mobile ? THREE.MathUtils.degToRad(76) : .035;
    this.leftWing.rotation.y = this.leftAngle;
    // Rotate the raised mobile wing about the binding, not below the cover.
    this.leftWing.position.set(-.03 * Math.sin(this.leftAngle), 0, .03 * (1 - Math.cos(this.leftAngle)));
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 1.75));
    this.renderer.setSize(width, height, false);
    Object.assign(this.canvas.style, { left: '0px', top: '0px', width: '100%', height: '100%' });
    const aspect = width / height;
    const worldWidth = mobile ? 1.55 : 2.42;
    const worldHeight = Math.max(1.58, worldWidth / aspect);
    Object.assign(this.camera, { fov: THREE.MathUtils.radToDeg(2 * Math.atan(worldHeight / 14)), aspect });
    this.camera.position.set(mobile ? .35 : 0, 0, 7);
    this.camera.lookAt(mobile ? .35 : 0, 0, 0);
    this.camera.updateProjectionMatrix();
    const shadowSize = mobile ? 512 : 1024;
    if (this.light.shadow.mapSize.x !== shadowSize) {
      this.light.shadow.mapSize.set(shadowSize, shadowSize);
      this.light.shadow.map?.dispose(); this.light.shadow.map = null;
    }
    if (this.ready) this.render();
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
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
    this.host.dataset.bookTextures = String(this.renderer.info.memory.textures);
    this.host.dataset.bookGeometries = String(this.renderer.info.memory.geometries);
  }
  texture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
    texture.userData.links = canvas.pageLinks;
    this.renderer.initTexture(texture);
    return texture;
  }
  pageHit(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(new THREE.Vector2((clientX - rect.left) / rect.width * 2 - 1, 1 - (clientY - rect.top) / rect.height * 2), this.camera);
    const hit = this.raycaster.intersectObjects(this.pages, false)[0];
    if (!hit?.uv) return null;
    return hit.object.material.map?.userData.links?.find(link => hit.uv.x >= link.x && hit.uv.x <= link.x + link.w && 1 - hit.uv.y >= link.y && 1 - hit.uv.y <= link.y + link.h)?.href || null;
  }
  grabBounds(direction) {
    const x = direction > 0 ? 1 : -Math.cos(this.leftAngle);
    const z = direction > 0 ? .035 : Math.sin(this.leftAngle) + .035;
    const top = new THREE.Vector3(x, .65, z).project(this.camera);
    const bottom = new THREE.Vector3(x, -.65, z).project(this.camera);
    return { x: (top.x + 1) * this.width / 2, y: (1 - top.y) * this.pixelHeight / 2, height: (top.y - bottom.y) * this.pixelHeight / 2 };
  }
  hide() { this.active.forEach(mesh => { mesh.visible = false; }); delete this.host.dataset.curlProgress; if (this.ready) this.render(); }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    const materials = new Set();
    for (const mesh of [...this.meshes, this.ground]) { mesh.geometry.dispose(); materials.add(mesh.material); }
    materials.forEach(material => material.dispose());
    this.light.shadow.map?.dispose(); this.renderer.dispose(); this.canvas.remove();
  }
}
