import { buildingSolid, type CityDistrict } from "./city";
import { serviceHallRoof, serviceHallWalls, type ServiceHallSpec } from "./handling";
import type { BoxSpec, RoofedArea } from "./config";

/** A walkable records office and its forecourt, measured in metres. */
export const ESCORT_OFFICE: ServiceHallSpec = { x: 22, z: -2, w: 24, d: 20, h: 3.8, door: 4.5 };
export const ESCORT_SITES = {
  quill: { x: 31, z: -7, radius: 3 },
  exit: { x: -31, z: -2, radius: 4.5 }, van: { x: -39, z: -2 },
};
export const ESCORT_DOOR: BoxSpec = { x: 10, z: -2, w: .45, d: 4.5, h: 3.6, style: "wall" };
export const ESCORT_GUARDS = [{ x: 15, z: 1 }, { x: 20, z: -7 }, { x: 29, z: 2 }];
export const ESCORT_REINFORCEMENTS = [-1, 1].flatMap(x => [-1, 1].map(z => ({
  entry: { x: -8 + x * 1.1, z: 26.4 + z * 1.1 },
  rally: { x: -8 + x * 1.1, z: 10 + z * 1.1 },
})));
export const ESCORT_INTERIOR: BoxSpec[] = [
  { x: 24, z: -8, w: .65, d: 5, h: 2.3, style: "crate" },
  { x: 26, z: -1, w: 3.5, d: 1.4, h: .76, style: "crate" },
  { x: 32, z: 5, w: 2.5, d: .65, h: 2.3, style: "crate" },
];
export const ESCORT_ROOF = serviceHallRoof(ESCORT_OFFICE);
export const ESCORT_SHELTERS: RoofedArea[] = [{ ...ESCORT_ROOF, y: 0, h: ESCORT_ROOF.y! + ESCORT_ROOF.h,
  exits: [{ x: 6, z: -2 }] }];
export const ESCORT_DISTRICT: CityDistrict = {
  bounds: { left: -46, right: 44, back: -27, front: 29 },
  ground: { left: -72, right: 76, back: -68, front: 67 },
  buildings: [
    { id: "escort-workshop", prefab: "workshop", x: -24, z: -25, turn: 0, finish: "brick", accent: 0x8d9a7d },
    { id: "escort-archive", prefab: "depot", x: 20, z: -31, turn: 0, finish: "slate", accent: 0x789b95 },
    { id: "escort-shops", prefab: "shop", x: -25, z: 42, turn: 0, finish: "sand", accent: 0x9e987b, backdrop: true },
    { id: "escort-offices", prefab: "office", x: 18, z: 42, turn: 0, finish: "brick", accent: 0x738d90, backdrop: true },
  ],
  furniture: [-31, 5, 35].map(x => ({ x, z: 16, w: .22, d: .22, h: 6, style: "barrier", fixture: "lamp" })),
  plazas: [{ x: -14, z: -2, w: 48, d: 30 }, { x: 22, z: -2, w: 24, d: 20 }],
  streets: [{ axis: "x", at: 23, center: 0, length: 120, width: 7, sidewalk: 2 }],
  junctions: [], water: [], pads: [], flights: [], porterRoutes: [],
  routes: [{ id: "escort-deliveries", count: 2, color: 0xb3b79b,
    points: [{ x: -42, z: 18 }, { x: 39, z: 18 }, { x: 39, z: 15 }, { x: -42, z: 15 }] }],
};
export const ESCORT_COVER: BoxSpec[] = [
  { x: -6, z: -7, w: 5, d: .8, h: 1.25, style: "barrier" },
  { x: -19, z: 7, w: 4, d: 1.5, h: 2.2, style: "crate" },
];
export const ESCORT_FIXTURES: BoxSpec[] = [
  ...ESCORT_DISTRICT.buildings.map(buildingSolid), ...serviceHallWalls(ESCORT_OFFICE),
  ...ESCORT_INTERIOR, ...ESCORT_COVER,
  { ...ESCORT_SITES.van, w: 2, d: 5.5, h: 2.15, style: "crate" },
];
