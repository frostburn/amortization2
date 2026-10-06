import type { BoxSpec, RangeBounds, Vec2 } from "./config";

// Metres. Templates are shared by visual construction, collision and navigation.
export const BUILDING_KIT = {
  shop: { w: 22, d: 14, h: 6, floors: 1 },
  apartment: { w: 22, d: 10, h: 10.8, floors: 3 },
  office: { w: 22, d: 10, h: 14.4, floors: 4 },
  workshop: { w: 22, d: 10, h: 5.4, floors: 1 },
} as const;
export type BuildingSpec = {
  id: string;
  prefab: keyof typeof BUILDING_KIT;
  x: number;
  z: number;
  turn: 0 | 1 | 2 | 3;
  finish: "brick" | "sand" | "slate";
  accent: number;
  backdrop?: boolean;
};
export const buildingSolid = (b: BuildingSpec): BoxSpec => {
  const kit = BUILDING_KIT[b.prefab];
  return { x: b.x, z: b.z, w: b.turn % 2 ? kit.d : kit.w,
    d: b.turn % 2 ? kit.w : kit.d, h: kit.h, style: "wall" };
};
export type DeliveryPoint = Vec2 & { stop?: number; building?: string };
export type CartRoute = { id: string; points: DeliveryPoint[]; count: number; color: number };
export type StreetFixture = BoxSpec & ({ fixture: "bench" | "planter" | "lamp" } | { fixture: "signal"; axis: number });
export type CityDistrict = {
  bounds: RangeBounds;
  buildings: BuildingSpec[];
  furniture: StreetFixture[];
  routes: CartRoute[];
  streets: { axis: "x" | "z"; at: number; center: number; length: number; width: number; sidewalk: number }[];
  junctions: Vec2[];
};

const buildings: BuildingSpec[] = [
  { id: "grocer", prefab: "shop", x: -27, z: -21, turn: 0, finish: "sand", accent: 0x558b74 },
  { id: "north-homes", prefab: "apartment", x: -27, z: -34, turn: 2, finish: "brick", accent: 0x647b83 },
  { id: "kitchen", prefab: "shop", x: 27, z: -21, turn: 0, finish: "brick", accent: 0xc2a052 },
  { id: "offices", prefab: "office", x: 27, z: -34, turn: 2, finish: "slate", accent: 0x779f9e },
  { id: "market", prefab: "shop", x: -27, z: 21, turn: 2, finish: "sand", accent: 0x9e6b57 },
  { id: "south-homes", prefab: "apartment", x: -27, z: 34, turn: 0, finish: "brick", accent: 0x607e9d },
  { id: "dispatch", prefab: "shop", x: 27, z: 21, turn: 2, finish: "slate", accent: 0x728763 },
  { id: "workshop", prefab: "workshop", x: 27, z: 34, turn: 0, finish: "sand", accent: 0x918d77 },
];
// Adjacent blocks are scenery with solid hulls. Roads continue through the map edge.
for (const [i, x] of [-82, -56, -28, 0, 28, 56, 82].entries()) {
  buildings.push({ id: `north-skyline-${i}`, prefab: i % 2 ? "office" : "apartment",
    x, z: -69, turn: 0, finish: i % 2 ? "slate" : "brick", accent: 0x6d7f83, backdrop: true });
}
for (const [i, z] of [-34, -8, 18, 44].entries()) {
  buildings.push({ id: `west-skyline-${i}`, prefab: i % 2 ? "apartment" : "shop",
    x: -76, z, turn: 1, finish: "sand", accent: 0x827c64, backdrop: true });
}

const routes: CartRoute[] = [];
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  const shop = sx < 0 ? sz < 0 ? "grocer" : "market" : sz < 0 ? "kitchen" : "dispatch";
  const home = sx < 0 ? sz < 0 ? "north-homes" : "south-homes" : sz < 0 ? "offices" : "workshop";
  routes.push({ id: shop, count: 3, color: sx < 0 ? 0xa8b9a0 : 0xc7a967,
    points: [
      { x: sx * 9, z: sz * 9 }, { x: sx * 27, z: sz * 9, stop: 3, building: shop },
      { x: sx * 43, z: sz * 9 }, { x: sx * 43, z: sz * 34, stop: 2, building: home },
      { x: sx * 43, z: sz * 42 }, { x: sx * 9, z: sz * 42 },
    ] });
}
routes.push({ id: "cross-town", count: 2, color: 0x83a8bc, points: [
  { x: -43, z: -9 }, { x: -27, z: -9, stop: 2, building: "grocer" },
  { x: 27, z: -9, stop: 2, building: "kitchen" }, { x: 43, z: -9 },
  { x: 43, z: 42 }, { x: -43, z: 42 },
] });
routes.push({ id: "station-run", count: 2, color: 0xb3a39b, points: [
  { x: 9, z: -42 }, { x: 9, z: 42 }, { x: -9, z: 42 }, { x: -9, z: -42 },
] });

export const CITY_DISTRICT: CityDistrict = {
  bounds: { left: -60, right: 60, back: -52, front: 52 },
  streets: [
    ...[-51, 0, 51].map(at => ({ axis: "z" as const, at, center: -6, length: 166, width: 11.5, sidewalk: 5.5 })),
    ...[-48, 0, 48].map(at => ({ axis: "x" as const, at, center: 0, length: 190, width: 11.5, sidewalk: 5.5 })),
  ],
  junctions: [{ x: 0, z: 0 }],
  buildings,
  furniture: [
    ...[-1, 1].flatMap((s): StreetFixture[] => [
      { x: s * 12, z: -21, w: 0.7, d: 2.4, h: 0.85, style: "barrier", fixture: "bench" },
      { x: s * 12, z: 21, w: 0.7, d: 2.4, h: 0.85, style: "barrier", fixture: "bench" },
      { x: s * 40, z: -21, w: 1.6, d: 2.4, h: 0.8, style: "barrier", fixture: "planter" },
      { x: s * 40, z: 21, w: 1.6, d: 2.4, h: 0.8, style: "barrier", fixture: "planter" },
    ]),
    ...[-12, 12].flatMap(x => [-37, -12, 12, 37].map(z => ({ x, z, w: 0.15, d: 0.15, h: 4.8, style: "barrier" as const, fixture: "lamp" as const }))),
    ...[0, 1].flatMap(axis => [-1, 1].flatMap(side => [-1, 1].map(end => ({
      x: axis ? side * 12 : end * 7, z: axis ? end * 7 : side * 12,
      w: 0.09, d: 0.09, h: 1.9, style: "barrier" as const, fixture: "signal" as const, axis,
    })))),
  ],
  routes,
};
