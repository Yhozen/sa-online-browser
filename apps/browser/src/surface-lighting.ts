// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";

const prepared = new WeakSet<THREE.Material>();

/** Broad warm light returned by the sunlit street and opposite facades.
 * This is diffuse irradiance: it creates neither a second hard shadow nor a
 * false small light reflected in glass. The grazing direction leaves upward
 * road and roof surfaces near their existing exposure.
 */
export function installStreetBounce(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || prepared.has(material)) return;
  prepared.add(material);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_fragment_begin>", `
      #include <lights_fragment_begin>
      #if defined(RE_IndirectDiffuse)
        vec3 streetNormal = inverseTransformDirection(geometryNormal, viewMatrix);
        irradiance += vec3(1.0, .69387, .39157) * 1.1 *
          max(dot(streetNormal, normalize(vec3(60., -75., 3.))), 0.);
      #endif
    `);
  };
  material.customProgramCacheKey = () => `${key}-arroyo-street-bounce-v1`;
  material.needsUpdate = true;
}
