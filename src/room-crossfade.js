import * as THREE from 'three';

// Blend complete, correctly occluded room renders rather than making every
// mesh translucent. The two targets are reused, and captured once per transition.
export class RoomCrossfade {
  constructor(renderer) {
    this.renderer = renderer;
    this.targets = [0, 1].map(() => new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter, samples: 2
    }));
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { imageA: { value: this.targets[0].texture }, imageB: { value: this.targets[1].texture }, blend: { value: 0 } },
      vertexShader: 'varying vec2 screenUV; void main(){ screenUV=uv; gl_Position=vec4(position.xy,0.,1.); }',
      fragmentShader: `
        uniform sampler2D imageA;
        uniform sampler2D imageB;
        uniform float blend;
        varying vec2 screenUV;
        void main() {
          vec4 pixel = mix(texture2D(imageA, screenUV), texture2D(imageB, screenUV), blend);
          gl_FragColor = vec4(pixel.rgb / max(pixel.a, 0.00001), pixel.a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb *= gl_FragColor.a;
        }`,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.scene.add(this.quad);
    renderer.compile(this.scene, this.camera);
    this.from = null;
  }
  resize() {
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    this.targets.forEach(target => target.setSize(size.x, size.y));
    this.from = null;
  }
  warm(capture, scratchTarget) {
    // Allocate the reusable full-size targets before the first visible fade.
    // The compositor is also drawn offscreen to warm its render pipeline.
    capture(0, this.targets[0]);
    capture(1, this.targets[1]);
    this.renderer.setRenderTarget(scratchTarget);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);
    this.from = null;
  }
  render(from, blend, capture) {
    if (this.from !== from) {
      capture(from, this.targets[0]);
      capture(1 - from, this.targets[1]);
      this.from = from;
    }
    this.material.uniforms.blend.value = blend;
    this.renderer.setRenderTarget(null);
    this.renderer.render(this.scene, this.camera);
  }
  dispose() {
    this.targets.forEach(target => target.dispose());
    this.quad.geometry.dispose(); this.material.dispose();
  }
}
