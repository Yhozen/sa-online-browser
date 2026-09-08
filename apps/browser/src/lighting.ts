// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { environmentTexture } from "./assets";

/** One sun, physical sky reflections, and a stable shadow volume around the player. */
export function installAtmosphere(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  const ambient = new THREE.HemisphereLight(0xc6ddef, 0x80725e, 1.05);
  const sun = new THREE.DirectionalLight(0xffdfb0, 3.6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -48, right: 48, top: 48, bottom: -48, near: 1, far: 180 });
  sun.shadow.normalBias = 0.025;
  sun.shadow.bias = -0.00012;
  sun.shadow.radius = 2;
  scene.add(ambient, sun, sun.target);
  const offset = new THREE.Vector3(-48, -35, 65);
  return {
    sun, offset,
    async environment() {
      if (!environmentTexture) return;
      environmentTexture.mapping = THREE.EquirectangularReflectionMapping;
      // PMREM is generated once, shared by all PBR surfaces and disposed on page teardown.
      const generator = new THREE.PMREMGenerator(renderer);
      const target = generator.fromEquirectangular(environmentTexture);
      scene.environment = target.texture;
      scene.environmentIntensity = 0.65;
      scene.background = environmentTexture;
      scene.backgroundIntensity = 0.85;
      scene.backgroundRotation.x = Math.PI / 2;
      scene.environmentRotation.x = Math.PI / 2;
      generator.dispose();
    },
  };
}
export function updateSun(rig: ReturnType<typeof installAtmosphere>, target: THREE.Vector3) {
  // Quantize in shadow texels to prevent crawling shadows during camera motion.
  const texel = 96 / 2048;
  rig.sun.target.position.set(Math.round(target.x / texel) * texel, Math.round(target.y / texel) * texel, 9);
  rig.sun.position.copy(rig.sun.target.position).add(rig.offset);
  rig.sun.target.updateMatrixWorld();
}
