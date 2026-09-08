// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { plantVerges } from "./verges";
import { roadDetail } from "./road-detail";
import { buildHorizon } from "./horizon";
import type { SceneManifest } from "../../../packages/shared/scene";
import { instantiateStatic, surfaceMaterials, assetStats } from "./assets";
export function buildEnvironment(scene: THREE.Scene, manifest: SceneManifest) {
  const z = manifest.groundZ,
    yard = manifest.id === "yard";
  const colors = new Map<string, THREE.Material>();
  const mat = (name: string, color: number) => {
    if (!colors.has(name))
      colors.set(
        name,
        surfaceMaterials.get(name) ??
          new THREE.MeshStandardMaterial({ color, roughness: 0.9 }),
      );
    return colors.get(name)!;
  };
  const batches = new Map<THREE.Material, THREE.Matrix4[]>(),
    unit = new THREE.BoxGeometry(1, 1, 1),
    dummy = new THREE.Object3D();
  function box(
    p: number[],
    s: number[],
    material: THREE.Material,
    rotation = 0,
  ) {
    dummy.position.set(...(p as [number, number, number]));
    dummy.scale.set(...(s as [number, number, number]));
    dummy.rotation.set(0, 0, rotation);
    dummy.updateMatrix();
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material)!.push(dummy.matrix.clone());
  }
  // UVs measured in meters keep surface grain the same scale across a whole street.
  function surface(
    x: number,
    y: number,
    w: number,
    d: number,
    height: number,
    material: THREE.Material,
  ) {
    const g = new THREE.PlaneGeometry(w, d),
      uv = g.getAttribute("uv");
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (uv.getX(i) * w) / 4, (uv.getY(i) * d) / 4);
    const mesh = new THREE.Mesh(g, material);
    mesh.position.set(x, y, height);
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  if (yard) {
    surface(0, 0, 180, 180, z, mat("yard", 0x33434a));
    const grid = new THREE.GridHelper(80, 40, 0x6b7772, 0x46565a);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = z + 0.01;
    scene.add(grid);
    for (const b of manifest.barriers) {
      box(b.position, b.size, mat("wall", 0x9b9885));
      box(
        [b.position[0], b.position[1], b.position[2] + 1.03],
        [b.size[0], b.size[1], 0.1],
        mat("white", 0xe6e4c9),
      );
    }
    for (let y = -34; y <= 34; y += 7)
      for (const x of [-9, 9])
        box([x, y, z + 0.03], [0.13, 2.5, 0.015], mat("white", 0xe6e4c9));
  } else {
    scene.background = new THREE.Color(0x9ec9da);
    scene.fog = new THREE.Fog(0xb8c6c6, 130, 780);
    surface(0, 0, 600, 600, z - 0.03, mat("grass", 0xaaa478));
    const asphalt = mat("asphalt", 0x505450),
      concrete = mat("concrete", 0xb0ada1),
      yellow = mat("yellow", 0xc6a858);
    for (const road of manifest.roads)
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          vertical = a[0] === b[0],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        surface(
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          vertical ? road.width + 5 : length + road.width,
          vertical ? length + road.width : road.width + 5,
          z + 0.01,
          concrete,
        );
      }
    const joint = mat("sidewalk-joint", 0x89867b);
    for (const road of manifest.roads) for (let i=1;i<road.points.length;i++) {
      const a=road.points[i-1],b=road.points[i],vertical=a[0]===b[0],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
      for(let t=1.5;t<length;t+=1.5) for(const side of [-1,1]) {
        const x=a[0]+(b[0]-a[0])*t/length+(vertical?side*(road.width/2+1.25):0);
        const y=a[1]+(b[1]-a[1])*t/length+(vertical?0:side*(road.width/2+1.25));
        box([x,y,z+.017],vertical?[2.4,.018,.005]:[.018,2.4,.005],joint);
      }
    }
    const c = manifest.culdesac!;
    for (const [r, h, m] of [
      [c.radius + 2.5, 0.025, concrete],
      [c.radius, 0.05, asphalt],
    ] as const) {
      const g = new THREE.CircleGeometry(r, 64);
      const uv = g.getAttribute("uv");
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (uv.getX(i) * r) / 2, (uv.getY(i) * r) / 2);
      const mesh = new THREE.Mesh(g, m);
      mesh.position.set(...c.center, z + h);
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
    for (const road of manifest.roads)
      for (let i = 1; i < road.points.length; i++) {
        const a = road.points[i - 1],
          b = road.points[i],
          vertical = a[0] === b[0],
          length = Math.hypot(b[0] - a[0], b[1] - a[1]);
        surface(
          (a[0] + b[0]) / 2,
          (a[1] + b[1]) / 2,
          vertical ? road.width : length + road.width,
          vertical ? length + road.width : road.width,
          z + 0.055,
          asphalt,
        );
        for (let t = 4; t < length - 4; t += 6)
          for (const offset of [-0.16, 0.16]) {
            const x = a[0] + ((b[0] - a[0]) * t) / length,
              y = a[1] + ((b[1] - a[1]) * t) / length;
            if (Math.hypot(x - c.center[0], y - c.center[1]) < c.radius)
              continue;
            for(let segment=0;segment<20;segment++) {
              if ((segment + Math.floor(t)) % 7 === 0) continue;
              const along=(segment-9.5)*.185;
              box([x+(vertical?offset:along),y+(vertical?along:offset),z+.075],
                vertical?[.1,.18,.008]:[.18,.1,.008],yellow);
            }
          }
        // Sidewalk joints and low curb stones, with flush driveable road intersections.
        for (let t = 0; t < length; t += 2.5)
          for (const side of [-1, 1]) {
            const x = a[0] + ((b[0] - a[0]) * t) / length,
              y = a[1] + ((b[1] - a[1]) * t) / length;
            if (Math.hypot(x - c.center[0], y - c.center[1]) < c.radius + 3)
              continue;
            const px = x + (vertical ? side * (road.width / 2 + 0.1) : 0),
              py = y + (vertical ? 0 : side * (road.width / 2 + 0.1));
            const intersection = manifest.roads.some((other) =>
              other.points.slice(1).some((end, j) => {
                const begin = other.points[j];
                if ((begin[0] === end[0]) === vertical) return false;
                return (
                  px >= Math.min(begin[0], end[0]) - other.width / 2 &&
                  px <= Math.max(begin[0], end[0]) + other.width / 2 &&
                  py >= Math.min(begin[1], end[1]) - other.width / 2 &&
                  py <= Math.max(begin[1], end[1]) + other.width / 2
                );
              }),
            );
            if (intersection) continue;
            box(
              [
                x + (vertical ? side * (road.width / 2 + 0.1) : 0),
                y + (vertical ? 0 : side * (road.width / 2 + 0.1)),
                z + 0.09,
              ],
              vertical ? [0.18, 2.42, 0.16] : [2.42, 0.18, 0.16],
              concrete,
            );
          }
      }
    roadDetail(scene, manifest);
    plantVerges(scene, manifest);
    instantiateStatic(scene, [...manifest.houses, ...manifest.props]);
    for (const b of manifest.barriers.filter((b) =>
      b.id?.startsWith("boundary"),
    ))
      box(b.position, b.size, mat("boundary", 0xc1b299));
    // Closed south access gate is visible scenery, backed by the shared boundary collider.
    for (let x = -5; x <= 5; x += 0.35)
      box([x, -88, 11], [0.08, 0.12, 4], mat("metal", 0x485751));
    // Wires use the actual pole placements, including the widened turning circle.
    const wireMaterial = new THREE.LineBasicMaterial({ color: 0x363e39 });
    for (const side of [-1, 1]) {
      const poles = manifest.props
        .filter((p) => p.asset === "pole" && Math.sign(p.position[0]) === side)
        .sort((a, b) => a.position[1] - b.position[1]);
      for (const offset of [-1, 0, 1]) {
        const pts: THREE.Vector3[] = [];
        for (let i = 1; i < poles.length; i++) {
          const a = poles[i - 1].position,
            b = poles[i].position;
          const steps = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]));
          for (let j = i === 1 ? 0 : 1; j <= steps; j++) {
            const t = j / steps;
            pts.push(
              new THREE.Vector3(
                a[0] + (b[0] - a[0]) * t + offset,
                a[1] + (b[1] - a[1]) * t,
                z + 9.4 - 1.1 * Math.sin(t * Math.PI),
              ),
            );
          }
        }
        scene.add(
          new THREE.Line(
            new THREE.BufferGeometry().setFromPoints(pts),
            wireMaterial,
          ),
        );
      }
    }
    buildHorizon(scene, z);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#294c41";
    ctx.fillRect(0, 0, 512, 128);
    ctx.fillStyle = "#f1e6c6";
    ctx.font = "bold 64px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("ARROYO AVE", 256, 85);
    assetStats.textureBytes += (512 * 128 * 4 * 4) / 3;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(2.7, 0.65),
      new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
    );
    sign.rotation.x = Math.PI / 2;
    sign.position.set(-8, 14, 12);
    box([-8, 14.08, z + 1.5], [0.09, 0.09, 3], mat("metal", 0x485751));
    scene.add(sign);
  }
  for (const [material, matrices] of batches) {
    const mesh = new THREE.InstancedMesh(unit, material, matrices.length);
    matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
}
