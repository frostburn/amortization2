import {
  BARRIERS,
  BOUNDS,
  PLAYER_SPAWNS,
  PROP_SPAWNS,
  TARGET_SPAWNS,
  type BoxSpec,
  type RangeBounds,
  type RoofedArea,
} from "./config";

import { CITY_DISTRICT, buildingSolid, waterSolids, type CityDistrict } from "./city";
import { MARINE_PORT, portSolids } from "./port";
import { RECEIVING_FIXTURES, RECEIVING_YARD } from "./receiving";
import { CROSSING_DISTRICT, CROSSING_FIXTURES } from "./crossing";

import { HANDLING_DISTRICT, HANDLING_FIXTURES, HANDLING_SHELTERS } from "./handling";
import { ESCORT_DISTRICT, ESCORT_FIXTURES, ESCORT_SHELTERS, ESCORT_SPAWNS } from "./escort";
import { CONCOURSE_DISTRICT, CONCOURSE_FIXTURES, CONCOURSE_RAILS, CONCOURSE_SURFACES } from "./concourse";
import type { WalkSurface } from "./walk-surfaces";
import { PRIORITY_DISTRICT, PRIORITY_FIXTURES, PRIORITY_RAILS, PRIORITY_SITES, PRIORITY_SURFACES } from "./priority";

export type RangeId = "receiving" | "crossing" | "handling" | "escort" | "priority" | "proving" | "long" | "arena" | "city" | "port" | "concourse";
export const ARENA_ENTRIES = [
  { name: "NORTH", x: 0, z: -38, dx: 0, dz: 1 },
  { name: "EAST", x: 54, z: 0, dx: -1, dz: 0 },
  { name: "SOUTH", x: 0, z: 38, dx: 0, dz: -1 },
  { name: "WEST", x: -54, z: 0, dx: 1, dz: 0 },
] as const;
export type TargetKind = (typeof TARGET_SPAWNS)[number]["kind"] | "precision";
type RangeDefinition = {
  name: string;
  contract?: boolean;
  pistolsOnly?: boolean;
  city?: CityDistrict;
  shelters?: RoofedArea[];
  walkSurfaces?: WalkSurface[];
  walkVolumes?: WalkSurface[];
  bounds: RangeBounds;
  barriers: BoxSpec[];
  platforms: BoxSpec[];
  players: { x: number; z: number }[];
  targets: { x: number; z: number; elevation?: number; kind: TargetKind }[];
  props: (typeof PROP_SPAWNS[number] & { style?: "equipment" })[];
};

export const RANGES: Record<RangeId, RangeDefinition> = {
  priority: {
    name: "05 · PRIORITY ACCESS", contract: true, city: PRIORITY_DISTRICT, bounds: PRIORITY_DISTRICT.bounds,
    barriers: PRIORITY_FIXTURES, platforms: [], walkSurfaces: PRIORITY_SURFACES, walkVolumes: PRIORITY_RAILS,
    players: [[-1.1, 1.1], [-1.1, -1.1], [1.1, -1.1], [1.1, 1.1]].map(([x, z]) =>
      ({ x: PRIORITY_SITES.exit.x + x, z: PRIORITY_SITES.exit.z + z })),
    targets: [], props: [-3, 1].map(dx => ({ x: PRIORITY_SITES.loading.x + dx,
      z: PRIORITY_SITES.loading.z - 5.4, w: 1.15, h: 1.7, d: .9, mass: 65, style: "equipment" })),
  },
  concourse: {
    name: "RAISED CONCOURSE", city: CONCOURSE_DISTRICT, bounds: CONCOURSE_DISTRICT.bounds,
    barriers: CONCOURSE_FIXTURES, platforms: [], walkSurfaces: CONCOURSE_SURFACES, walkVolumes: CONCOURSE_RAILS,
    players: [{ x: -27.1, z: 20.1 }, { x: -27.1, z: 17.9 }, { x: -24.9, z: 17.9 }, { x: -24.9, z: 20.1 }],
    targets: [{ x: 26, z: -16, elevation: 4.8, kind: "heavy" },
      { x: 0, z: -45, elevation: 8.4, kind: "precision" }, { x: 11, z: 12, kind: "plate" }],
    props: [{ x: -15, z: 10, w: .9, h: .8, d: .9, mass: 18 }],
  },
  escort: {
    name: "04 · RELEASE", contract: true, pistolsOnly: true, city: ESCORT_DISTRICT, bounds: ESCORT_DISTRICT.bounds,
    barriers: ESCORT_FIXTURES, platforms: [], shelters: ESCORT_SHELTERS,
    players: ESCORT_SPAWNS,
    targets: [], props: [],
  },
  handling: {
    name: "03 · HANDLING", contract: true, pistolsOnly: true, city: HANDLING_DISTRICT, bounds: HANDLING_DISTRICT.bounds,
    barriers: HANDLING_FIXTURES, platforms: [], shelters: HANDLING_SHELTERS,
    players: [{ x: -25.1, z: 1.1 }, { x: -25.1, z: -1.1 }, { x: -22.9, z: -1.1 }, { x: -22.9, z: 1.1 }],
    targets: [], props: [],
  },
  crossing: {
    name: "02 · CROSSING", contract: true, pistolsOnly: true, city: CROSSING_DISTRICT, bounds: CROSSING_DISTRICT.bounds,
    barriers: CROSSING_FIXTURES, platforms: [],
    players: [{ x: -24.1, z: 1.1 }, { x: -24.1, z: -1.1 }, { x: -21.9, z: -1.1 }, { x: -21.9, z: 1.1 }],
    targets: [], props: [],
  },
  receiving: {
    name: "01 · RECEIVING", contract: true, pistolsOnly: true, city: RECEIVING_YARD, bounds: RECEIVING_YARD.bounds,
    barriers: [...portSolids(RECEIVING_YARD), ...RECEIVING_FIXTURES], platforms: [],
    players: [{ x: -23.1, z: 15.1 }, { x: -23.1, z: 12.9 }, { x: -20.9, z: 12.9 }, { x: -20.9, z: 15.1 }],
    targets: [], props: [],
  },
  port: {
    name: "MARINE PORT", city: MARINE_PORT, bounds: MARINE_PORT.bounds,
    barriers: portSolids(MARINE_PORT), platforms: [],
    players: [{ x: -1.1, z: 3.1 }, { x: -1.1, z: 0.9 }, { x: 1.1, z: 0.9 }, { x: 1.1, z: 3.1 }],
    targets: [], props: [],
  },
  city: {
    name: "CITY DISTRICT",
    city: CITY_DISTRICT,
    bounds: CITY_DISTRICT.bounds,
    barriers: [...CITY_DISTRICT.buildings.map(buildingSolid), ...CITY_DISTRICT.furniture, ...CITY_DISTRICT.water.flatMap(waterSolids)],
    platforms: [],
    players: [{ x: -1.1, z: 3.1 }, { x: -1.1, z: 0.9 }, { x: 1.1, z: 0.9 }, { x: 1.1, z: 3.1 }],
    targets: [],
    props: [{ x: 40, z: 28, w: 0.8, h: 0.65, d: 0.8, mass: 12 }],
  },
  arena: {
    name: "ENDLESS ARENA",
    bounds: { left: -56, right: 56, back: -40, front: 40 },
    barriers: [
      // Four broad entrances. The near wall stays low enough for the overhead camera.
      ...[-31, 31].flatMap((x): BoxSpec[] => [
        { x, z: -40.5, w: 50, d: 1, h: 3, style: "wall" },
        { x, z: 40.5, w: 50, d: 1, h: 0.6, style: "wall" },
      ]),
      ...[-56.5, 56.5].flatMap((x): BoxSpec[] => [-23, 23].map((z) => ({
        x, z, w: 1, d: 34, h: x > 0 ? 0.6 : 2.5, style: "wall",
      }))),
      { x: 0, z: -6, w: 4, d: 3, h: 2.6, style: "crate" },
      { x: -11, z: 0, w: 0.8, d: 9, h: 1.25, style: "barrier" },
      { x: 11, z: 0, w: 0.8, d: 9, h: 1.25, style: "barrier" },
      { x: 0, z: 6, w: 5, d: 0.8, h: 1.3, style: "barrier" },
      { x: -19, z: -11, w: 3, d: 3, h: 2.5, style: "crate" },
      { x: 19, z: -11, w: 3, d: 3, h: 2.5, style: "crate" },
      { x: -19, z: 11, w: 6, d: 0.8, h: 1.3, style: "barrier" },
      { x: 19, z: 11, w: 6, d: 0.8, h: 1.3, style: "barrier" },
      ...[-40, 40].flatMap((x): BoxSpec[] => [
        { x, z: -18, w: 5, d: 3, h: 2.5, style: "crate" },
        { x, z: 18, w: 5, d: 0.8, h: 1.3, style: "barrier" },
      ]),
      ...[-28, 28].map((z): BoxSpec => ({ x: 0, z, w: 7, d: 0.8, h: 1.25, style: "barrier" })),
    ],
    platforms: [],
    players: [
      { x: -1.1, z: 10.1 }, { x: -1.1, z: 7.9 },
      { x: 1.1, z: 7.9 }, { x: 1.1, z: 10.1 },
    ],
    targets: [],
    props: [
      { x: -5, z: 0, w: 1.4, h: 1.3, d: 1.4, mass: 25 },
      { x: 5, z: 0, w: 1.4, h: 1.3, d: 1.4, mass: 25 },
    ],
  },
  proving: {
    name: "PROVING GROUND",
    bounds: BOUNDS,
    barriers: BARRIERS,
    platforms: [],
    players: PLAYER_SPAWNS,
    targets: [...TARGET_SPAWNS],
    props: PROP_SPAWNS,
  },
  long: {
    name: "LONG RANGE",
    bounds: { left: -18, right: 126, back: -16, front: 16 },
    barriers: [
      { x: 54, z: -16.5, w: 145, d: 1, h: 2.8, style: "wall" },
      { x: 54, z: 16.5, w: 145, d: 1, h: 0.6, style: "wall" },
      { x: -18.5, z: 0, w: 1, d: 33, h: 1.4, style: "wall" },
      { x: 126.5, z: 0, w: 1, d: 33, h: 0.6, style: "wall" },
      { x: 43, z: 5.7, w: 3, d: 1, h: 1.3, style: "barrier" },
      { x: 72, z: -5, w: 2, d: 1.8, h: 1.6, style: "crate" },
    ],
    players: [
      { x: -4, z: -4 },
      { x: -4, z: -2 },
      { x: -4, z: 3 },
      { x: -2, z: 0 },
    ],
    targets: [
      { x: 28, z: -3, kind: "precision" },
      { x: 58, z: 0, elevation: 2, kind: "precision" },
      { x: 88, z: 3, elevation: 5, kind: "precision" },
    ],
    platforms: [
      { x: 58, z: 0, w: 4, d: 3.5, h: 2, style: "barrier" },
      { x: 88, z: 3, w: 4, d: 3.5, h: 5, style: "barrier" },
    ],
    props: [{ x: -5.5, z: 5.5, w: 1.5, h: 1.2, d: 1.5, mass: 25 }],
  },
};
