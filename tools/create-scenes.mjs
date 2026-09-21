// SPDX-License-Identifier: GPL-3.0-or-later
// Editable layout recipe. Generated manifests are committed and consumed directly.
import { readFileSync, writeFileSync } from "node:fs";
const yard = {
  id: "yard",
  name: "The test yard",
  revision: "yard-1",
  ...JSON.parse(readFileSync("test-server/arena.json")),
  teleport: [-4, -4, 10],
  houses: [],
  props: [],
  roads: [],
  route: [],
};
const n = {
  id: "neighborhood",
  name: "Arroyo",
  revision: "arroyo-1",
  groundZ: 9,
  halfSize: 90,
  spawns: [
    [-4, 0, 10],
    [4, 0, 10],
  ],
  teleport: [-4, -4, 10],
  vehicle: { model: 411, position: [0, 6, 10], heading: 0 },
  challenge: {
    id: "arroyo-loop",
    name: "Arroyo Loop",
    start: [0, 6, 10],
    startRadius: 3,
    countdownMs: 3000,
    maxMs: 180000,
    radius: 4.5,
    checkpoints: [[0, 12, 10], [30, 12, 10], [58, 12, 10], [58, -18, 10],
      [58, -48, 10], [28, -48, 10], [0, -48, 10], [0, -18, 10], [0, 6, 10]],
  },
  barriers: [],
  houses: [],
  props: [],
  roads: [
    {
      points: [
        [0, -66],
        [0, 40],
      ],
      width: 12,
    },
    {
      points: [
        [0, -48],
        [58, -48],
        [58, 12],
        [0, 12],
      ],
      width: 12,
    },
  ],
  culdesac: { center: [0, 40], radius: 18 },
  route: [
    [0, 6],
    [0, 12],
    [58, 12],
    [58, -48],
    [0, -48],
    [0, 6],
  ],
};
const barrier = (id, x, y, w, d, h = 3) =>
  n.barriers.push({ id, position: [x, y, 9 + h / 2], size: [w, d, h] });
barrier("boundary-west", -90, 0, 2, 182, 4);
barrier("boundary-east", 90, 0, 2, 182, 4);
barrier("boundary-north", 0, 90, 180, 2, 4);
barrier("boundary-south", 0, -90, 180, 2, 4);
// Rotations are radians about Z. House front is local -Y.
const lots = [
  [-27, -46, Math.PI / 2],
  [-27, -18, Math.PI / 2],
  [-27, 11, Math.PI / 2],
  [-28, 43, Math.PI / 2],
  [0, 71, 0],
  [29, 43, -Math.PI / 2],
  [77, 12, -Math.PI / 2],
  [77, -22, -Math.PI / 2],
  [28, -19, 0],
  [29, -72, Math.PI],
];
// Existing west-side oaks sit on open lawn between access paths. Their actual
// crowns cast across the street under the fixed sun; each trunk keeps its
// matching authoritative collider and the model/instance count stays unchanged.
const streetOaks = new Map([
  [1, [-13.5, 5.7]],
  [2, [-16.5, 23.5]],
  [3, [-19.5, 30]],
]);
for (let i = 0; i < lots.length; i++) {
  const [x, y, rotation] = lots[i],
    variant = i % 4;
  n.houses.push({
    id: `house-${i}`,
    asset: `house-${variant}`,
    position: [x, y, 9],
    rotation,
  });
  const turn = Math.abs(Math.sin(rotation)) > 0.5;
  barrier(`house-${i}`, x, y, turn ? 12 : 16, turn ? 16 : 12, 5.8);
  const point = (u, v) => [
    x + u * Math.cos(rotation) - v * Math.sin(rotation),
    y + u * Math.sin(rotation) + v * Math.cos(rotation),
    9,
  ];
  for (const [u, v, w, d] of [
    [-11, 0, 0.15, 23],
    [11, 0, 0.15, 23],
    [0, 11, 22, 0.15],
    [-5, -11, 12, 0.15],
  ]) {
    const p = point(u, v);
    barrier(
      `fence-${i}-${u}-${v}`,
      p[0],
      p[1],
      turn ? d : w,
      turn ? w : d,
      1.05,
    );
    n.props.push({
      asset: "fence",
      position: p,
      rotation: rotation + (w > d ? 0 : Math.PI / 2),
      scale: [Math.max(w, d) / 4, 1, 1],
    });
  }
  for (const [asset, u, v] of [
    ["mailbox", -9, -11],
    ["bin", 8, -8],
    ["palm", -8, -7],
    ["tree", 8, 8],
  ]) {
    const streetOak = asset === "tree" && streetOaks.get(i);
    const p = streetOak ? [...streetOak, 9] : point(u, v);
    n.props.push({ asset, position: p, rotation: 0 });
    if (asset === "palm" || asset === "tree")
      barrier(`${asset}-${i}`, p[0], p[1], 0.7, 0.7, 8);
  }
}
// Keep fixtures outside both the intersection and the circular turning area.
for (const y of [-62, -30, 2, 34])
  for (const side of [-1, 1]) {
    const poleX = side * (y === 34 ? 21 : 9),
      lampY = y === 34 ? 58 : y === 2 ? 22 : y === -62 ? -57 : y + 8;
    n.props.push({ asset: "pole", position: [poleX, y, 9], rotation: 0 });
    n.props.push({
      asset: "lamp",
      position: [side * 11.7, lampY, 9],
      rotation: side < 0 ? 0 : Math.PI,
    });
  }
for (const x of [22, 50])
  for (const y of [-57, 21]) {
    n.props.push({ asset: "palm", position: [x, y, 9], rotation: 0 });
    barrier(`palm-street-${x}-${y}`, x, y, 0.7, 0.7, 8);
  }
// Append the mature oak so existing prop indices (and their garden layouts)
// remain stable. Its overhead crown casts real shade into the middle road.
n.props.push({ asset: "roadside-oak", position: [-13, 14, 9], rotation: 0 });
barrier("roadside-oak-0", -13, 14, 0.7, 0.7, 11.4);
// A community meet-up beside the junction. Every solid prop has an envelope
// in the same manifest used by browser collision and fixture course generation.
for (const [id, asset, x, y, rotation, width, depth, height] of [
  ["activity-board", "activity-board", 10.3, 21.2, 0, 2.8, .52, 2.64],
  ["activity-bench-a", "activity-bench", 18, 22, 0, 2.06, .80, .93],
  ["activity-planter-a", "activity-planter", 21, 22, 0, 1.42, 1.42, 1.58],
  ["activity-bench-b", "activity-bench", 21, 26, -Math.PI/2, .80, 2.06, .93],
  ["activity-planter-b", "activity-planter", 16, 26, 0, 1.42, 1.42, 1.58],
]) {
  n.props.push({ id, asset, position: [x, y, n.groundZ], rotation });
  barrier(id, x, y, width, depth, height);
}
// Pylons frame the course without narrowing the usable driving lane.
for (const [i, point] of [[-4.9, 4], [4.9, 4], [30, 18.9], [64.9, -18],
  [28, -54.9], [-6.9, -18]].entries()) {
  const id = `activity-pylon-${i}`;
  n.props.push({ id, asset: "activity-pylon", position: [...point, n.groundZ], rotation: i * .27 });
  barrier(id, point[0], point[1], .90, .90, 1.065);
}
// Original rosettes fill existing beds. Keep their complete leaf envelope clear
// of roads, sidewalks, fences, entrances and the established walking test path.
const gardenPoints = n.houses.flatMap(house => [[-8.3,-9.4],[1.7,-9.3],[-7.4,-13.6]].map(([u,v]) => [
  house.position[0] + u*Math.cos(house.rotation) - v*Math.sin(house.rotation),
  house.position[1] + u*Math.sin(house.rotation) + v*Math.cos(house.rotation),
]));
gardenPoints.push([-10.5,17],[-12.1,18.2],[-11.4,20]);
for (const [i, [x,y]] of gardenPoints.entries()) {
  if (n.barriers.some(b => Math.abs(x-b.position[0]) <= b.size[0]/2+.6 && Math.abs(y-b.position[1]) <= b.size[1]/2+.6)) continue;
  if (n.culdesac && Math.hypot(x-n.culdesac.center[0],y-n.culdesac.center[1]) < n.culdesac.radius+3.1) continue;
  if (n.roads.some(road => road.points.slice(1).some((end,j) => {
    const begin=road.points[j], margin=road.width/2+3.1;
    return x>=Math.min(begin[0],end[0])-margin && x<=Math.max(begin[0],end[0])+margin &&
      y>=Math.min(begin[1],end[1])-margin && y<=Math.max(begin[1],end[1])+margin;
  }))) continue;
  const id=`activity-yucca-${i}`;
  n.props.push({id,asset:"activity-yucca",position:[x,y,n.groundZ],rotation:i*2.39996});
  barrier(id,x,y,.98,.98,.67);
}
for (const scene of [yard, n])
  writeFileSync(
    `packages/shared/scenes/${scene.id}.json`,
    JSON.stringify(scene, null, 2) + "\n",
  );
