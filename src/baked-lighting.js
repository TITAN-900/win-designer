import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

// Cycles irradiance is separate from PBR albedo, so close-up materials remain
// physically shaded. A shell/furnished pair prevents permanent ghost shadows.
export async function loadInteriorLighting(manager,renderer,scene){
  const loader=new THREE.TextureLoader(manager);
  const root=import.meta.env.BASE_URL+'lighting/';
  const atlasRoot=root+(window.matchMedia('(max-width: 760px)').matches?'mobile/':'');
  const atlasNames=['floor','shell','joinery','soft','objects'];
  const maps=new Map();
  async function texture(name){
    const t=await loader.loadAsync(atlasRoot+name+'.jpg');
    t.colorSpace=THREE.SRGBColorSpace;t.flipY=false;t.channel=1;
    t.anisotropy=Math.min(4,renderer.capabilities.getMaxAnisotropy());
    return t;
  }
  await Promise.all(atlasNames.map(async name=>{
    maps.set(name,{final:await texture(name+'_final'),shell:['floor','shell'].includes(name)?await texture(name+'_shell'):null});
  }));
  const hdr=await new HDRLoader(manager).loadAsync(root+'interior_reflection.hdr');
  hdr.mapping=THREE.EquirectangularReflectionMapping;
  const pmrem=new THREE.PMREMGenerator(renderer);
  const env=pmrem.fromEquirectangular(hdr);
  scene.environment=env.texture;scene.environmentIntensity=.55;
  // Blender panorama forward (+Y) becomes -Z in glTF / Three.js.
  scene.environmentRotation.y=Math.PI/2;
  hdr.dispose();pmrem.dispose();
  const uniforms={floor:{value:1},shell:{value:1}};
  const modified=new Set();
  function apply(rootObject){
    rootObject.traverse(mesh=>{
      if(!mesh.isMesh||!mesh.userData.lightmap)return;
      const key=mesh.userData.lightmap;
      const atlas=maps.get(key);
      if(!atlas||!mesh.geometry.attributes.uv1)throw new Error(`Missing baked UV/lightmap on ${mesh.name}`);
      for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){
        if(modified.has(material))continue;
        modified.add(material);
        material.lightMap=atlas.final;
        // Bake stores outgoing white diffuse radiance, normalized to a range of 4.
        material.lightMapIntensity=Math.PI*4;
        material.onBeforeCompile=program=>{
          let chunk=THREE.ShaderChunk.lights_fragment_maps;
          if(atlas.shell){
            program.uniforms.uShellLightmap={value:atlas.shell};
            program.uniforms.uBuildLight=uniforms[key];
            program.fragmentShader='uniform sampler2D uShellLightmap;\nuniform float uBuildLight;\n'+program.fragmentShader;
            chunk=chunk.replace('vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );',
              'vec4 lightMapTexel = mix(texture2D(uShellLightmap, vLightMapUv), texture2D(lightMap, vLightMapUv), uBuildLight);');
          }
          program.fragmentShader=program.fragmentShader.replace('#include <lights_fragment_maps>',chunk)
            .replace('#include <lights_fragment_end>','iblIrradiance = vec3(0.0);\n#include <lights_fragment_end>\nreflectedLight.directDiffuse *= 0.035;');
        };
        material.customProgramCacheKey=()=>`cycles-gi-v1-${atlas.shell?key:'single'}`;
        material.needsUpdate=true;
      }
    });
  }
  function update(progress){
    uniforms.floor.value=THREE.MathUtils.smoothstep(progress,.74,.95);
    uniforms.shell.value=THREE.MathUtils.smoothstep(progress,.25,.72);
  }
  return {apply,update,env};
}
