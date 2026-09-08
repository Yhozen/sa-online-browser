// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { clone } from "three/addons/utils/SkeletonUtils.js";
import { surfaceTexture } from "./surface-textures";
import { decodeReflection } from "./reflection-storage";
export let environmentTexture: THREE.Texture | undefined;
export let reflectionTexture: THREE.Texture | undefined;
export const bakingReflections = new URLSearchParams(location.search).get("bake-reflections") === "1";
const models = new Map<string, GLTF>();
export const surfaceMaterials = new Map<string, THREE.MeshStandardMaterial>();
export const assetStats = { bytes: 0, textureBytes: 0, files: 0 };
const names = [
  "house-0",
  "house-1",
  "house-2",
  "house-3",
  "palm",
  "tree",
  "fence",
  "fence-low",
  "mailbox",
  "bin",
  "pole",
  "lamp",
  "coupe",
  "neighbor",
];
export async function loadAssets(
  progress: (text: string) => void,
  inventory?: { files: Record<string, { bytes: number; sha256: string }> },
  neighborhoodReflections = true,
) {
  const loader = new GLTFLoader();
  let count = 0;
  async function verify(name: string, bytes: ArrayBuffer) {
    const expected = inventory?.files[name];
    if (!expected)
      throw Error(
        "Asset inventory is missing " +
          name +
          ". Rebuild assets and restart the gateway.",
      );
    const hash = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    if (hash !== expected.sha256 || bytes.byteLength !== expected.bytes)
      throw Error(
        "Asset revision mismatch: " +
          name +
          ". Reload after restarting the gateway.",
      );
  }

  const canonical = new Map<string, THREE.Material>();
  // Sequential loading keeps peak decode memory predictable and provides useful progress.
  for (const name of names) {
    progress(`Loading ${name} · ${count + 1}/${names.length + 1}`);
    const response = await fetch(`/assets/${name}.glb`, {
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok)
      throw Error(
        `${name}.glb could not load (HTTP ${response.status}). Check the asset build and retry.`,
      );
    const bytes = await response.arrayBuffer();
    await verify(`${name}.glb`, bytes);
    assetStats.bytes += bytes.byteLength;
    const gltf = await loader.parseAsync(bytes, "/assets/");
    gltf.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
        const list = Array.isArray(o.material) ? o.material : [o.material];
        o.material = list.map((m) => {
          if (m.name.startsWith("foliage") || m.name.startsWith("palm-frond")) m.side = THREE.DoubleSide;
          if (m.name === "ivory" && m instanceof THREE.MeshStandardMaterial) m.color.set(0xe3dfcf);
          if (m.name === "chrome" && m instanceof THREE.MeshStandardMaterial) {
            m.color.set(0x70766b); m.roughness = .5;
          }
          if (!canonical.has(m.name)) {
            if (m.name === "paint" && m instanceof THREE.MeshStandardMaterial) {
              const physical = new THREE.MeshPhysicalMaterial();
              THREE.MeshStandardMaterial.prototype.copy.call(physical, m);
              physical.defines = { STANDARD: "", PHYSICAL: "" };
              physical.clearcoat = 1; physical.clearcoatRoughness = .24; physical.envMapIntensity = 1.3;
              physical.metalness = .45; physical.roughness = .29; physical.color.set(0x193d5a);
              canonical.set(m.name, physical); m.dispose();
            } else canonical.set(m.name, m);
          }
          else if (canonical.get(m.name) !== m) {
            const shared = canonical.get(m.name)!;
            if (m.vertexColors) shared.vertexColors = true;
            m.dispose();
          }
          return canonical.get(m.name)!;
        });
        if (o.material.length === 1) o.material = o.material[0];
      }
    });
    models.set(name, gltf);
    assetStats.files = ++count;
  }
  for (const gltf of models.values()) gltf.scene.traverse(o => {
    if (!(o instanceof THREE.Mesh) || o.geometry.getAttribute("color")) return;
    const materials = Array.isArray(o.material) ? o.material : [o.material];
    if (materials.some(m => m.vertexColors)) {
      const color = new Float32Array(o.geometry.getAttribute("position").count * 3).fill(1);
      o.geometry.setAttribute("color", new THREE.Float32BufferAttribute(color, 3));
    }
  });
  async function textureInput(name: string) {
    progress(`Loading materials · ${name}`);
    const response = await fetch(`/assets/${name}`, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`${name} could not load (HTTP ${response.status}). Rebuild assets and retry.`);
    const bytes = await response.arrayBuffer();
    await verify(name, bytes);
    assetStats.bytes += bytes.byteLength; assetStats.files++;
    return createImageBitmap(new Blob([bytes]), name === "arroyo-sky.png" ? { imageOrientation: "flipY" } : {});
  }
  for (const [file, slots] of [
    ["arroyo-surfaces.png", ["asphalt", "concrete", "stucco", "grass"]],
    ["arroyo-details.png", ["shingle", "wood", "sage", "denim"]],
  ] as const) {
    const bitmap = await textureInput(file);
    for (const [i, name] of slots.entries()) {
      const size = name === "asphalt" ? 1024 : 512;
      const maps = surfaceTexture(bitmap, i, size);
      const material = new THREE.MeshStandardMaterial({ ...maps, roughness: .95, normalScale: new THREE.Vector2(.45, .45) });
      if (name === "asphalt") { material.color.set(0xb1b1aa); material.roughness = .88; }
      if (name === "grass") material.color.set(0xabb787);
      if (name === "concrete") material.color.set(0xded8c8);
      surfaceMaterials.set(name, material);
      const existing = canonical.get(name);
      if (existing instanceof THREE.MeshStandardMaterial) {
        Object.assign(existing, maps);
        existing.color.set(name === "wood" ? 0xb0a490 : name === "stucco" ? 0xe1d9c7 : name === "concrete" ? 0xded8c8 : 0xffffff);
        existing.normalScale.set(.35, .35); existing.needsUpdate = true;
      }
      if (name === "denim") {
        const cloth=canonical.get("outfit");
        if(cloth instanceof THREE.MeshStandardMaterial) { cloth.normalMap=maps.normalMap; cloth.roughnessMap=maps.roughnessMap; cloth.normalScale.set(.28,.28); cloth.needsUpdate=true; }
      }
      assetStats.textureBytes += size * size * 4 * 4 / 3 * 3;
    }
    bitmap.close();
  }
  // A 12m authored material carries connected repair/crack structure at street scale.
  const asphaltInput = await textureInput("arroyo-asphalt.png");
  const asphaltMaps = surfaceTexture(asphaltInput, -1, 1254);
  for (const texture of Object.values(asphaltMaps)) texture.repeat.setScalar(1 / 3);
  Object.assign(surfaceMaterials.get("asphalt")!, asphaltMaps);
  surfaceMaterials.get("asphalt")!.normalScale.set(.55, .55);
  assetStats.textureBytes += 1254 * 1254 * 4 * 4 / 3 * 3;
  asphaltInput.close();
  const leaves = await textureInput("arroyo-foliage.png");
  const leafTexture = new THREE.Texture(leaves);
  leafTexture.colorSpace = THREE.SRGBColorSpace; leafTexture.needsUpdate = true; leafTexture.flipY = false;
  assetStats.textureBytes += leaves.width * leaves.height * 4 * 4 / 3;
  for (const name of ["foliage", "foliage-light"]) {
    const m = canonical.get(name);
    if (m instanceof THREE.MeshStandardMaterial) {
      m.map = leafTexture; m.color.set(name === "foliage" ? 0xaec697 : 0xd8d29b);
      m.side = THREE.DoubleSide; m.alphaTest = .45; m.transparent = false;
      m.roughness = .85; m.needsUpdate = true;
    }
  }
  // Thin foliage admits light across a wider hemisphere than opaque masonry.
  // Preserve actual shadow visibility and alpha depth; add only local leaf fill.
  for (const [name, material] of canonical) {
    if (!(material instanceof THREE.MeshStandardMaterial)) continue;
    if (name.startsWith("foliage") || name.startsWith("palm-frond")) {
      material.envMapIntensity = 1.75;
      material.emissive.copy(material.color); material.emissiveIntensity = .10;
      material.emissiveMap = material.map;
      material.onBeforeCompile = shader => {
        if (name.startsWith("foliage")) {
          // Use a view-facing shading normal for GGX. A back-facing custom normal
          // makes its visibility term singular; diffuse uses the authored field below.
          shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>",
            THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", "normal *= dot(normal, vViewPosition) < 0.0 ? -1.0 : 1.0;"));
        }
        shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>",
          THREE.ShaderChunk.lights_physical_pars_fragment.replace(
            "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );",
            `reflectedLight.directDiffuse += saturate(dot(${name.startsWith("foliage") ? "normalize(vNormal)" : "geometryNormal"}, directLight.direction) * 0.65 + 0.35) * directLight.color * BRDF_Lambert(material.diffuseContribution);`));
      };
      material.customProgramCacheKey = () => `arroyo-thin-leaf-diffuse-v3-${name.startsWith("foliage") ? "canopy" : "palm"}`;
      material.needsUpdate = true;
    }
    if (name === "glass") { material.envMapIntensity = 1.4; material.roughness = .24; if(material instanceof THREE.MeshPhysicalMaterial)material.specularIntensity=.12; }
  }
  const sky = await textureInput("arroyo-sky.png");
  environmentTexture = new THREE.Texture(sky);
  environmentTexture.colorSpace = THREE.SRGBColorSpace;
  environmentTexture.needsUpdate = true; environmentTexture.flipY = false;
  assetStats.textureBytes += sky.width * sky.height * 4 * 4 / 3;
  if (neighborhoodReflections && !bakingReflections) {
    const name = "arroyo-reflections.pmrem.gz";
    progress("Loading neighborhood reflections");
    const response = await fetch(`/assets/${name}`, {signal:AbortSignal.timeout(30000)});
    if (!response.ok) throw Error(`${name} could not load. Run npm run build:assets and retry.`);
    const bytes = await response.arrayBuffer(); await verify(name, bytes);
    const decoded = await decodeReflection(bytes);
    reflectionTexture = decoded.texture;
    assetStats.textureBytes += decoded.bytes; assetStats.bytes += bytes.byteLength; assetStats.files++;
  }
}
export function asset(name: string): THREE.Group {
  const gltf = models.get(name);
  if (!gltf) throw Error(`Asset not loaded: ${name}`);
  // Blender meters/Z-up/+Y -> glTF Y-up/-Z -> world Z-up/+Y, once per imported root.
  const root = new THREE.Group(),
    normalized = clone(gltf.scene);
  normalized.rotation.x = Math.PI / 2;
  root.add(normalized);
  root.userData.asset = name;
  return root;
}
export function clips() {
  return models.get("neighbor")!.animations;
}
export function bindAssetEnvironment(texture: THREE.Texture, localProbe?: THREE.Texture) {
  const seen = new Set<THREE.Material>();
  for (const model of models.values()) model.scene.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!(material instanceof THREE.MeshStandardMaterial) || seen.has(material)) continue;
      seen.add(material);
      const leaf = material.name.startsWith("foliage") || material.name.startsWith("palm-frond");
      if (!leaf && !["paint", "glass", "denim"].includes(material.name)) continue;
      // Three uses scene.environmentIntensity when material.envMap is null.
      // Explicitly bind this shared PMREM to retain per-surface light response.
      const local = localProbe && ["paint", "glass"].includes(material.name);
      material.envMap = local ? localProbe : texture;
      material.envMapRotation.x = local ? 0 : Math.PI / 2;
      material.envMapIntensity = leaf ? 1.55 : material.name === "denim" ? .8 : .85;
      if (leaf) material.emissiveIntensity = .085;
      material.needsUpdate = true;
    }
  });
}
export function instantiateStatic(
  scene: THREE.Scene,
  placements: {
    asset: string;
    position: number[];
    rotation: number;
    scale?: number[];
  }[],
) {
  const houses = new Map<
    string,
    { material: THREE.Material; geometries: THREE.BufferGeometry[] }
  >();
  const batches = new Map<
    string,
    {
      geometry: THREE.BufferGeometry;
      material: THREE.Material | THREE.Material[];
      matrices: THREE.Matrix4[];
      qualityOnly?: string;
    }
  >();
  for (const p of placements.flatMap<
    (typeof placements)[number] & { qualityOnly?: string }
  >((p) =>
    p.asset === "fence"
      ? [
          { ...p, qualityOnly: "standard" },
          { ...p, asset: "fence-low", qualityOnly: "low" },
        ]
      : [{ ...p, qualityOnly: undefined }],
  )) {
    const root = asset(p.asset);
    root.position.set(...(p.position as [number, number, number]));
    root.rotation.z = p.rotation;
    if (p.scale) root.scale.set(...(p.scale as [number, number, number]));
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        if (p.asset.startsWith("house-") && !Array.isArray(o.material)) {
          const houseKey = o.material.uuid + ":" + Math.floor(p.position[0] / 40) + ":" + Math.floor(p.position[1] / 40);
          let batch = houses.get(houseKey);
          if (!batch) {
            batch = { material: o.material, geometries: [] };
            houses.set(houseKey, batch);
          }
          const geometry = o.geometry.clone().applyMatrix4(o.matrixWorld);
          if (!geometry.getAttribute("uv"))
            geometry.setAttribute(
              "uv",
              new THREE.Float32BufferAttribute(
                new Float32Array(geometry.getAttribute("position").count * 2),
                2,
              ),
            );
          batch.geometries.push(geometry);
          return;
        }
        const key =
          o.geometry.uuid + ":" + Math.floor(p.position[0] / 32) + ":" + Math.floor(p.position[1] / 32) +
          JSON.stringify(
            (Array.isArray(o.material) ? o.material : [o.material]).map(
              (m) => m.uuid,
            ),
          );
        let b = batches.get(key);
        if (!b) {
          b = {
            geometry: o.geometry,
            material: o.material,
            matrices: [],
            qualityOnly: p.qualityOnly,
          };
          batches.set(key, b);
        }
        b.matrices.push(o.matrixWorld.clone());
      }
    });
  }
  for (const b of houses.values()) {
    const geometry = mergeGeometries(b.geometries);
    if (!geometry) throw Error("House material batching failed");
    b.geometries.forEach((g) => g.dispose());
    const mesh = new THREE.Mesh(geometry, b.material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  for (const b of batches.values()) {
    const inst = new THREE.InstancedMesh(
      b.geometry,
      b.material,
      b.matrices.length,
    );
    b.matrices.forEach((m, i) => inst.setMatrixAt(i, m));
    inst.userData.qualityOnly = b.qualityOnly;
    inst.castShadow = true;
    inst.receiveShadow = true;
    inst.computeBoundingSphere();
    scene.add(inst);
  }
}
