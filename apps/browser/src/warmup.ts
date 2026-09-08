// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { asset } from "./assets";
import { applyQuality } from "./graphics";

/** Upload shared hero geometry and compile skin/paint shaders before enabling join.
 * Temporary render-only models never become protocol players or visible entities.
 */
export async function warmupActors(renderer: THREE.WebGLRenderer, scene: THREE.Scene,
  camera: THREE.Camera, spawn: number[], vehicle: number[], low: boolean) {
  const models = [asset("neighbor"), asset("coupe")];
  models.forEach((model, i) => {
    model.position.fromArray(i ? vehicle : spawn);
    model.traverse(o => { if (o instanceof THREE.Mesh) o.frustumCulled = false; });
    applyQuality(model, low);
    scene.add(model);
  });
  // The loading frame uses the same native drawing-buffer dimensions and shading.
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.WebGLRenderTarget(size.x, size.y, {type: THREE.HalfFloatType});
  const previous = renderer.getRenderTarget();
  try {
    await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    // Once per admission screen: complete uploads while input/join are disabled.
    renderer.getContext().finish();
  } finally {
    renderer.setRenderTarget(previous);
    target.dispose();
    for (const model of models) {
      scene.remove(model);
      model.traverse(o => { if (o instanceof THREE.SkinnedMesh) o.skeleton.dispose(); });
      // Materials/geometry belong to the shared asset cache and retain their programs.
    }
  }
}
