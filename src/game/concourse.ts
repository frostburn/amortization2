import { buildingSolid, type CityDistrict } from "./city";
import type { BoxSpec } from "./config";
import type { WalkSurface } from "./walk-surfaces";

/** A civic pedestrian loop above a live street: two ramps up, two ramps higher. */
export const CONCOURSE_SURFACES: WalkSurface[] = [
  ...[-26, 26].map((x): WalkSurface => ({ id: `arrival-${x}`, x, z: 3, w: 8, d: 24,
    height: 2.4, slopeZ: -0.2, thickness: 0.4, filled: true })),
  ...[-26, 26].map((x): WalkSurface => ({ id: `terrace-${x}`, x, z: -16, w: 16, d: 14,
    height: 4.8, thickness: 0.4, filled: true })),
  { id: "street-bridge", x: 0, z: -16, w: 36, d: 8, height: 4.8, thickness: 0.4 },
  ...[-26, 26].map((x): WalkSurface => ({ id: `gallery-ramp-${x}`, x, z: -32, w: 8, d: 18,
    height: 6.6, slopeZ: -0.2, thickness: 0.4 })),
  { id: "upper-gallery", x: 0, z: -45, w: 60, d: 8, height: 8.4, thickness: 0.4 },
];

/** Real parapets follow the incline; gaps only occur at connected path mouths. */
export const CONCOURSE_RAILS: WalkSurface[] = [];
const rail = (s: WalkSurface, side: "x" | "z", at: number, center: number, length: number) => {
  CONCOURSE_RAILS.push({ id: `rail-${CONCOURSE_RAILS.length}`, x: side === "x" ? at : center,
    z: side === "z" ? at : center, w: side === "x" ? .18 : length, d: side === "z" ? .18 : length,
    height: s.height + .92 + (side === "z" ? (at - s.z) * (s.slopeZ ?? 0) : 0),
    slopeZ: s.slopeZ, thickness: .92 });
};
for (const s of CONCOURSE_SURFACES) {
  if (s.id.includes("ramp") || s.id.includes("arrival")) {
    for (const sign of [-1, 1]) rail(s, "x", s.x + sign * (s.w / 2 - .09), s.z, s.d);
  } else if (s.id.startsWith("terrace")) {
    const outside = Math.sign(s.x);
    rail(s, "x", s.x + outside * 7.91, s.z, s.d);
    // Inner terrace edges meet the central bridge. The north/south edges
    // leave eight-metre ramp openings rather than blocking their joints.
    for (const z of [-22.91, -9.09]) for (const side of [-1, 1]) rail(s, "z", z, s.x + side * 6, 4);
    for (const z of [-21.5, -10.5]) rail(s, "x", s.x - outside * 7.91, z, 3);
  } else if (s.id === "street-bridge") {
    for (const sign of [-1, 1]) rail(s, "z", s.z + sign * 3.91, 0, s.w);
  } else {
    rail(s, "z", -48.91, 0, 60);
    rail(s, "z", -41.09, 0, 44);
    for (const sign of [-1, 1]) rail(s, "x", sign * 29.91, s.z, 8);
  }
}

export const CONCOURSE_DISTRICT: CityDistrict = {
  bounds: { left: -60, right: 60, back: -54, front: 44 },
  ground: { left: -87, right: 87, back: -79, front: 70 },
  streets: [
    { axis: "z", at: 0, center: -4.5, length: 149, width: 10.5, sidewalk: 4.5 },
    { axis: "x", at: 28, center: 0, length: 174, width: 10.5, sidewalk: 4.5 },
  ],
  junctions: [{ x: 0, z: 28 }],
  buildings: [
    { id: "gallery-west", prefab: "civic", x: -47, z: -34, turn: 1, finish: "sand", accent: 0x699891 },
    { id: "gallery-east", prefab: "civic", x: 47, z: -34, turn: 3, finish: "slate", accent: 0xb48b5b },
    { id: "west-studios", prefab: "apartment", x: -48, z: 2, turn: 1, finish: "brick", accent: 0x637f87 },
    { id: "east-labs", prefab: "office", x: 48, z: 2, turn: 3, finish: "sand", accent: 0x84926d },
    { id: "south-cafe", prefab: "shop", x: -27, z: 48, turn: 2, finish: "sand", accent: 0x648b76, backdrop: true },
    { id: "south-dispatch", prefab: "shop", x: 27, z: 48, turn: 2, finish: "brick", accent: 0xa18457, backdrop: true },
    { id: "north-tower-west", prefab: "office", x: -25, z: -67, turn: 0, finish: "slate", accent: 0x849e9e, backdrop: true },
    { id: "north-tower-east", prefab: "office", x: 25, z: -67, turn: 0, finish: "sand", accent: 0x7993a1, backdrop: true },
  ],
  plazas: [{ x: -26, z: -17, w: 29, d: 76 }, { x: 26, z: -17, w: 29, d: 76 }],
  furniture: [
    ...[-1, 1].flatMap((s) => [-4, 20, -52].map(z => ({ x: s * 9, z, w: .15, d: .15, h: 4.2,
      style: "barrier" as const, fixture: "lamp" as const }))),
    ...[-1, 1].map(s => ({ x: s * 15, z: 16, w: 2, d: 2, h: .85,
      style: "barrier" as const, fixture: "planter" as const })),
  ],
  routes: [{ id: "concourse-meals", count: 3, color: 0xa8b9a0, points: [
    { x: -9, z: 19 }, { x: -34, z: 19, stop: 3, building: "west-studios" },
    { x: -35, z: -52 }, { x: 35, z: -52 }, { x: 35, z: 19, stop: 3, building: "east-labs" },
    { x: 9, z: 19 },
  ] }],
  pads: [], flights: [], water: [],
};
export const CONCOURSE_FIXTURES: BoxSpec[] = [
  ...CONCOURSE_DISTRICT.buildings.map(buildingSolid), ...CONCOURSE_DISTRICT.furniture,
  // Bridge supports land in the plazas, leaving the carriageway and sidewalks clear.
  ...[-14, 14].map(x => ({ x, z: -16, w: .85, d: 1.6, h: 4.4, style: "wall" as const })),
  ...[-20, 20].map(x => ({ x, z: -45, w: 1, d: 1.6, h: 8, style: "wall" as const })),
  ...CONCOURSE_SURFACES.filter(s => s.id === "street-bridge" || s.id === "upper-gallery")
    .flatMap(s => [-1, 1].map(side => ({ x: s.x, z: s.z + side * (s.d / 2 - .5),
      w: s.w, d: .25, y: s.height - .76, h: .36, style: "wall" as const }))),
];
