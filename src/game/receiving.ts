import type { CityDistrict } from "./city";
import type { BoxSpec } from "./config";
import { MARINE_PORT } from "./port";

// A small port contract, built from the same district, building and cargo kits
// as the debug sandbox. Coordinates and dimensions are metres.
export const RECEIVING_SITES = {
  van: { x: -28, z: 14 },
  return: { x: -22, z: 14, radius: 4.5 },
  kiosk: { x: 22, z: 8 },
  dispatch: { x: 21, z: 5, radius: 3 },
} as const;
export const RECEIVING_GUARDS = [
  { x: -1, z: 5 }, { x: 2, z: 1 },
  { x: 22, z: -2 }, { x: 27, z: 3 },
] as const;
export const RECEIVING_FIXTURES: BoxSpec[] = [
  { ...RECEIVING_SITES.van, w: 2, d: 5.5, h: 2.15, style: "crate" },
  { ...RECEIVING_SITES.kiosk, w: 1.1, d: 0.7, h: 1.55, style: "barrier" },
];
export const RECEIVING_YARD: CityDistrict = {
  bounds: { left: -42, right: 42, back: -30, front: 30 },
  ground: { left: -66, right: 144, back: -82, front: 78 },
  buildings: [
    { id: "cooperative-depot", prefab: "depot", x: -19, z: -25, turn: 0, finish: "sand", accent: 0x738b7b },
    { id: "receiving-workshop", prefab: "workshop", x: 14, z: -27, turn: 0, finish: "brick", accent: 0xb6a369 },
    { id: "yard-office", prefab: "pump", x: -50, z: -12, turn: 1, finish: "slate", accent: 0x738b7b },
    ...[-20, 18].map((x, i) => ({ id: `receiving-backdrop-${i}`, prefab: "depot" as const,
      x, z: -56, turn: 0 as const, finish: "slate" as const, accent: 0x748789, backdrop: true })),
  ],
  furniture: [-28, 34].map(x => ({ x, z: 21, w: 0.22, d: 0.22, h: 6,
    style: "barrier", fixture: "lamp" })),
  plazas: [{ x: 1, z: 3, w: 80, d: 36 }],
  streets: [
    { axis: "x", at: 26, center: -5, length: 110, width: 8, sidewalk: 2 },
    { axis: "z", at: -36, center: -8, length: 110, width: 8, sidewalk: 2 },
  ],
  junctions: [],
  water: MARINE_PORT.water,
  routes: [{ id: "receiving-meals", count: 2, color: 0x7b9685,
    points: [{ x: -32, z: 20 }, { x: -12, z: 20 }, { x: -12, z: 17 }, { x: -32, z: 17 }] }],
  pads: [], flights: [],
  porterRoutes: [18, 20].map((z, i) => ({ id: `receiving-cargo-${i}`, color: i ? 0x71928d : 0xc6a46b,
    points: [{ x: 30, z, station: { id: `held-cargo-${i}`, yaw: 0 } },
      { x: 16, z, station: { id: `released-cargo-${i}`, yaw: 0 } }] })),
  port: {
    containers: [
      { x: -5, z: -4, length: "20ft", turn: 1, levels: 1, color: 0x6d887b },
      { x: 13, z: 10, length: "20ft", turn: 0, levels: 1, color: 0x547e83 },
      { x: 26, z: -16, length: "20ft", turn: 0, levels: 2, color: 0x8b6652 },
    ],
    cranes: [{ x: 38, z: -38, span: 14, height: 19 }],
    ship: MARINE_PORT.port!.ship,
  },
};
