import { buildingSolid, type CityDistrict } from "./city";
import type { BoxSpec, Vec2 } from "./config";
import type { WalkSurface } from "./walk-surfaces";

export const RECOVERY_SITES = {
  spawn: { x: -38, z: 25 }, exit: { x: -42, z: 31, radius: 4 }, van: { x: -51, z: 31 },
  scout: { x: -58, z: -24 }, truck: { x: -76, z: -24 }, security: { x: -91, z: -24 },
};
/** Centreline of a continuous dogleg. Fillets keep long chassis inside the junction. */
export const RECOVERY_ROUTE: Vec2[] = [
  { x: 17, z: -24 }, { x: 19.7, z: -23.5 }, { x: 22, z: -22 },
  { x: 23.5, z: -19.7 }, { x: 24, z: -17 },
  { x: 24, z: 13 }, { x: 24.5, z: 15.7 }, { x: 26, z: 18 },
  // Continue beyond the failure line so the scout never parks in the truck's exit.
  { x: 28.3, z: 19.5 }, { x: 31, z: 20 }, { x: 116, z: 20 },
];
export const RECOVERY_ROLL_DELAY = 12;
export const RECOVERY_DRIVE_HP = 120;
export const RECOVERY_SPEED = 2.6;

export const RECOVERY_SURFACES: WalkSurface[] = [
  { id: "recovery-south-base", x: -5, z: 7, w: 8, d: 14, height: 1.4, slopeZ: -.2, thickness: .4, filled: true },
  { id: "recovery-south-span", x: -5, z: -5, w: 8, d: 10, height: 3.8, slopeZ: -.2, thickness: .4 },
  { id: "recovery-bridge", x: -5, z: -24, w: 8, d: 28, height: 4.8, thickness: .4 },
  { id: "recovery-north-span", x: -5, z: -43, w: 8, d: 10, height: 3.8, slopeZ: .2, thickness: .4 },
  { id: "recovery-north-base", x: -5, z: -55, w: 8, d: 14, height: 1.4, slopeZ: .2, thickness: .4, filled: true },
];
export const RECOVERY_RAILS: WalkSurface[] = RECOVERY_SURFACES.flatMap(s => [-1, 1].map(side => ({
  ...s, id: `${s.id}-rail-${side}`, x: s.x + side * 3.91, w: .18, height: s.height + .9, thickness: .9, filled: false,
})));
export const RECOVERY_COVER: BoxSpec[] = [
  // The maintenance yard protects deployment, with an eastern opening to the junction.
  { x: -39, z: 6, w: 32, d: .6, h: 2.7, style: "wall" },
  { x: -56, z: 23, w: .6, d: 34, h: 2.7, style: "wall" },
  { x: -27, z: -15, w: 5, d: 2, h: 2.2, style: "crate" },
  { x: 8, z: -38, w: 5, d: 1.2, h: 2.5, style: "crate" },
  { x: 35, z: 2, w: 4, d: 3, h: 2.4, style: "crate" },
  { x: 10, z: 26, w: 4.5, d: 1.4, h: 2.2, style: "crate" },
  ...[-8.5, -1.5].flatMap(x => [-34, -14].map(z => ({ x, z, w: .55, d: .8, h: 4.4, style: "wall" as const }))),
];

export const RECOVERY_DISTRICT: CityDistrict = {
  bounds: { left: -98, right: 98, back: -70, front: 62 },
  ground: { left: -122, right: 122, back: -92, front: 86 },
  ambientTraffic: false,
  streets: [
    { axis: "x", at: -24, center: -46, length: 156, width: 13, sidewalk: 3 },
    { axis: "z", at: 24, center: -2, length: 57, width: 13, sidewalk: 3 },
    { axis: "x", at: 20, center: 72, length: 110, width: 13, sidewalk: 3 },
  ], junctions: [],
  buildings: [
    { id: "recovery-workshop", prefab: "workshop", x: -39, z: -5, turn: 0, finish: "brick", accent: 0x889b8d },
    { id: "recovery-parts", prefab: "depot", x: -72, z: 7, turn: 1, finish: "slate", accent: 0xb9a675 },
    { id: "recovery-north-depot", prefab: "depot", x: -42, z: -49, turn: 0, finish: "slate", accent: 0x9b8b6d },
    { id: "recovery-east-depot", prefab: "depot", x: 49, z: -49, turn: 0, finish: "brick", accent: 0x7c9694 },
    { id: "recovery-bodyshop", prefab: "workshop", x: 51, z: -4, turn: 0, finish: "sand", accent: 0x9a886b },
    { id: "recovery-south-workshop", prefab: "workshop", x: 10, z: 47, turn: 2, finish: "brick", accent: 0x79958c },
    { id: "recovery-east-shop", prefab: "shop", x: 64, z: 47, turn: 2, finish: "sand", accent: 0x72968f },
    { id: "recovery-yard-office", prefab: "office", x: -68, z: 48, turn: 2, finish: "brick", accent: 0x7b949c },
    ...[-74, -40, 34, 70].map((x, i) => ({ id: `recovery-skyline-${i}`, prefab: "office" as const,
      x, z: -80, turn: 0 as const, finish: "slate" as const, accent: 0x778e91, backdrop: true })),
  ],
  plazas: [{ x: -38, z: 25, w: 35, d: 36 }, { x: 1, z: 27, w: 28, d: 16 },
    { x: 52, z: 7, w: 24, d: 12 }, { x: -28, z: -13, w: 25, d: 5 }],
  furniture: [-76, -42, 4, 47, 78].map(x => ({ x, z: x < 24 ? -33 : 29,
    w: .15, d: .15, h: 4.8, style: "barrier" as const, fixture: "lamp" as const })),
  water: [], pads: [], flights: [], porterRoutes: [],
  routes: [{ id: "recovery-workshop-meals", count: 2, color: 0x92a895, points: [
    { x: -83, z: 23 }, { x: -65, z: 23, stop: 3, building: "recovery-parts" },
    { x: -65, z: 35 }, { x: -83, z: 35 },
  ] }],
};
export const RECOVERY_FIXTURES: BoxSpec[] = [
  ...RECOVERY_DISTRICT.buildings.map(buildingSolid), ...RECOVERY_DISTRICT.furniture, ...RECOVERY_COVER,
];
