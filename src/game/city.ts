import type { BoxSpec, RangeBounds, Vec2 } from "./config";
import type { PortLayout } from "./port";

// Metres. Templates are shared by visual construction, collision and navigation.
export const BUILDING_KIT = {
  shop: { w: 22, d: 14, h: 6, floors: 1 },
  apartment: { w: 22, d: 10, h: 10.8, floors: 3 },
  office: { w: 22, d: 10, h: 14.4, floors: 4 },
  workshop: { w: 22, d: 10, h: 5.4, floors: 1 },
  depot: { w: 22, d: 18, h: 7.2, floors: 1 },
  civic: { w: 22, d: 14, h: 9.6, floors: 2 },
  pump: { w: 12, d: 12, h: 5.2, floors: 1 },
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
    d: b.turn % 2 ? kit.w : kit.d, h: kit.h, style: "wall", building: b.id };
};
export type DeliveryPoint = Vec2 & { stop?: number; building?: string };
export type GroundCivilianModel = "CART" | "CRATE";
export type CivilianModel = GroundCivilianModel | "KITE" | "PORTER" | "CAB" | "VAN";
export type CartRoute = { id: string; points: DeliveryPoint[]; count: number; color: number; model?: GroundCivilianModel };
export type DeliveryPad = Vec2 & { id: string; color: number };
/** Corridors are traversed at altitude; takeoff and final approach are vertical. */
export type FlightRoute = { id: string; home: string; destination: string; altitude: number; corridor: Vec2[]; color: number };
export type WaterFeature = Vec2 & { id: string; w: number; d: number; crossings: { z: number; width: number }[];
  harbor?: { surface: number; bed: number } };
export type CargoStop = Vec2 & { station?: { id: string; yaw: number } };
export type PorterRoute = { id: string; points: CargoStop[]; color: number };

/** The bed is shallow; navigation excludes water, while impacts can cross its banks. */
export function waterSections(water: WaterFeature) {
  let back = water.z - water.d / 2;
  const sections: { back: number; front: number }[] = [];
  for (const crossing of [...water.crossings].sort((a, b) => a.z - b.z)) {
    const front = crossing.z - crossing.width / 2;
    if (front > back) sections.push({ back, front });
    back = crossing.z + crossing.width / 2;
  }
  if (back < water.z + water.d / 2) sections.push({ back, front: water.z + water.d / 2 });
  return sections;
}
export function inWater(point: Vec2, water: WaterFeature) {
  return Math.abs(point.x - water.x) < water.w / 2 &&
    waterSections(water).some(s => point.z > s.back && point.z < s.front);
}
export function waterSolids(water: WaterFeature): BoxSpec[] {
  if (water.harbor) return [
    { x: water.x, z: water.z, w: water.w, d: water.d, h: 0.1, style: "barrier", navigationOnly: true },
    // A retaining wall, rather than a floor beneath the sea. Its west edge is the quay.
    { x: water.x - water.w / 2, z: water.z, w: 0.6, d: water.d, h: -water.harbor.bed,
      y: water.harbor.bed, style: "wall" },
  ];
  const solids: BoxSpec[] = [];
  for (const { back, front } of waterSections(water)) {
    const z = (back + front) / 2, d = front - back;
    solids.push({ x: water.x, z, w: water.w, d, h: 0.1, style: "barrier", navigationOnly: true });
    for (const side of [-1, 1]) solids.push({ x: water.x + side * water.w / 2, z,
      w: 0.6, d, h: 0.45, style: "barrier" });
  }
  for (const z of [water.z - water.d / 2, water.z + water.d / 2])
    solids.push({ x: water.x, z, w: water.w + 0.6, d: 0.6, h: 0.45, style: "barrier" });
  for (const crossing of water.crossings) for (const side of [-1, 1])
    solids.push({ x: water.x, z: crossing.z + side * crossing.width / 2,
      w: water.w + 0.6, d: 0.12, h: 0.95, style: "barrier" });
  return solids;
}
export type StreetFixture = BoxSpec & ({ fixture: "bench" | "planter" | "lamp" } | { fixture: "signal"; axis: number });
export type CityDistrict = {
  bounds: RangeBounds;
  ground: RangeBounds;
  buildings: BuildingSpec[];
  furniture: StreetFixture[];
  plazas: Pick<BoxSpec, "x" | "z" | "w" | "d">[];
  routes: CartRoute[];
  pads: DeliveryPad[];
  flights: FlightRoute[];
  water: WaterFeature[];
  streets: { axis: "x" | "z"; at: number; center: number; length: number; width: number; sidewalk: number }[];
  junctions: Vec2[];
  port?: PortLayout;
  porterRoutes?: PorterRoute[];
};

/** Shared by visible paving and physics. Harbor water removes the ground slab. */
export function dryGround(extent: RangeBounds, water: WaterFeature[]) {
  let pieces = [{ ...extent }];
  for (const w of water.filter(w => w.harbor)) {
    const cut = { left: w.x - w.w / 2, right: w.x + w.w / 2, back: w.z - w.d / 2, front: w.z + w.d / 2 };
    pieces = pieces.flatMap(p => {
      const left = Math.max(p.left, cut.left), right = Math.min(p.right, cut.right);
      const back = Math.max(p.back, cut.back), front = Math.min(p.front, cut.front);
      if (left >= right || back >= front) return [p];
      return [
        { ...p, right: left }, { ...p, left: right },
        { left, right, back: p.back, front: back }, { left, right, back: front, front: p.front },
      ].filter(r => r.right > r.left && r.front > r.back);
    });
  }
  return pieces;
}

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
// Adjacent scenery occupies parcels between the continuing street corridors.
// A second northern row preserves skyline density without filling road lanes.
const northLots = [[-79.5, -69], [-27, -69], [27, -69], [80, -69],
  [-79.5, -85], [-27, -85], [27, -85]];
for (const [i, [x, z]] of northLots.entries()) {
  buildings.push({ id: `north-skyline-${i}`, prefab: i % 2 ? "office" : "apartment",
    x, z, turn: 0, finish: i % 2 ? "slate" : "brick", accent: 0x6d7f83, backdrop: true });
}
// Paired west-side buildings face their nearest cross street; awnings point
// away from the narrow gap between neighbours.
const westLots = [[-29.5, "shop", 2], [-17, "apartment", 0],
  [17, "apartment", 2], [29.5, "shop", 0]] as const;
for (const [i, [z, prefab, turn]] of westLots.entries()) {
  buildings.push({ id: `west-skyline-${i}`, prefab,
    x: -79.5, z, turn, finish: "sand", accent: 0x827c64 });
}
buildings.push(
  { id: "parcel-depot", prefab: "depot", x: -79.5, z: 72, turn: 2, finish: "slate", accent: 0xb08d52 },
  { id: "station-hall", prefab: "civic", x: -27, z: 73, turn: 2, finish: "brick", accent: 0x738e94 },
  { id: "station-homes", prefab: "apartment", x: 27, z: 73, turn: 2, finish: "sand", accent: 0x8f785e },
  { id: "canal-library", prefab: "civic", x: 108, z: -24, turn: 3, finish: "sand", accent: 0x588b88 },
  { id: "quay-homes", prefab: "apartment", x: 108, z: 24, turn: 3, finish: "brick", accent: 0x74899c },
  { id: "pump-house", prefab: "pump", x: 108, z: 70, turn: 3, finish: "brick", accent: 0x6f887b },
);

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
const westDelivery: DeliveryPoint[] = [
  { x: -63, z: 9 }, { x: -80, z: 9, stop: 4, building: "west-skyline-2" },
  { x: -94, z: 9 }, { x: -94, z: 61 }, { x: -80, z: 61, stop: 6, building: "parcel-depot" },
  { x: -63, z: 61 },
];
routes.push(
  { id: "west-parcels", model: "CRATE", count: 2, color: 0xb08d52, points: westDelivery },
  { id: "west-meals", count: 2, color: 0xa8b9a0, points: westDelivery.map(p => ({ ...p, stop: p.stop ? 2 : undefined })) },
  { id: "canal-parcels", model: "CRATE", count: 2, color: 0x719b9a, points: [
    { x: 99, z: -24, stop: 5, building: "canal-library" },
    { x: 99, z: 24, stop: 4, building: "quay-homes" }, { x: 99, z: 39 },
    { x: 62, z: 39 }, { x: 62, z: -9 }, { x: 90, z: -9 }, { x: 90, z: -24 },
  ] },
  { id: "station-parcels", model: "CRATE", count: 1, color: 0x8a9ba9, points: [
    { x: -9, z: 61 }, { x: -27, z: 61, stop: 5, building: "station-hall" },
    { x: -43, z: 61 }, { x: -43, z: 42 }, { x: -9, z: 42 },
  ] },
  { id: "quay-meals", count: 2, color: 0xc7a967, points: [
    { x: 99, z: 70, stop: 3, building: "pump-house" }, { x: 99, z: 39 },
    { x: 62, z: 39 }, { x: 62, z: 83 }, { x: 90, z: 83 }, { x: 99, z: 83 },
  ] },
);

export const CITY_DISTRICT: CityDistrict = {
  bounds: { left: -110, right: 124, back: -57, front: 90 },
  ground: { left: -142, right: 152, back: -103, front: 119 },
  streets: [
    ...[-102, -51, 0, 51].map(at => ({ axis: "z" as const, at, center: 8, length: 222, width: 11.5, sidewalk: 5.5 })),
    ...[-48, 0, 48].map(at => ({ axis: "x" as const, at, center: 5, length: 294, width: 11.5, sidewalk: 5.5 })),
  ],
  junctions: [{ x: 0, z: 0 }],
  buildings,
  plazas: [{ x: 0, z: 74, w: 54, d: 29 }, { x: 93, z: 20, w: 20, d: 126 }],
  water: [{ id: "canal-court", x: 76, z: 19, w: 14, d: 116,
    crossings: [{ z: 0, width: 22.5 }, { z: 48, width: 22.5 }] }],
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
    ...[-28, 24, 67].flatMap((z): StreetFixture[] => [
      { x: 65, z, w: 0.7, d: 2.4, h: 0.85, style: "barrier", fixture: "bench" },
      { x: 87, z, w: 1.6, d: 2.4, h: 0.8, style: "barrier", fixture: "planter" },
      { x: 94, z, w: 0.15, d: 0.15, h: 4.8, style: "barrier", fixture: "lamp" },
    ]),
    ...[-41, -13, 13, 41].map(x => ({ x, z: 87, w: 2.4, d: 1.6, h: 0.8,
      style: "barrier" as const, fixture: "planter" as const })),
  ],
  routes,
  pads: [
    { id: "depot-a", x: -60, z: 74, color: 0xb08d52 },
    { id: "depot-b", x: -60, z: 82, color: 0xb08d52 },
    { id: "depot-c", x: -60, z: 66, color: 0xb08d52 },
    { id: "station-west", x: -9, z: 76, color: 0x738e94 },
    { id: "station-east", x: 10, z: 82, color: 0x738e94 },
    { id: "quay", x: 92, z: 76, color: 0x588b88 },
  ],
  flights: [
    { id: "station-air", home: "depot-a", destination: "station-west", altitude: 18,
      corridor: [{ x: -60, z: 42 }, { x: -9, z: 42 }], color: 0xc3a05f },
    { id: "quay-air", home: "depot-b", destination: "quay", altitude: 21,
      corridor: [{ x: -60, z: -8 }, { x: 92, z: -8 }], color: 0x719b9a },
    { id: "station-express", home: "depot-c", destination: "station-east", altitude: 24,
      corridor: [{ x: -43, z: 56 }, { x: 10, z: 56 }], color: 0x8a9ba9 },
  ],
};
