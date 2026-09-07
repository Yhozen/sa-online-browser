// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 64;
const c = canvas.getContext("2d")!;
const gradient = c.createRadialGradient(32, 32, 3, 32, 32, 32);
gradient.addColorStop(0, "rgba(18,26,21,.4)");
gradient.addColorStop(1, "rgba(18,26,21,0)");
c.fillStyle = gradient;
c.fillRect(0, 0, 64, 64);
const geometry = new THREE.PlaneGeometry(2, 2),
  material = new THREE.MeshBasicMaterial({
    map: new THREE.CanvasTexture(canvas),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
export function contactShadow(width: number, length: number) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "contact-shadow";
  mesh.scale.set(width / 2, length / 2, 1);
  mesh.position.z = -0.97;
  return mesh;
}
