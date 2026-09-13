// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import { groundCover } from "./ground-cover.ts";
import type { SceneManifest } from "../../../packages/shared/scene";

/** Fine curved turf distributed across clear yards, with drier gaps and taller fence edges. */
export function plantVerges(scene: THREE.Scene, manifest: SceneManifest, ground?: THREE.MeshStandardMaterial, atlas?: THREE.Texture) {
  let seed = 918;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  // A thin grass canopy receives light across both sides of its curved ribbons.
  // Keep real shadow attenuation; broad diffuse response prevents backlit blades
  // from becoming black opaque slivers against the lit ground.
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", `
        vec3 turfView = normalize(vViewPosition);
        normal = normalize(normal - min(dot(normal, turfView) - .001, 0.0) * turfView);
      `));
    shader.fragmentShader = shader.fragmentShader.replace("#include <lights_physical_pars_fragment>",
      THREE.ShaderChunk.lights_physical_pars_fragment.replace(
        "reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );",
        "reflectedLight.directDiffuse += saturate(dot(normalize(vNormal), directLight.direction) * .7 + .3) * directLight.color * BRDF_Lambert(material.diffuseContribution);"));
  };
  material.customProgramCacheKey = () => "arroyo-two-sided-canopy-turf-v1";
  const geometries = Array.from({ length: 2 }, (_, variant) => {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const count = 4 + variant * 2;
    for (let blade = 0; blade < count; blade++) {
      const angle = (blade / count + (random() - .5) * .14) * Math.PI * 2;
      const h = .11 + random() * (.065 + variant * .03);
      // Mixed broad and narrow leaf ribbons overlap in projection, giving the
      // lawn real cover instead of thousands of isolated subpixel needles.
      const width = (blade % 3 === 0 ? .013 : .008) + random() * .0045, bend = .04 + random() * .08;
      const dx = Math.cos(angle), dy = Math.sin(angle), root = .018 + random() * .052;
      const start = positions.length / 3;
      const baseColor = new THREE.Color(blade % 4 === 0 ? 0xad9f5c : blade % 3 === 0 ? 0x789447 : 0x90a54e);
      // Three curved segments retain the fine arch at walking distance. Spend
      // geometry on continuous turf coverage rather than subpixel blade edges.
      for (let segment = 0; segment <= 3; segment++) {
        const t = segment / 3, lean = bend * t * t;
        const z = h * (1.18 * t - .18 * t * t), halfWidth = width * Math.pow(1 - t, .7);
        for (const side of [-1, 1]) {
          positions.push(dx * (root + lean) - dy * halfWidth * side,
            dy * (root + lean) + dx * halfWidth * side, z);
          const c = baseColor.clone().multiplyScalar(.8 + .2 * t);
          colors.push(c.r, c.g, c.b);
        }
        if (segment < 3) {
          const k = start + segment * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // Geometric ribbon normals lean downward as each blade arches away from its
    // root. Shade the fine canopy upward with a little radial variation instead;
    // the actual curved positions still determine silhouettes and cast shadows.
    const normals = geometry.getAttribute("normal");
    const canopyNormal = new THREE.Vector3();
    for (let i = 0; i < normals.count; i++) {
      canopyNormal.set(normals.getX(i) * .22, normals.getY(i) * .22, 1).normalize();
      normals.setXYZ(i, canopyNormal.x, canopyNormal.y, canopyNormal.z);
    }
    return geometry;
  });
  const materials = [material, material];
  if (atlas) {
    // Three crossed, vertically curved silhouettes replace one ribbon variant.
    // UVs crop directly to each original tussock's roots: the lower transparent
    // margin is not mapped above the ground, so no floating rectangular cards.
    const positions: number[] = [], uvs: number[] = [], colors: number[] = [], indices: number[] = [];
    const quadrants = [
      { left: .02, right: .49, top: .03, root: .443, width: .35, height: .198 },
      { left: .51, right: .99, top: .04, root: .443, width: .33, height: .212 },
      { left: .02, right: .495, top: .535, root: .913, width: .36, height: .205 },
    ];
    quadrants.forEach((quad, card) => {
      const angle = card * Math.PI / 3 + .13, dx = Math.cos(angle), dy = Math.sin(angle);
      const start = positions.length / 3;
      for (let row = 0; row <= 3; row++) {
        const t = row / 3, bend = (.021 + card * .004) * t * t;
        for (const side of [-1, 1]) {
          positions.push(dx * side * quad.width / 2 - dy * bend,
            dy * side * quad.width / 2 + dx * bend, quad.height * t);
          // Atlas is a DataTexture with flipY=false: v=0 is the PNG's top row.
          uvs.push(side < 0 ? quad.left : quad.right, quad.root + (quad.top - quad.root) * t);
          const shade = .9 + .1 * t; colors.push(shade, shade, shade);
        }
        if (row < 3) {
          const k = start + row * 2; indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    });
    const cards = new THREE.BufferGeometry();
    cards.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    cards.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    cards.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    cards.setIndex(indices); cards.computeVertexNormals();
    const normals = cards.getAttribute("normal"), normal = new THREE.Vector3();
    for (let i = 0; i < normals.count; i++) {
      normal.set(normals.getX(i) * .12, normals.getY(i) * .12, 1).normalize();
      normals.setXYZ(i, normal.x, normal.y, normal.z);
    }
    geometries[1].dispose(); geometries[1] = cards;
    const clumps = new THREE.MeshStandardMaterial({ map: atlas, vertexColors: true,
      side: THREE.DoubleSide, roughness: 1, alphaTest: .45, transparent: false });
    clumps.name = "Arroyo original grass-card canopy";
    clumps.onBeforeCompile = material.onBeforeCompile;
    clumps.customProgramCacheKey = material.customProgramCacheKey;
    materials[1] = clumps;
  }
  const matrices: THREE.Matrix4[][] = geometries.map(() => []), dummy = new THREE.Object3D();
  function clearGround(x: number, y: number) {
    if (Math.abs(x) > manifest.halfSize - .5 || Math.abs(y) > manifest.halfSize - .5) return false;
    if (manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0], y - manifest.culdesac.center[1]) < manifest.culdesac.radius + 2.55) return false;
    return !manifest.roads.some(road => road.points.slice(1).some((end, i) => {
      const start = road.points[i], margin = road.width / 2 + 2.5;
      return x >= Math.min(start[0], end[0]) - margin && x <= Math.max(start[0], end[0]) + margin &&
        y >= Math.min(start[1], end[1]) - margin && y <= Math.max(start[1], end[1]) + margin;
    }));
  }
  function tuft(x: number, y: number) {
    if (!clearGround(x, y)) return;
    dummy.position.set(x, y, manifest.groundZ - .006);
    dummy.rotation.set(0, 0, random() * Math.PI * 2);
    const s = .60 + random() * .73;
    dummy.scale.set(s * (.7 + random() * .6), s, Math.min(1.16, s * (.7 + random() * .4)));
    dummy.updateMatrix();
    const variant = Math.floor(random() * geometries.length);
    // The broad alpha cards need the same complete footprint clearance as the
    // yard turf, including along roadside edges. Consume the same RNG samples
    // first so the existing yard distribution remains stable with an atlas.
    if (atlas && !clearYard(x, y)) return;
    matrices[variant].push(dummy.matrix.clone());
  }
  for (const road of manifest.roads) for (let i = 1; i < road.points.length; i++) {
    const a = road.points[i - 1], b = road.points[i], length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length;
    for (const side of [-1, 1]) for (let t = random(); t < length; t += .9 + random() * 2.1) {
      if (random() < .30) continue; // Deliberate bare soil between separate plants.
      const depth = .15 + random() * .85, patchLength = .25 + random() * 1.2;
      const count = 4 + Math.floor(random() * 9);
      for (let n = 0; n < count; n++) {
        const along = t + (random() - .5) * patchLength;
        const offset = side * (road.width / 2 + 2.55 + depth * random());
        tuft(a[0] + dx * along - dy * offset, a[1] + dy * along + dx * offset);
      }
    }
  }
  if (manifest.culdesac) {
    const { center, radius } = manifest.culdesac;
    for (let angle = 0; angle < Math.PI * 2; angle += .075 + random() * .085) {
      if (random() < .35) continue;
      for (let n = 0; n < 5; n++) {
        const a = angle + (random() - .5) * .025, r = radius + 2.60 + random() * .65;
        tuft(center[0] + Math.cos(a) * r, center[1] + Math.sin(a) * r);
      }
    }
  }
  // A few blades per tuft spread the same geometry budget over the whole lawn,
  // instead of spending most blades inside overlapping, isolated clumps.
  const yardCells = new Map<string, { matrices: THREE.Matrix4[][]; tones: THREE.Color[][] }>();
  const maxYardTufts = 23000, maxYardTriangles = 740000;
  let yardCount = 0, yardTriangles = 0;
  function clearYard(x: number, y: number) {
    if (!clearGround(x, y)) return false;
    // Include the full blade footprint in every fixture barrier/house/fence exclusion.
    if (manifest.barriers.some(b => Math.abs(x - b.position[0]) <= b.size[0] / 2 + .40 &&
      Math.abs(y - b.position[1]) <= b.size[1] / 2 + .40)) return false;
    if (manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0], y - manifest.culdesac.center[1]) < manifest.culdesac.radius + 2.90) return false;
    if (manifest.roads.some(road => road.points.slice(1).some((end, i) => {
      const start = road.points[i], margin = road.width / 2 + 2.90;
      return x >= Math.min(start[0], end[0]) - margin && x <= Math.max(start[0], end[0]) + margin &&
        y >= Math.min(start[1], end[1]) - margin && y <= Math.max(start[1], end[1]) + margin;
    }))) return false;
    return !manifest.houses.some(house => {
      const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
      const dx = x - house.position[0], dy = y - house.position[1];
      const lx = (dx * c + dy * s) / (house.scale?.[0] || 1), ly = (-dx * s + dy * c) / (house.scale?.[1] || 1);
      // Authored meter-scale footprints: shell, covered porch, driveway and their access paths.
      return (Math.abs(lx) < 8.6 && Math.abs(ly) < 6.6) ||
        (lx > -6.85 && lx < .85 && ly > -9.5 && ly < -5.2) ||
        (lx > 3.5 && lx < 8.5 && ly > -21 && ly < -5.5) ||
        (lx > -4.9 && lx < -1.1 && ly > -21 && ly < -5.5);
    });
  }
  // Soil triangles can bridge a thin fence even when all three vertices are
  // outside it. Conservative triangle bounds keep all fixture obstacles clear.
  const soilObstacleBounds = manifest.barriers.map(b => new THREE.Box2(
    new THREE.Vector2(b.position[0] - b.size[0] / 2, b.position[1] - b.size[1] / 2),
    new THREE.Vector2(b.position[0] + b.size[0] / 2, b.position[1] + b.size[1] / 2)));
  const soilPositions: number[] = [], soilColors: number[] = [], soilUVs: number[] = [];
  function soilTransition(x: number, y: number, radiusX: number, radiusY: number, orientation: number) {
    const rings: { x: number; y: number; alpha: number }[][] = [];
    for (const radius of [0, .62, 1]) {
      const row = [];
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2;
        const rough = 1 + .16 * Math.sin(a * 3 + x) + .11 * Math.cos(a * 5 + y);
        const dx = Math.cos(a) * radiusX * radius * rough, dy = Math.sin(a) * radiusY * radius * rough;
        row.push({x:x + dx*Math.cos(orientation) - dy*Math.sin(orientation), y:y + dx*Math.sin(orientation) + dy*Math.cos(orientation), alpha:radius===1 ? 0 : radius===0 ? .57 : .43});
      }
      rings.push(row);
    }
    for(let ring=0;ring<2;ring++)for(let i=0;i<14;i++) {
      const next=(i+1)%14;
      for(const triangle of [[rings[ring][i],rings[ring+1][i],rings[ring+1][next]],[rings[ring][i],rings[ring+1][next],rings[ring][next]]]) {
        const [ta,tb,tc]=triangle;
        if(Math.abs((tb.x-ta.x)*(tc.y-ta.y)-(tb.y-ta.y)*(tc.x-ta.x))<1e-8)continue;
        if(!triangle.every(p=>clearYard(p.x,p.y)))continue;
        const bounds = new THREE.Box2().setFromPoints(triangle.map(p => new THREE.Vector2(p.x,p.y)));
        if(soilObstacleBounds.some(obstacle => obstacle.intersectsBox(bounds)))continue;
        for(const p of triangle) {
          soilPositions.push(p.x,p.y,manifest.groundZ+.008);
          soilUVs.push(p.x/2,p.y/2);
          soilColors.push(1,.92,.74,p.alpha);
        }
      }
    }
  }
  const fenceBounds = manifest.barriers.filter(b => b.id?.startsWith("fence-")).map(b => ({
    x: b.position[0], y: b.position[1], halfX: b.size[0] / 2, halfY: b.size[1] / 2,
  }));
  const candidates: { x: number; y: number; vigor: number; edge: boolean }[] = [];
  const occupied = new Map<string, { x: number; y: number }[]>();
  function offerTuft(x: number, y: number) {
    if (!clearYard(x, y)) return;
    // A small spatial exclusion prevents overlapping house/prop distributions
    // from recreating the dense islands this planting replaces.
    const cellX = Math.floor(x / .16), cellY = Math.floor(y / .16);
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
      if (occupied.get(`${cellX + dx},${cellY + dy}`)?.some(p => (p.x - x) ** 2 + (p.y - y) ** 2 < .095 ** 2)) return;
    const edge = fenceBounds.some(b => Math.hypot(Math.max(0, Math.abs(x - b.x) - b.halfX),
      Math.max(0, Math.abs(y - b.y) - b.halfY)) < 1.2);
    const vigor = 1 - Math.min(1, Math.max(0, (groundCover(x, y) - .25) / .45));
    if (random() > (edge ? .98 : .73 + vigor * .21)) return;
    const site = `${cellX},${cellY}`;
    if (!occupied.has(site)) occupied.set(site, []);
    occupied.get(site)!.push({ x, y }); candidates.push({ x, y, vigor, edge });
  }
  const spacing = .20;
  for (const house of manifest.houses) {
    const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
    const scaleX = house.scale?.[0] || 1, scaleY = house.scale?.[1] || 1;
    // Jitter every site across the full front lawn. The measured clearYard
    // exclusions carve out the porch, driveway, door path, fences and sidewalks.
    for (let ly = -20.5; ly < -6.6; ly += spacing) for (let lx = -14.4; lx < 14.4; lx += spacing) {
      const px = (lx + (random() - .5) * spacing * 1.65) * scaleX;
      const py = (ly + (random() - .5) * spacing * 1.65) * scaleY;
      offerTuft(house.position[0] + px * c - py * s, house.position[1] + px * s + py * c);
    }
    // A few broad translucent soil changes sit beneath continuous turf instead
    // of tracing a dark outline around every former tuft island.
    for (let patch = 0; patch < 14; patch++) {
      const lx = -10 + random() * 20, ly = -19.5 + random() * 11;
      soilTransition(house.position[0] + lx * c - ly * s, house.position[1] + lx * s + ly * c,
        .55 + random() * .8, .7 + random() * 1.1, house.rotation);
    }
  }
  // Fine distributed growth around existing street props bridges the gaps
  // between house frontages, while the same fixture clearance rejects trunks.
  for (const prop of manifest.props.filter(p => ["palm", "tree", "pole"].includes(p.asset))) {
    const radius = prop.asset === "pole" ? 1.5 : 1.85;
    for (let dy = -radius; dy <= radius; dy += spacing) for (let dx = -radius; dx <= radius; dx += spacing) {
      if (Math.hypot(dx, dy) > radius - random() * .35) continue;
      offerTuft(prop.position[0] + dx + (random() - .5) * spacing * 1.65,
        prop.position[1] + dy + (random() - .5) * spacing * 1.65);
    }
  }
  // Shuffle before the global resource cap so every frontage retains coverage
  // even when a larger manifest generates more sites than the budget permits.
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  for (const { x, y, vigor, edge } of candidates) {
    const variant = Math.floor(random() * geometries.length), triangles = geometries[variant].index!.count / 3;
    if (yardCount >= maxYardTufts || yardTriangles + triangles > maxYardTriangles) break;
    const dry = random() < .05 + (1 - vigor) * .35;
    dummy.position.set(x, y, manifest.groundZ - .006);
    dummy.rotation.set(0, 0, random() * Math.PI * 2);
    const width = .95 + random() * .4;
    const height = dry ? .48 + random() * .28 : Math.min(1.16, .98 + vigor * .1 + random() * .1 + (edge ? .06 : 0));
    dummy.scale.set(width, width * (.8 + random() * .3), height); dummy.updateMatrix();
    const key = `${Math.floor(x / 24)},${Math.floor(y / 24)}`;
    if (!yardCells.has(key)) yardCells.set(key, { matrices: geometries.map(() => []), tones: geometries.map(() => []) });
    const cell = yardCells.get(key)!;
    cell.matrices[variant].push(dummy.matrix.clone());
    cell.tones[variant].push(new THREE.Color(0xc5d7a0).lerp(new THREE.Color(0xdfca95), 1 - vigor).multiplyScalar(.90 + .10 * (1 - vigor)));
    yardCount++; yardTriangles += triangles;
  }
  if (soilPositions.length) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position",new THREE.Float32BufferAttribute(soilPositions,3));
    geometry.setAttribute("color",new THREE.Float32BufferAttribute(soilColors,4));
    geometry.setAttribute("uv",new THREE.Float32BufferAttribute(soilUVs,2));geometry.computeVertexNormals();
    const soil=new THREE.MeshStandardMaterial({...(ground?.map ? {map:ground.map} : {}),color:0xb2a281,vertexColors:true,roughness:1,transparent:true,opacity:1,depthWrite:false});
    // Reuse original grass/soil grain, without creating another bitmap or texture.
    soil.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace("#include <map_fragment>",`#ifdef USE_MAP
      vec3 groundGrain=texture2D(map,vMapUv).rgb;
      float grain=dot(groundGrain,vec3(.3,.59,.11));
      diffuseColor.rgb*=vec3(grain*.86,grain*.78,grain*.62);
    #endif`);};
    soil.customProgramCacheKey=()=>"arroyo-original-soil-transition-v1";
    const mesh=new THREE.Mesh(geometry,soil);mesh.name="Arroyo original soil transitions";mesh.receiveShadow=true;mesh.renderOrder=1;scene.add(mesh);
  }
  for (const [key, cell] of yardCells) geometries.forEach((geometry, variant) => {
    if (!cell.matrices[variant].length) return;
    const mesh = new THREE.InstancedMesh(geometry, materials[variant], cell.matrices[variant].length);
    mesh.name = `Arroyo yard grass ${key} ${variant}`;
    mesh.userData.yardCell = key;
    cell.matrices[variant].forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, cell.tones[variant][i]); });
    mesh.receiveShadow = true; mesh.castShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); scene.add(mesh);
  });
  geometries.forEach((geometry, variant) => {
    const mesh = new THREE.InstancedMesh(geometry, materials[variant], matrices[variant].length);
    mesh.name = `Arroyo grass clumps ${variant}`;
    matrices[variant].forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  });
}
