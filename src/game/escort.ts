import { buildingSolid, type CityDistrict } from "./city";
import { RECORDS_ENTRANCE, RECORDS_EXIT, RECORDS_OFFICE, RECORDS_POSTS, RECORDS_ROOF, RECORDS_WALLS } from "./records-office";
import type { BoxSpec, RoofedArea } from "./config";

/** A corner office between two streets; extraction uses its rear staff alley. */
export const ESCORT_OFFICE = RECORDS_OFFICE;
export const ESCORT_DOOR = RECORDS_ENTRANCE;
export const ESCORT_REAR_DOOR = RECORDS_EXIT;
export const ESCORT_ROOF = RECORDS_ROOF;
export const ESCORT_SITES = {
  approach: { x: -1, z: 11 }, lobby: { x: -1, z: 2 }, archive: { x: 11, z: -7 },
  quill: { x: 15, z: -8, radius: 3 }, rear: { x: 14, z: -16 },
  exit: { x: -31, z: -17, radius: 4.5 }, van: { x: -39, z: -17 },
  response: { x: 43, z: 18 },
  cover: { x: 22, z: 10.5 },
};
export const ESCORT_SPAWNS = [{ x: -32.1, z: 27.1 }, { x: -32.1, z: 24.9 },
  { x: -29.9, z: 24.9 }, { x: -29.9, z: 27.1 }];
export const ESCORT_GUARDS = [{ x: -2, z: 2 }, { x: 8, z: .5 }, { x: 11, z: -7 }];
export const ESCORT_REINFORCEMENTS = [-1, 1].flatMap(x => [-1, 1].map(z => ({
  entry: { x: 43 + x * 1.1, z: 18 + z * 1.1 },
  rally: { x: 20 + x * 1.1, z: 11 + z * 1.1 },
})));
export const ESCORT_INTERIOR: BoxSpec[] = [
  { x: 5, z: 3, w: 6, d: 1.3, h: 1.05, style: "crate" },
  { x: -3, z: -7, w: .65, d: 6, h: 2.3, style: "crate" },
  { x: .5, z: -7, w: .65, d: 6, h: 2.3, style: "crate" },
  { x: 16, z: -5, w: 3, d: 1.2, h: .76, style: "crate" },
];
export const ESCORT_SEATS: BoxSpec[] = [-1, 2].map(z => ({ x: -5, z, w: .65, d: .65, h: 1.14, style: "crate" }));
export const ESCORT_SHELTERS: RoofedArea[] = [{ ...ESCORT_ROOF, y: 0, h: ESCORT_ROOF.y! + ESCORT_ROOF.h,
  exits: [{ x: -1, z: 11 }, { x: 14, z: -16 }] }];
export const ESCORT_DISTRICT: CityDistrict = {
  bounds: { left: -49, right: 47, back: -34, front: 30 },
  ground: { left: -76, right: 78, back: -67, front: 64 },
  buildings: [
    { id: "release-west-homes", prefab: "apartment", x: -40, z: -4, turn: 1, finish: "brick", accent: 0x73899a },
    { id: "release-clinic", prefab: "civic", x: -43, z: 37, turn: 1, finish: "sand", accent: 0x6c9a8f },
    { id: "release-cafe", prefab: "shop", x: -2, z: 35, turn: 2, finish: "sand", accent: 0xab806a },
    { id: "release-south-offices", prefab: "office", x: 29, z: 35, turn: 2, finish: "brick", accent: 0x7b8f97 },
    { id: "release-east-homes", prefab: "apartment", x: 33, z: -3, turn: 1, finish: "brick", accent: 0x8c9c85 },
    { id: "release-bank", prefab: "civic", x: 3, z: -40, turn: 0, finish: "sand", accent: 0x747f8e },
    { id: "release-north-homes", prefab: "apartment", x: 33, z: -40, turn: 0, finish: "slate", accent: 0x839c8f },
    { id: "release-west-office", prefab: "office", x: -64, z: -5, turn: 1, finish: "slate", accent: 0x898a6c, backdrop: true },
  ],
  furniture: [
    ...[-12, 18].map(x => ({ x, z: 11, w: .18, d: .18, h: 5, style: "barrier" as const, fixture: "lamp" as const })),
    ...[-37, -9, 23].map(x => ({ x, z: -19, w: .18, d: .18, h: 5, style: "barrier" as const, fixture: "lamp" as const })),
    { x: -8, z: 11, w: 3.5, d: 1.1, h: .8, style: "barrier", fixture: "planter" },
    { x: 8, z: 11, w: 3.5, d: 1.1, h: .8, style: "barrier", fixture: "planter" },
    { x: 1, z: -17, w: 3.5, d: 1.1, h: .8, style: "barrier", fixture: "planter" },
  ],
  plazas: [{ x: 4, z: 9.5, w: 33, d: 5 }, { x: 3, z: -16, w: 33, d: 7 },
    { x: -36, z: -18, w: 17, d: 6 }, { x: 23, z: -3, w: 7, d: 31 }],
  streets: [
    { axis: "x", at: 18, center: 1, length: 150, width: 8, sidewalk: 3 },
    { axis: "x", at: -25, center: 1, length: 150, width: 8, sidewalk: 3 },
    { axis: "z", at: -22, center: -1, length: 124, width: 8, sidewalk: 3 },
  ],
  junctions: [], water: [], pads: [], flights: [], porterRoutes: [],
  routes: [{ id: "records-lunch", count: 2, color: 0xb3b79b,
    points: [{ x: -15, z: 11 }, { x: 23, z: 11 }, { x: 23, z: -18 }, { x: -15, z: -18 }] }],
};
export const ESCORT_FIXTURES: BoxSpec[] = [
  ...ESCORT_DISTRICT.buildings.map(buildingSolid), ...RECORDS_WALLS,
  ...RECORDS_POSTS.map(p => ({ ...p, navigationOnly: true })),
  ...ESCORT_INTERIOR, ...ESCORT_SEATS, ...ESCORT_DISTRICT.furniture,
  { ...ESCORT_SITES.van, w: 5.5, d: 2, h: 2.15, style: "crate" },
];
