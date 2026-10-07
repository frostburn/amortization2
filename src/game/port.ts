import { buildingSolid, waterSolids, type CityDistrict } from "./city";
import type { BoxSpec, Vec2 } from "./config";

export type ContainerSpec = Vec2 & { length: "20ft" | "40ft"; turn: 0 | 1; levels: number; color: number };
export type CraneSpec = Vec2 & { span: number; height: number };
export type PortLayout = {
  containers: ContainerSpec[];
  cranes: CraneSpec[];
  ship: Vec2 & { length: number; width: number };
};
export const CONTAINER = { "20ft": 6.06, "40ft": 12.19, width: 2.44, height: 2.59 };
export function containerSolid(c: ContainerSpec): BoxSpec {
  const length = CONTAINER[c.length];
  return { x: c.x, z: c.z, w: c.turn ? CONTAINER.width : length,
    d: c.turn ? length : CONTAINER.width, h: CONTAINER.height * c.levels, style: "crate" };
}
export function portSolids(district: CityDistrict): BoxSpec[] {
  const port = district.port!;
  return [
    ...district.buildings.map(buildingSolid), ...district.furniture, ...district.water.flatMap(waterSolids),
    ...port.containers.map(containerSolid),
    // Submerged hull, deck and wheelhouse stop shots; ground navigation already excludes the basin.
    { x: port.ship.x, z: port.ship.z - 4, w: port.ship.width, d: port.ship.length - 16,
      h: 5.5, y: -3.6, style: "wall" },
    { x: port.ship.x, z: port.ship.z + 36, w: 9, d: 10, h: 5.5, y: -3.6, style: "wall" },
    { x: port.ship.x, z: port.ship.z - 39, w: 12, d: 8, h: 5.5, y: -3.6, style: "wall" },
    { x: port.ship.x, z: port.ship.z - 29, w: 11.5, d: 14, h: 1.8, y: 1.9, style: "wall" },
    ...port.cranes.flatMap(c => [-1, 1].flatMap(sx => [-1, 1].map(sz => ({
      x: c.x + sx * c.span / 2, z: c.z + sz * 4, w: 1.1, d: 1.1, h: c.height, style: "wall" as const,
    })))),
    ...(district.porterRoutes ?? []).flatMap(r => r.points.filter(p => p.station).map(p => ({
      x: p.x + Math.sin(p.station!.yaw) * 0.72, z: p.z + Math.cos(p.station!.yaw) * 0.72,
      w: 0.9, d: 0.64, h: 0.7, style: "barrier" as const,
    }))),
  ];
}

/** A 204 × 140 m port district; container rows leave continuous cargo aisles. */
export const MARINE_PORT: CityDistrict = {
  bounds: { left: -98, right: 106, back: -70, front: 70 },
  ground: { left: -124, right: 168, back: -100, front: 100 },
  buildings: [
    { id: "cargo-west", prefab: "depot", x: -35, z: -32, turn: 0, finish: "slate", accent: 0xb6a369 },
    { id: "cargo-south", prefab: "depot", x: -35, z: 32, turn: 2, finish: "sand", accent: 0x587c82 },
    { id: "port-workshop", prefab: "workshop", x: -76, z: -34, turn: 0, finish: "brick", accent: 0x728776 },
    { id: "gatehouse", prefab: "pump", x: -79, z: 32, turn: 2, finish: "slate", accent: 0xb6a369 },
    ...[-76, -35, 8].map((x, i) => ({ id: `freight-shed-${i}`, prefab: "depot" as const, x, z: -84,
      turn: 0 as const, finish: "slate" as const, accent: 0x748789, backdrop: true })),
  ],
  furniture: [-54, -26, 26, 54].map(z => ({ x: 39, z, w: 0.22, d: 0.22, h: 8,
    style: "barrier", fixture: "lamp" })),
  plazas: [{ x: 5, z: 0, w: 78, d: 94 }, { x: -62, z: 0, w: 62, d: 25 }],
  streets: [
    { axis: "x", at: 0, center: -40, length: 148, width: 10, sidewalk: 2.2 },
    { axis: "z", at: -58, center: 0, length: 190, width: 10, sidewalk: 2.2 },
    { axis: "z", at: 32, center: 0, length: 190, width: 9, sidewalk: 2 },
  ],
  junctions: [],
  water: [{ id: "harbor", x: 107, z: 0, w: 122, d: 240, crossings: [], harbor: { surface: -0.85, bed: -6 } }],
  routes: [
    { id: "port-canteen", color: 0x7b9685, count: 4,
      points: [{ x: -49, z: -13 }, { x: -11, z: -13 }, { x: -11, z: 13 }, { x: -49, z: 13 }] },
    { id: "port-parcels", color: 0xbb9a66, model: "CRATE", count: 2,
      points: [{ x: -16, z: -19, stop: 3, building: "cargo-west" }, { x: 21, z: -19 },
        { x: 21, z: 19 }, { x: -16, z: 19, stop: 3, building: "cargo-south" }] },
  ],
  pads: [{ id: "port-dispatch", x: -48, z: 52, color: 0xbb9a66 }, { id: "port-receiver", x: 20, z: 64, color: 0x7b9685 }],
  flights: [{ id: "harbor-parcel", home: "port-dispatch", destination: "port-receiver", altitude: 24,
    corridor: [{ x: -48, z: 52 }, { x: -48, z: 62 }, { x: 20, z: 62 }, { x: 20, z: 64 }], color: 0x7b9685 }],
  porterRoutes: [-9, 9, -40, 40].map((z, i) => ({ id: `cargo-transfer-${i}`, color: i % 2 ? 0x71928d : 0xc6a46b,
    points: [{ x: i < 2 ? -8 : -4, z, station: { id: `inbound-${i}`, yaw: 0 } },
      { x: 24, z, station: { id: `quayside-${i}`, yaw: 0 } }] })),
  port: {
    containers: [
      ...[-54, -48].flatMap(z => [-34, -18, -2, 14].map((x, i): ContainerSpec => ({
        x, z, length: "40ft", turn: 0, levels: i % 3 === 0 ? 2 : 1, color: [0x8b6652, 0x547e83, 0x84917b][i % 3],
      }))),
      ...[48, 54].flatMap(z => [-30, -12, 6].map((x, i): ContainerSpec => ({
        x, z, length: "40ft", turn: 0, levels: i === 1 ? 2 : 1, color: [0x547e83, 0xb39a64, 0x8b6652][i],
      }))),
      { x: -80, z: -10, length: "20ft", turn: 1, levels: 2, color: 0x6d887b },
      { x: -80, z: 10, length: "20ft", turn: 1, levels: 1, color: 0x8b6652 },
    ],
    cranes: [{ x: 34, z: -30, span: 14, height: 19 }, { x: 34, z: 30, span: 14, height: 19 }],
    ship: { x: 62, z: 0, length: 86, width: 16 },
  },
};
