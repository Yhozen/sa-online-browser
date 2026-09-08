// SPDX-License-Identifier: GPL-3.0-or-later
import { WebGLRenderer } from "three";

export class GraphicsUnavailableError extends Error {}

export function createRenderer(): WebGLRenderer {
  const canvas = document.createElement("canvas");
  let reason = "The browser did not provide a WebGL 2 context.";
  canvas.addEventListener("webglcontextcreationerror", (event) => {
    reason = (event as WebGLContextEvent).statusMessage || reason;
  });
  try {
    // Use the same context for the check and renderer: a separate probe
    // would allocate another GPU context and could pass while this one fails.
    const context = canvas.getContext("webgl2", {
      antialias: false,
      alpha: false,
    });
    if (!context) throw new Error(reason);
    return new WebGLRenderer({ canvas, context, antialias: false });
  } catch (error) {
    throw new GraphicsUnavailableError(
      error instanceof Error ? error.message : reason,
    );
  }
}

// Low mode keeps texture color and baked vertex shading, avoiding per-pixel PBR work
// on SwiftShader. Cache conversions so instances keep sharing materials.
import {
  Object3D,
  Mesh,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Material,
  Float32BufferAttribute,
} from "three";
const lowMaterials = new WeakMap<Material, Material>(),
  standardMaterials = new WeakMap<Material, Material>();
export function applyQuality(root: Object3D, low: boolean) {
  root.traverse((o) => {
    if (o.userData.qualityOnly)
      o.visible = o.userData.qualityOnly === (low ? "low" : "standard");
    if (!(o instanceof Mesh)) return;
    if (low && !o.geometry.getAttribute("color")) {
      const normals = o.geometry.getAttribute("normal");
      if (normals) {
        const colors = [];
        for (let i = 0; i < normals.count; i++) {
          const shade =
            0.62 +
            0.38 *
              Math.max(
                0,
                normals.getX(i) * -0.4 +
                  normals.getY(i) * 0.75 +
                  normals.getZ(i) * 0.5,
              );
          colors.push(shade, shade, shade * 0.96);
        }
        o.geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
      }
    }
    const convert = (m: Material) => {
      if (!low) return standardMaterials.get(m) ?? m;
      if (!(m instanceof MeshStandardMaterial)) return m;
      let converted = lowMaterials.get(m);
      if (!converted) {
        converted = new MeshBasicMaterial({
          color: m.color,
          map: m.map,
          transparent: m.transparent,
          opacity: m.opacity,
          side: m.side,
          depthWrite: m.depthWrite,
          alphaTest: m.alphaTest,
          alphaMap: m.alphaMap,
          vertexColors: true,
        });
        converted.name = m.name;
        lowMaterials.set(m, converted);
        standardMaterials.set(converted, m);
      }
      return converted;
    };
    o.material = Array.isArray(o.material)
      ? o.material.map(convert)
      : convert(o.material);
  });
}
export function disposeQualityMaterial(material: Material) {
  lowMaterials.get(material)?.dispose();
  standardMaterials.get(material)?.dispose();
  material.dispose();
}
