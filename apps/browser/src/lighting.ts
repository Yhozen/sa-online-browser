// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { environmentTexture, reflectionTexture, bakingReflections, bindAssetEnvironment } from "./assets";
import { encodeReflection } from "./reflection-storage";

/** One sun, physical sky reflections, and a stable shadow volume around the player. */
export function installAtmosphere(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const ambient = new THREE.HemisphereLight(0xc6ddef, 0x80725e, .8);
  const sun = new THREE.DirectionalLight(0xffdfb0, 3.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(4096, 4096);
  Object.assign(sun.shadow.camera, { left: -128, right: 128, top: 128, bottom: -128, near: 1, far: 320 });
  sun.shadow.normalBias = 0.04;
  sun.shadow.bias = -0.00008;
  sun.shadow.radius = 2;
  scene.add(ambient, sun, sun.target);
  const offset = new THREE.Vector3(-48, -35, 65);
  const environmentTargets: THREE.WebGLRenderTarget[] = [];
  return {
    sun, offset,
    dispose() { environmentTargets.forEach(target => target.dispose()); sun.shadow.map?.dispose(); },
    async environment(probePosition?: number[]) {
      if (!environmentTexture) return;
      environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
      // PMREM is generated once, shared by all PBR surfaces and disposed on page teardown.
      const generator = new THREE.PMREMGenerator(renderer);
      const target = generator.fromEquirectangular(environmentTexture);
      environmentTargets.push(target);
      scene.environment = target.texture;
      scene.environmentIntensity = 0.4;
      scene.background = environmentTexture;
      scene.backgroundIntensity = 0.85;
      scene.backgroundRotation.x = Math.PI / 2;
      scene.environmentRotation.x = Math.PI / 2;
      bindAssetEnvironment(target.texture);
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
      bindAssetEnvironment(target.texture, localProbe);
      generator.dispose();
    },
  };
}
export function updateSun(rig: ReturnType<typeof installAtmosphere>, target: THREE.Vector3) {
  // Quantize in shadow texels to prevent crawling shadows during camera motion.
  const texel = 256 / 4096;
  rig.sun.target.position.set(Math.round(target.x / texel) * texel, Math.round(target.y / texel) * texel, 9);
  rig.sun.position.copy(rig.sun.target.position).add(rig.offset);
  rig.sun.target.updateMatrixWorld();
}
