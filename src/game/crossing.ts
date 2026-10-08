import { buildingSolid, type CityDistrict } from "./city";
import type { BoxSpec } from "./config";

/** Reusable canal footbridge dimensions, in metres and kilograms. */
export const CROSSING_BRIDGE = { x: 0, z: 0, length: 14.8, width: 2.4,
  bank: 7, clearance: 8.5, capacity: 120, overloadSeconds: 0.65 } as const;
export const CROSSING_SITES = {
  exit: { x: 24, z: 4, radius: 4.5 }, van: { x: 29, z: 4 },
  alarm: { x: -10.5, z: 2 },
} as const;
export const CROSSING_GUARDS = [{ x: 12, z: -5 }, { x: 15, z: 0 }, { x: 12, z: 5 }] as const;
export const CROSSING_PURSUERS = [{ x: -20, z: -5 }, { x: -22, z: 0 }, { x: -20, z: 5 }] as const;

export const CROSSING_DISTRICT: CityDistrict = {
  bounds: { left: -36, right: 38, back: -24, front: 24 },
  ground: { left: -58, right: 60, back: -60, front: 60 },
  buildings: [
    { id: "west-pump", prefab: "pump", x: -17, z: -21, turn: 0, finish: "brick", accent: 0x758c87 },
    { id: "east-workshop", prefab: "workshop", x: 19.3, z: -22, turn: 0, finish: "sand", accent: 0xa68e65 },
    { id: "west-service", prefab: "pump", x: -17.5, z: 25, turn: 2, finish: "slate", accent: 0x748d82 },
    { id: "east-parcels", prefab: "depot", x: 19.3, z: 31, turn: 2, finish: "brick", accent: 0x587e86 },
    ...[-17.5, 19.3].map((x, i) => ({ id: `canal-homes-${i}`, prefab: "apartment" as const,
      x, z: -43, turn: 1 as const, finish: "sand" as const, accent: 0x829a93, backdrop: true })),
  ],
  furniture: [-20, 20].map(x => ({ x, z: 12, w: 0.22, d: 0.22, h: 5.5, style: "barrier", fixture: "lamp" })),
  plazas: [-19, 22].map(x => ({ x, z: 1, w: 23, d: 25 })),
  streets: [-32, 36].map(at => ({ axis: "z", at, center: 0, length: 100, width: 6, sidewalk: 1.8 })),
  junctions: [],
  water: [{ id: "maintenance-canal", x: 0, z: 0, w: 14, d: 120, crossings: [],
    harbor: { surface: -0.85, bed: -3.5 } }],
  routes: [-1, 1].map((side, i) => ({ id: `canal-meals-${i}`, count: 1, color: 0x8b9d7c,
    points: [{ x: side * 24, z: 10 }, { x: side * 13, z: 10 },
      { x: side * 13, z: 13 }, { x: side * 24, z: 13 }] })),
  pads: [], flights: [], porterRoutes: [],
};

export const CROSSING_FIXTURES: BoxSpec[] = [
  ...CROSSING_DISTRICT.buildings.map(buildingSolid),
  ...CROSSING_DISTRICT.furniture,
  // Water blocks navigation, with a single walkable opening. Physics has an
  // actual missing ground slab; the bridge class owns the removable deck.
  ...[-1, 1].map(sign => ({ x: 0, z: sign * 31.2, w: 14, d: 60,
    h: 0.1, style: "barrier" as const, navigationOnly: true })),
  ...[-1, 1].flatMap(side => [-1, 1].map(sign => ({ x: side * 7, z: sign * 31.25,
    w: 0.35, d: 60, h: 0.55, style: "barrier" as const }))),
  ...[-1, 1].map(side => ({ x: 0, z: side * 1.3, w: 15.6, d: 0.12,
    h: 0.72, style: "barrier" as const })),
  { ...CROSSING_SITES.van, w: 2, d: 5.5, h: 2.15, style: "crate" },
];
