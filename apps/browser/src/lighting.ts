// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { environmentTexture, reflectionTexture, bakingReflections, bindAssetEnvironment } from "./assets";
import { encodeReflection } from "./reflection-storage";
import { installStreetBounce } from "./surface-lighting";

/** One sun, physical sky reflections, and stable shadows over the bounded fixtures. */
export function installAtmosphere(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const ambient = new THREE.HemisphereLight(0xb5cce6, 0x97805f, 1.55);
  // The game is Z-up; sky fill must come from above, including shaded facades.
  ambient.position.set(0, 0, 1);
  const sun = new THREE.DirectionalLight(0xffd69a, 7.707888914160046);
  sun.castShadow = true;
  const shadowSize = Math.min(4096, renderer.capabilities.maxTextureSize);
  sun.shadow.mapSize.set(shadowSize, shadowSize);
  Object.assign(sun.shadow.camera, { left: -138, right: 132, top: 88, bottom: -88, near: 1, far: 320 });
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.00008;
  sun.shadow.radius = 2;
  // PCF reads the depth attachment. Its color attachment is never sampled;
  // keep a single byte there instead of an unused four-channel 4096² image.
  sun.shadow.map = new THREE.WebGLRenderTarget(shadowSize, shadowSize, { format: THREE.RedFormat });
  sun.shadow.map.depthTexture = new THREE.DepthTexture(shadowSize, shadowSize, THREE.UnsignedIntType);
  sun.shadow.map.depthTexture.compareFunction = THREE.LessEqualCompare;
  sun.shadow.map.depthTexture.minFilter = THREE.LinearFilter;
  sun.shadow.map.depthTexture.magFilter = THREE.LinearFilter;
  sun.shadow.camera.updateProjectionMatrix();
  scene.add(ambient, sun, sun.target);
  // Lower cross-street light keeps sunny gaps around the player while casting
  // existing foliage across the turning circle. Horizontal irradiance is held.
  const offset = new THREE.Vector3(-58, -12, 34.195516275285755);
  const environmentTargets: THREE.WebGLRenderTarget[] = [];
  let sky: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial> | undefined;
  return {
    sun, offset,
    dispose() { environmentTargets.forEach(target => target.dispose()); sun.shadow.map?.dispose(); sky?.geometry.dispose(); sky?.material.dispose(); },
    async environment(probePosition?: number[]) {
      if (!environmentTexture) return;
      if (probePosition) scene.traverse(object => {
        if (!(object instanceof THREE.Mesh)) return;
        for (const material of Array.isArray(object.material) ? object.material : [object.material])
          installStreetBounce(material);
      });
      environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
      // PMREM is generated once, shared by all PBR surfaces and disposed on page teardown.
      const generator = new THREE.PMREMGenerator(renderer);
      const target = generator.fromEquirectangular(environmentTexture);
      environmentTargets.push(target);
      scene.environment = target.texture;
      scene.environmentIntensity = 0.34;
      scene.backgroundIntensity = 0.85;
      scene.backgroundRotation.x = Math.PI / 2;
      scene.environmentRotation.x = Math.PI / 2;
      // Sample the original panorama directly, avoiding an otherwise redundant
      // six-face background copy. Reflection PMREM and native render size stay
      // unchanged, and this avoids an extra filtering step in the visible sky.
      const skyMaterial = new THREE.ShaderMaterial({
        name: "Arroyo original panorama", side: THREE.BackSide,
        depthTest: false, depthWrite: false, fog: false, toneMapped: false,
        uniforms: {
          tEquirect: { value: environmentTexture },
          intensity: { value: scene.backgroundIntensity },
          skyRotation: { value: new THREE.Matrix3().setFromMatrix4(
            new THREE.Matrix4().makeRotationFromEuler(scene.backgroundRotation)).transpose() },
        },
        vertexShader: THREE.ShaderLib.backgroundCube.vertexShader,
        fragmentShader: `
          uniform sampler2D tEquirect;
          uniform float intensity;
          uniform mat3 skyRotation;
          varying vec3 vWorldDirection;
          #include <common>
          void main() {
            vec2 uv = equirectUv(normalize(skyRotation * vWorldDirection));
            gl_FragColor = vec4(texture2D(tEquirect, uv).rgb * intensity, 1.);
            #include <colorspace_fragment>
          }
        `,
      });
      sky = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), skyMaterial);
      sky.name = "Arroyo original sky"; sky.frustumCulled = false; sky.renderOrder = -10000;
      sky.onBeforeRender = (_renderer, _scene, camera) => sky!.matrixWorld.copyPosition(camera.matrixWorld);
      scene.background = null; scene.add(sky);
      bindAssetEnvironment(target.texture, undefined, !!probePosition);
      let localProbe: THREE.Texture | undefined = probePosition ? reflectionTexture : undefined;
      if (probePosition && bakingReflections) {
        // One static neighborhood probe, captured before admission with no actors.
        // It includes real houses/planting rather than treating every car surface as sky.
        const cube = new THREE.WebGLCubeRenderTarget(512, { type: THREE.HalfFloatType });
        const camera = new THREE.CubeCamera(.3, 800, cube);
        camera.position.set(probePosition[0], probePosition[1], probePosition[2] + .6);
        const enabled = renderer.shadowMap.enabled, autoUpdate = renderer.shadowMap.autoUpdate;
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.autoUpdate = false;
        renderer.shadowMap.needsUpdate = true;
        try {
          camera.update(renderer, scene);
          const reflection = generator.fromCubemap(cube.texture);
          environmentTargets.push(reflection);
          localProbe = reflection.texture;
          Object.defineProperty(window, "__reflectionBake", {value:await encodeReflection(renderer,reflection)});
        } finally {
          renderer.shadowMap.enabled = enabled;
          renderer.shadowMap.autoUpdate = autoUpdate;
          cube.dispose();
        }
      }
      bindAssetEnvironment(target.texture, localProbe, !!probePosition);
      generator.dispose();
    },
  };
}
export function updateSun(rig: ReturnType<typeof installAtmosphere>) {
  // Cover every static crown and the playable fixtures in one stable map.
  // Keep the physical direction unchanged; distance only positions its camera.
  rig.sun.target.position.set(0, 0, 9);
  rig.sun.position.copy(rig.sun.target.position).addScaledVector(rig.offset, 2.5);
  rig.sun.target.updateMatrixWorld();
}
