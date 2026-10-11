import { HeightField } from "./height-field";
import { buildingSolid, type CityDistrict } from "./city";
import { type BoxSpec, type Vec2 } from "./config";

export const FOREST_SITES = {
  entry: { x: -57, z: 37, radius: 5.5 }, terminal: { x: 33, z: 1, radius: 4.5 },
  clearing: { x: 12, z: -8, radius: 19 },
};
export const FOREST_BOUNDS = { left: -80, right: 80, back: -60, front: 60 };
const bell = (x: number, z: number, cx: number, cz: number, scale: number) => Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / scale ** 2);
const smooth = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const FOREST_GROUND = new HeightField({ left: -144, right: 144, back: -124, front: 124 }, 4, (x, z) => {
  // Broad glacial ridges; the service layby and graded eastern plot are genuinely flat.
  const hills = 5.6 * bell(x, z, -29, -23, 30) + 3.8 * bell(x, z, -28, 25, 32)
    + 3.6 * bell(x, z, 12, -50, 24) + .35 * (1 + Math.sin(x / 15) * Math.cos(z / 19));
  return hills * (1 - smooth(18, 39, x)) * (1 - smooth(26, 36, z));
});
/** A broad sloping forestry track from the layby to the western felling lane. */
export function approachTrack(p: Vec2) {
  return p.x > -66 && p.x < -18 && p.z > -15 && p.z < 43 && Math.abs((p.x + 57) * 45 + (p.z - 37) * 33) / Math.hypot(45,33) < 5;
}
export type ForestTree = Vec2 & { radius: number; height: number; broadleaf: boolean };
let seed = 914;
const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
export const FOREST_TREES: ForestTree[] = [];
for (let z = -113; z <= 113; z += 9) for (let x = -131; x <= 131; x += 9) {
  const p = { x: x + (random() - .5) * 6, z: z + (random() - .5) * 6 };
  // Clear logging tracks and a legible clearing. No narrow random tree mazes.
  if (approachTrack(p) || p.x > 20 && p.z > -42 && p.z < 30 || p.z > 32 && p.z < 43 ||
    Math.abs(p.z + 8) < 6 || Math.abs(p.z + 22) < 5 && p.x > -35 ||
    p.x > -5 && p.x < 23 && p.z > -34 && p.z < 12) continue;
  FOREST_TREES.push({ ...p, radius: .27 + random() * .17, height: 9 + random() * 7, broadleaf: random() > .78 });
}
export const FOREST_RIGS = [{ id: "west", x: -10, z: -8 }, { id: "east", x: 12, z: -22 }].map(p =>
  ({ ...p, y: FOREST_GROUND.heightAt(p), w: 5.8, d: 3.8, h: 2.7 }));
export const FOREST_ROCKS = [{ x: -43, z: 11, w: 5, d: 3.5, h: 1.3 },
  { x: -24, z: -40, w: 7, d: 4.5, h: 2.1 }, { x: 1, z: 15, w: 5, d: 3.2, h: 1.1 }]
  .map(b => ({ ...b, y: FOREST_GROUND.heightAt(b) }));
export const FOREST_DISTRICT: CityDistrict = {
  bounds: FOREST_BOUNDS, ground: FOREST_GROUND.bounds, ambientTraffic: false,
  buildings: [{ id: "forest-office", prefab: "workshop", x: 47, z: 5, turn: 0, finish: "slate", accent: 0x939a8d }],
  furniture: [], streets: [], junctions: [], plazas: [], routes: [], pads: [], flights: [], water: [], porterRoutes: [],
};
export const FOREST_FIXTURES: BoxSpec[] = [
  ...FOREST_DISTRICT.buildings.map(buildingSolid),
  ...FOREST_TREES.map(t => ({ x: t.x, z: t.z, y: FOREST_GROUND.heightAt(t), w: t.radius * 2,
    d: t.radius * 2, h: t.height * .72, cylinder: true, style: "wall" as const })),
  ...FOREST_ROCKS.map(b => ({ ...b, style: "barrier" as const })),
  ...FOREST_RIGS.map(b => ({ ...b, style: "crate" as const })),
  // Logs are low, physical cover; the terminals and fences leave generous paths.
  ...[{ x: -18, z: 2, w: 9, d: 1, h: .85 }, { x: 4, z: -1, w: 9, d: 1.2, h: 1.1 },
    { x: 19, z: -35, w: 12, d: 1.4, h: 1.4 }].map(b => ({ ...b, y: FOREST_GROUND.heightAt(b), style: "barrier" as const })),
  { x: 33, z: 1, w: 1.2, d: .7, h: 1.65, style: "crate" },
  { x: 60, z: -44, w: 36, d: .35, h: 1.8, style: "wall" },
  { x: 78, z: -26, w: .35, d: 36, h: 1.8, style: "wall" },
];
export const FOREST_GUARDS = [{ x: -1, z: -15, gun: true }, { x: 20, z: -30, gun: false },
  { x: 28, z: 11, gun: true }, { x: 32, z: -16, gun: false }];
