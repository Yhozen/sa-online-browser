// SPDX-License-Identifier: GPL-3.0-or-later
import * as THREE from "three";
import type { SceneManifest } from "../../../packages/shared/scene";

/** Small curved grass clumps, with bare gaps and varied depth outside the sidewalks. */
export function plantVerges(scene: THREE.Scene, manifest: SceneManifest, ground?: THREE.MeshStandardMaterial) {
  let seed = 918;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  const geometries = Array.from({ length: 3 }, (_, variant) => {
    const positions: number[] = [], colors: number[] = [], indices: number[] = [];
    const count = 8 + variant * 2;
    for (let blade = 0; blade < count; blade++) {
      const angle = random() * Math.PI * 2, h = .055 + random() * (.105 + variant * .024);
      const width = .005 + random() * .0035, bend = .026 + random() * .07;
      const dx = Math.cos(angle), dy = Math.sin(angle), root = random() * .05;
      const start = positions.length / 3;
      const baseColor = new THREE.Color(blade % 4 === 0 ? 0x80774e : blade % 3 === 0 ? 0x565f3d : 0x647348);
      // Five ribbon segments give each blade an arch and taper; no giant triangular fans.
      for (let segment = 0; segment <= 5; segment++) {
        const t = segment / 5, lean = bend * t * t;
        const z = h * (1.18 * t - .18 * t * t), halfWidth = width * Math.pow(1 - t, .7);
        for (const side of [-1, 1]) {
          positions.push(dx * (root + lean) - dy * halfWidth * side,
            dy * (root + lean) + dx * halfWidth * side, z);
          const c = baseColor.clone().multiplyScalar(.65 + .35 * t);
          colors.push(c.r, c.g, c.b);
        }
        if (segment < 5) {
          const k = start + segment * 2;
          indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices); geometry.computeVertexNormals();
    // The two ribbon vertices coincide at a tapered tip. Give the unused degenerate
    // corner the preceding blade normal so every exported attribute stays normalized.
    const normals = geometry.getAttribute("normal");
    for (let i = 0; i < normals.count; i++)
      if (Math.hypot(normals.getX(i), normals.getY(i), normals.getZ(i)) < .001) {
        const previous = Math.max(0, i - 2);
        normals.setXYZ(i, normals.getX(previous), normals.getY(previous), normals.getZ(previous));
      }
    return geometry;
  });
  const matrices: THREE.Matrix4[][] = [[], [], []], dummy = new THREE.Object3D();
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
    dummy.updateMatrix(); matrices[Math.floor(random() * 3)].push(dummy.matrix.clone());
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
  // Additional yard planting is generated only after the original verge matrices:
  // its RNG use cannot alter the existing sidewalk clump positions or source frame.
  const yardCells = new Map<string, { matrices: THREE.Matrix4[][]; tones: THREE.Color[][] }>();
  const maxYardTufts = 3400; // At most 408k triangles globally, spatially culled in 24m cells.
  const quota = Math.floor(2800 / Math.max(1, manifest.houses.length));
  let yardCount = 0;
  function clearYard(x: number, y: number) {
    if (!clearGround(x, y)) return false;
    // Include the full blade footprint in every fixture barrier/house/fence exclusion.
    if (manifest.barriers.some(b => Math.abs(x - b.position[0]) <= b.size[0] / 2 + .30 &&
      Math.abs(y - b.position[1]) <= b.size[1] / 2 + .30)) return false;
    if (manifest.culdesac && Math.hypot(x - manifest.culdesac.center[0], y - manifest.culdesac.center[1]) < manifest.culdesac.radius + 2.80) return false;
    if (manifest.roads.some(road => road.points.slice(1).some((end, i) => {
      const start = road.points[i], margin = road.width / 2 + 2.80;
      return x >= Math.min(start[0], end[0]) - margin && x <= Math.max(start[0], end[0]) + margin &&
        y >= Math.min(start[1], end[1]) - margin && y <= Math.max(start[1], end[1]) + margin;
    }))) return false;
    return !manifest.houses.some(house => {
      const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
      const dx = x - house.position[0], dy = y - house.position[1];
      const lx = (dx * c + dy * s) / (house.scale?.[0] || 1), ly = (-dx * s + dy * c) / (house.scale?.[1] || 1);
      // Authored meter-scale footprints: shell, covered porch, driveway and their access paths.
      return (Math.abs(lx) < 8.6 && Math.abs(ly) < 6.6) ||
        (lx > -6.5 && lx < .5 && ly > -9.2 && ly < -5.5) ||
        (lx > 3.5 && lx < 8.5 && ly > -21 && ly < -5.5) ||
        (lx > -4.7 && lx < -1.3 && ly > -21 && ly < -5.5);
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
  for (const house of manifest.houses) {
    const c = Math.cos(house.rotation), s = Math.sin(house.rotation);
    let planted = 0;
    for (let patch = 0; patch < 110 && planted < quota && yardCount < maxYardTufts; patch++) {
      const left = random() < .48;
      const cx = left ? -9.2 + random() * 4 : -.9 + random() * 4;
      const cy = -19.5 + random() * 10.2;
      const spreadX = .30 + random() * .85, spreadY = .5 + random() * 1.15;
      const shoots = 18 + Math.floor(random() * 19);
      soilTransition(house.position[0]+cx*c-cy*s, house.position[1]+cx*s+cy*c, spreadX*1.18, spreadY*1.18, house.rotation);
      for (let n = 0; n < shoots && planted < quota && yardCount < maxYardTufts; n++) {
        const angle = random() * Math.PI * 2, radius = Math.sqrt(random());
        const lx = cx + Math.cos(angle) * radius * spreadX, ly = cy + Math.sin(angle) * radius * spreadY;
        const x = house.position[0] + lx * c - ly * s, y = house.position[1] + lx * s + ly * c;
        if (!clearYard(x, y)) continue;
        const dryShoot = random() < .14;
        dummy.position.set(x, y, manifest.groundZ - .006);
        dummy.rotation.set(0, 0, random() * Math.PI * 2);
        const width = .9 + random() * .85;
        dummy.scale.set(width, width * (.75 + random() * .35), dryShoot ? .42 + random() * .3 : .98 + random() * .18);
        dummy.updateMatrix();
        const key = `${Math.floor(x / 24)},${Math.floor(y / 24)}`;
        if (!yardCells.has(key)) yardCells.set(key, { matrices: [[], [], []], tones: [[], [], []] });
        const cell = yardCells.get(key)!, variant = Math.floor(random() * 3);
        cell.matrices[variant].push(dummy.matrix.clone());
        // Muted brown shoots and exposed ground between islands create dry soil breaks,
        // while living clumps use olive greens rather than the former yellow edge row.
        cell.tones[variant].push(new THREE.Color(dryShoot ? 0xb0a08a : random() < .5 ? 0xb1bb96 : 0x9ead8a));
        planted++; yardCount++;
      }
    }
  }
  // Wider rings around existing trunks and fence ends populate foreground grass
  // left empty by house-local bands; every placement remains below 0.25m.
  for (const prop of manifest.props.filter(p => ["palm", "tree", "pole"].includes(p.asset))) {
    for(let patch=0;patch<8 && yardCount<maxYardTufts;patch++) {
      const a=random()*Math.PI*2, distance=.8+random()*1.7;
      const cx=prop.position[0]+Math.cos(a)*distance, cy=prop.position[1]+Math.sin(a)*distance;
      soilTransition(cx,cy,.45+random()*.4,.55+random()*.6,a);
      for(let n=0;n<10 && yardCount<maxYardTufts;n++) {
        const x=cx+(random()-.5)*.85,y=cy+(random()-.5)*.85;
        if(!clearYard(x,y))continue;
        dummy.position.set(x,y,manifest.groundZ-.006);dummy.rotation.set(0,0,random()*Math.PI*2);
        dummy.scale.set(1+random()*.7,1+random()*.6,.98+random()*.18);dummy.updateMatrix();
        const key=`${Math.floor(x/24)},${Math.floor(y/24)}`;
        if(!yardCells.has(key))yardCells.set(key,{matrices:[[],[],[]],tones:[[],[],[]]});
        const cell=yardCells.get(key)!,variant=Math.floor(random()*3);
        cell.matrices[variant].push(dummy.matrix.clone());cell.tones[variant].push(new THREE.Color(0xb8bb94));yardCount++;
      }
    }
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
    const mesh = new THREE.InstancedMesh(geometry, material, cell.matrices[variant].length);
    mesh.name = `Arroyo yard grass ${key} ${variant}`;
    mesh.userData.yardCell = key;
    cell.matrices[variant].forEach((matrix, i) => { mesh.setMatrixAt(i, matrix); mesh.setColorAt(i, cell.tones[variant][i]); });
    mesh.receiveShadow = true; mesh.castShadow = true; mesh.computeBoundingBox(); mesh.computeBoundingSphere(); scene.add(mesh);
  });
  geometries.forEach((geometry, variant) => {
    const mesh = new THREE.InstancedMesh(geometry, material, matrices[variant].length);
    mesh.name = `Arroyo grass clumps ${variant}`;
    matrices[variant].forEach((matrix, i) => mesh.setMatrixAt(i, matrix));
    mesh.receiveShadow = true; mesh.computeBoundingSphere(); scene.add(mesh);
  });
}
