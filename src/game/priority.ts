import { buildingSolid, type CityDistrict } from "./city";
import type { BoxSpec, Vec2 } from "./config";
import type { WalkSurface } from "./walk-surfaces";

export const PRIORITY_SITES = {
  loading: { x: -24, z: -18, radius: 5 },
  dispatch: { x: 10, z: -19, radius: 3.2 },
  exit: { x: -49, z: 20, radius: 2.8 },
  van: { x: -50, z: 15 },
  serviceVan: { x: 68, z: 0 },
  serviceStop: { x: 35, z: 0 },
  technicians: [{ x: 8.5, z: -21 }, { x: 11.5, z: -21 }],
};
export const PRIORITY_GATE: BoxSpec = { x: 52, z: 0, w: .35, d: 10, h: 2.6, style: "wall" };

/** Four access ramps connect a public concourse, with a genuine service lane below. */
export const PRIORITY_SURFACES: WalkSurface[] = [
  ...[-42, 42].flatMap((x): WalkSurface[] => [
    { id: `priority-south-base-${x}`, x, z: 14, w: 8, d: 14, height: 1.4, slopeZ: -.2, thickness: .4, filled: true },
    { id: `priority-south-span-${x}`, x, z: 2, w: 8, d: 10, height: 3.8, slopeZ: -.2, thickness: .4 },
    { id: `priority-terrace-${x}`, x, z: -10, w: 14, d: 14, height: 4.8, thickness: .4, filled: true },
    { id: `priority-north-span-${x}`, x, z: -22, w: 8, d: 10, height: 3.8, slopeZ: .2, thickness: .4 },
    { id: `priority-north-base-${x}`, x, z: -34, w: 8, d: 14, height: 1.4, slopeZ: .2, thickness: .4, filled: true },
  ]),
  { id: "priority-bridge", x: 0, z: -10, w: 70, d: 8, height: 4.8, thickness: .4 },
];
export const PRIORITY_RAILS: WalkSurface[] = [];
for (const s of PRIORITY_SURFACES) {
  const add = (x: number, z: number, w: number, d: number) => PRIORITY_RAILS.push({
    id: `priority-rail-${PRIORITY_RAILS.length}`, x, z, w, d,
    height: s.height + .92 + (z - s.z) * (s.slopeZ ?? 0), slopeZ: s.slopeZ, thickness: .92,
  });
  if (s.slopeZ) for (const side of [-1, 1]) add(s.x + side * 3.91, s.z, .18, s.d);
  else if (s.id === "priority-bridge") for (const side of [-1, 1]) add(0, s.z + side * 3.91, s.w, .18);
  else {
    add(s.x + Math.sign(s.x) * 6.91, s.z, .18, s.d);
    for (const side of [-1, 1]) {
      for (const end of [-1, 1]) add(s.x + side * 5.5, s.z + end * 6.91, 3, .18);
      add(s.x - Math.sign(s.x) * 6.91, s.z + side * 5.5, .18, 3);
    }
  }
}
export const PRIORITY_SUPPORTS: BoxSpec[] = [-27, 27].map(x => ({ x, z: -10, w: .85, d: 1.4, h: 4.4, style: "wall" }));
export const PRIORITY_COVER: BoxSpec[] = [
  { x: -12, z: 6, w: 5, d: 2.2, h: 2.5, style: "crate" },
  { x: 12, z: 9, w: 7, d: .7, h: 1.1, style: "barrier" },
  { x: 32, z: 10, w: 5, d: .7, h: 1.1, style: "barrier" },
  { x: 18, z: -1, w: 1.3, d: 3, h: 2.4, style: "crate" },
  { x: -18, z: -19, w: 3, d: 2, h: 2.2, style: "crate" },
  { x: -8, z: -10, w: 4, d: .7, y: 4.8, h: 1.1, style: "barrier" },
  { x: 20, z: -10, w: 4, d: .7, y: 4.8, h: 1.1, style: "barrier" },
  // Gate posts and yard boundary leave broad street and west-lane entrances.
  ...[-6, 6].map(z => ({ x: 52, z, w: .7, d: .7, h: 3, style: "wall" as const })),
  { x: 52, z: -17, w: .4, d: 21, h: 2.6, style: "wall" },
  { x: 52, z: 9, w: .4, d: 5, h: 2.6, style: "wall" },
];
export const PRIORITY_GUARDS: { position: Vec2; brace: boolean; leash: number }[] = [
  // Keep the patrol off the public carriageway and its firing envelope outside deployment.
  { position: { x: -8, z: 18 }, brace: false, leash: 10 },
  { position: { x: -4, z: 17 }, brace: false, leash: 10 },
  { position: { x: 10, z: 5 }, brace: true, leash: 9 },
  { position: { x: 32, z: 6 }, brace: true, leash: 9 },
  { position: { x: -8, z: -12, y: 4.8 }, brace: true, leash: 12 },
  { position: { x: 20, z: -12, y: 4.8 }, brace: true, leash: 12 },
];
export const PRIORITY_RESPONSE = [
  { delay: 7, name: "STREET RESPONSE", positions: [{ x: 76, z: 27 }, { x: 79, z: 30 }, { x: 82, z: 27 }, { x: 85, z: 30 }], rally: { x: 30, z: 28 }, brace: false },
  { delay: 16, name: "CONCOURSE RESPONSE", positions: [{ x: 42, z: -44 }, { x: 45, z: -47 }], rally: { x: 32, z: -10, y: 4.8 }, brace: true },
] as const;

export const PRIORITY_DISTRICT: CityDistrict = {
  bounds: { left: -90, right: 90, back: -70, front: 70 },
  ground: { left: -115, right: 115, back: -96, front: 96 },
  streets: [
    ...[-60, 60].map(at => ({ axis: "z" as const, at, center: 0, length: 192, width: 10, sidewalk: 3.5 })),
    ...[-51, 28].map(at => ({ axis: "x" as const, at, center: 0, length: 230, width: 10, sidewalk: 3.5 })),
  ],
  junctions: [-60, 60].flatMap(x => [-51, 28].map(z => ({ x, z }))),
  buildings: [
    { id: "local-exchange", prefab: "exchange", x: 10, z: -33, turn: 0, finish: "slate", accent: 0x648b89 },
    { id: "exchange-office", prefab: "workshop", x: 10, z: -63, turn: 0, finish: "sand", accent: 0x849982 },
    { id: "repair-cooperative", prefab: "workshop", x: -29, z: 43, turn: 2, finish: "brick", accent: 0xa7996d },
    { id: "square-cafe", prefab: "shop", x: 16, z: 44, turn: 2, finish: "sand", accent: 0x648976 },
    { id: "west-homes", prefab: "apartment", x: -78, z: -26, turn: 1, finish: "brick", accent: 0x7c959c },
    { id: "west-parcels", prefab: "shop", x: -78, z: 1, turn: 1, finish: "sand", accent: 0xa58b69 },
    { id: "east-workshops", prefab: "workshop", x: 78, z: -26, turn: 3, finish: "brick", accent: 0x9a926d },
    { id: "east-homes", prefab: "apartment", x: 78, z: 2, turn: 3, finish: "sand", accent: 0x7b9694 },
    ...[-29, 14, 83, -83].map((x, i) => ({ id: `priority-skyline-${i}`, prefab: "office" as const, x, z: -81,
      turn: 0 as const, finish: "slate" as const, accent: 0x7e9297, backdrop: true })),
    ...[-29, 14, 78, -78].map((x, i) => ({ id: `priority-south-${i}`, prefab: "apartment" as const, x, z: 65,
      turn: 2 as const, finish: "brick" as const, accent: 0x84948e })),
  ],
  plazas: [{ x: 14, z: -5, w: 74, d: 34 }, { x: -42, z: 32, w: 19, d: 21 },
    { x: -50, z: 16, w: 8, d: 13 }, // Off-street pickup bay beside the west ramp.
    { x: 37, z: 44, w: 15, d: 21 }, { x: 52, z: 0, w: 33, d: 10 }],
  furniture: [-53, 53].flatMap(x => [-39, 7, 39].map(z => ({ x, z, w: .18, d: .18, h: 4.8,
    style: "barrier" as const, fixture: "lamp" as const }))),
  routes: [{ id: "priority-meals", count: 3, color: 0xa8b9a0, points: [
    { x: -50, z: 35 }, { x: 37, z: 35, stop: 3, building: "square-cafe" },
    { x: 37, z: 54 }, { x: -50, z: 54, stop: 2, building: "repair-cooperative" },
  ] }],
  porterRoutes: [0, 1].map(i => ({ id: `exchange-deliveries-${i}`, color: 0xc0aa75, points: [
    { x: -24 + i * 5, z: -31, station: { id: `exchange-held-${i}`, yaw: Math.PI } },
    { x: -24 + i * 5, z: -39, station: { id: `exchange-drop-${i}`, yaw: 0 } },
  ] })),
  pads: [], flights: [], water: [],
};
export const PRIORITY_FIXTURES: BoxSpec[] = [
  ...PRIORITY_DISTRICT.buildings.map(buildingSolid), ...PRIORITY_DISTRICT.furniture,
  ...PRIORITY_SUPPORTS, ...PRIORITY_COVER,
  ...[-1, 1].map(side => ({ x: 0, z: -10 + side * 3.5, w: 70, d: .25, y: 4.04, h: .36, style: "wall" as const })),
  { ...PRIORITY_SITES.van, w: 2, d: 5.5, h: 2.18, style: "crate" },
];
