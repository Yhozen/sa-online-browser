// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";

const attributeName = "_canopy_visibility";
const prepared = new WeakSet<THREE.Material>();

/** Native alpha-aware, same-specimen diffuse accessibility. Other foliage shares
 * the material, so it needs an identity field before house merging/instancing. */
export function prepareCanopyGeometry(geometry: THREE.BufferGeometry, oak: boolean) {
  const attribute = geometry.getAttribute(attributeName);
  const count = geometry.getAttribute("position").count;
  if (!oak) {
    if (attribute) throw Error("Unexpected canopy field on non-oak foliage");
    geometry.setAttribute(attributeName, new THREE.Float32BufferAttribute(new Float32Array(count * 2).fill(1), 2));
    return;
  }
  if (!(attribute instanceof THREE.BufferAttribute) || !(attribute.array instanceof Float32Array)
    || attribute.itemSize !== 2 || attribute.count !== count || attribute.normalized
    || !attribute.array.every(value => Number.isFinite(value) && value >= 0 && value <= 1))
    throw Error("Oak diffuse accessibility is missing or invalid. Rebuild the oak assets.");
}

/** Preserve direct sun, emissive and specular. The two raw hemispheres follow
 * the foliage shader's existing view-facing authored-normal convention. */
export function installCanopyAccessibility(material: THREE.Material) {
  if (!(material instanceof THREE.MeshStandardMaterial) || !material.name.startsWith("foliage")) return;
  if (prepared.has(material)) return;
  prepared.add(material);
  const before = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = function(shader, renderer) {
    before.call(this, shader, renderer);
    if (!shader.vertexShader.includes("#include <begin_vertex>") || !shader.fragmentShader.includes("#include <lights_fragment_end>"))
      throw Error("Canopy shader contract changed");
    shader.vertexShader = "attribute vec2 _canopy_visibility;\nvarying vec2 vCanopyVisibility;\n" + shader.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\nvCanopyVisibility = _canopy_visibility;");
    shader.fragmentShader = "varying vec2 vCanopyVisibility;\n" + shader.fragmentShader.replace("#include <lights_fragment_end>", `#include <lights_fragment_end>
      // Match the existing foliage macro-normal side selection exactly.
      float canopyAccessibility = dot(normalize(vNormal), vViewPosition) < 0.
        ? vCanopyVisibility.y : vCanopyVisibility.x;
      reflectedLight.indirectDiffuse *= canopyAccessibility;
    `);
  };
  material.customProgramCacheKey = () => key + "-raw-canopy-accessibility-v1";
  material.needsUpdate = true;
}
