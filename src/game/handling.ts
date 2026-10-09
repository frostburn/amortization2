import { buildingSolid, type CityDistrict } from "./city";
import type { BoxSpec, RoofedArea } from "./config";

export const HANDLING_SITES = {
  box: { x: -19, z: 2.5 }, delivery: { x: 4, z: 0, radius: 2.4 },
  chest: { x: 28, z: 0 }, exit: { x: -26, z: 0, radius: 4.5 }, van: { x: -34, z: 0 },
};
export const HANDLING_GATE: BoxSpec = { x: 9, z: 0, w: 0.5, d: 8, h: 3.8, style: "wall" };
export const HANDLING_GUARDS = [{ x: 18, z: -6 }, { x: 21, z: 6 }, { x: 31, z: -5 }];
export const HANDLING_DRONE_ENTRIES = [{ x: -7, z: -15 }, { x: -4, z: 15 }, { x: 5, z: -8 }, { x: 5, z: 8 }];

/** Enclosed service hall. Its wide loading door admits a two-chassis load. */
export type ServiceHallSpec = { x: number; z: number; w: number; d: number; h: number; door: number };
export const SERVICE_HALL_SPEC: ServiceHallSpec = { x: 22, z: 0, w: 26, d: 24, h: 3.8, door: 8 };
export function serviceHallRoof(s: ServiceHallSpec): BoxSpec {
  return { x: s.x, z: s.z, w: s.w + 0.5, d: s.d + 0.5, y: s.h, h: 0.4, style: "wall" };
}
export const SERVICE_HALL_ROOF = serviceHallRoof(SERVICE_HALL_SPEC);
export const HANDLING_SHELTERS: RoofedArea[] = [{ ...SERVICE_HALL_ROOF, y: 0, h: SERVICE_HALL_ROOF.y! + SERVICE_HALL_ROOF.h,
  exits: [{ x: SERVICE_HALL_SPEC.x - SERVICE_HALL_SPEC.w / 2 - 3.6, z: SERVICE_HALL_SPEC.z }] }];
/** Full-height perimeter; camera cutaways never change these combat solids. */
export function serviceHallWalls(s: ServiceHallSpec): BoxSpec[] {
  const section = (s.d - s.door) / 2;
  return [
    ...[-1, 1].map(side => ({ x: s.x - s.w / 2, z: s.z + side * (s.door / 2 + section / 2),
      w: 0.5, d: section, h: s.h, style: "wall" as const })),
    { x: s.x + s.w / 2, z: s.z, w: 0.5, d: s.d, h: s.h, style: "wall" },
    { x: s.x, z: s.z - s.d / 2, w: s.w + 0.5, d: 0.5, h: s.h, style: "wall" },
    { x: s.x, z: s.z + s.d / 2, w: s.w + 0.5, d: 0.5, h: s.h, style: "wall" },
  ];
}
export const SERVICE_HALL: BoxSpec[] = [
  ...serviceHallWalls(SERVICE_HALL_SPEC),
  { x: 24, z: -8.5, w: 4, d: 1, h: 0.8, style: "crate" },
];
export const HANDLING_DISTRICT: CityDistrict = {
  bounds: { left: -44, right: 43, back: -26, front: 28 },
  ground: { left: -70, right: 75, back: -70, front: 65 },
  buildings: [
    { id: "handling-workshop", prefab: "workshop", x: -22, z: -25, turn: 0, finish: "brick", accent: 0xa49b70 },
    { id: "handling-annex", prefab: "depot", x: 21, z: -29, turn: 0, finish: "slate", accent: 0x7a9b94 },
    { id: "handling-shops", prefab: "shop", x: -17, z: 42, turn: 0, finish: "sand", accent: 0x829d8d, backdrop: true },
    { id: "handling-offices", prefab: "office", x: 22, z: 42, turn: 0, finish: "brick", accent: 0xa39d80, backdrop: true },
  ],
  furniture: [-30, 0, 34].map(x => ({ x, z: 18, w: 0.25, d: 0.25, h: 6, style: "barrier", fixture: "lamp" })),
  plazas: [{ x: -13, z: 0, w: 49, d: 32 }, { x: 22, z: 0, w: 26, d: 24 }],
  streets: [{ axis: "x", at: 23, center: 0, length: 122, width: 7, sidewalk: 2 }],
  junctions: [], water: [], pads: [], flights: [], porterRoutes: [],
  routes: [{ id: "handling-deliveries", count: 2, color: 0xb3b79b,
    points: [{ x: -40, z: 18.5 }, { x: 38, z: 18.5 }, { x: 38, z: 16 }, { x: -40, z: 16 }] }],
};
export const HANDLING_FIXTURES: BoxSpec[] = [
  ...HANDLING_DISTRICT.buildings.map(buildingSolid), ...SERVICE_HALL,
  { ...HANDLING_SITES.van, w: 2, d: 5.5, h: 2.15, style: "crate" },
];
