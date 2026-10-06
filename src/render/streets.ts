import * as THREE from "three";
import type { CityDistrict } from "../game/city";
import { block, surface } from "./primitives";

type Rect = { x: number; z: number; w: number; d: number };

/** Cut a rectangle into disjoint strips around a surface that already exists. */
function subtract(rect: Rect, cut: Rect): Rect[] {
  const left = rect.x - rect.w / 2, right = rect.x + rect.w / 2;
  const back = rect.z - rect.d / 2, front = rect.z + rect.d / 2;
  const l = Math.max(left, cut.x - cut.w / 2), r = Math.min(right, cut.x + cut.w / 2);
  const b = Math.max(back, cut.z - cut.d / 2), f = Math.min(front, cut.z + cut.d / 2);
  if (l >= r || b >= f) return [rect];
  return [[left, l, back, front], [r, right, back, front], [l, r, back, b], [l, r, f, front]]
    .filter(([x0, x1, z0, z1]) => x1 > x0 && z1 > z0)
    .map(([x0, x1, z0, z1]) => ({ x: (x0 + x1) / 2, z: (z0 + z1) / 2, w: x1 - x0, d: z1 - z0 }));
}

/** One continuous asphalt surface, with raised paving cut around the road union. */
export function makeStreets(district: CityDistrict, texture: THREE.Texture) {
  const root = new THREE.Group(), asphalt = surface(0x424c50), paving = surface(0x9c9f94);
  const yellow = surface(0xb7a166), white = surface(0xd3cdbc);
  paving.map = texture;
  const roads: Rect[] = [], walks: Rect[] = [];
  for (const street of district.streets) {
    const alongX = street.axis === "x", offset = (street.width + street.sidewalk) / 2;
    const x = alongX ? street.center : street.at, z = alongX ? street.at : street.center;
    roads.push({ x, z, w: alongX ? street.length : street.width, d: alongX ? street.width : street.length });
    for (const side of [-1, 1]) walks.push({
      x: x + (alongX ? 0 : side * offset), z: z + (alongX ? side * offset : 0),
      w: alongX ? street.length : street.sidewalk, d: alongX ? street.sidewalk : street.length,
    });
  }
  const drawUnion = (rectangles: Rect[], cuts: Rect[], height: number, y: number, material: THREE.Material) => {
    const occupied = [...cuts];
    for (const rect of rectangles) {
      let pieces = [rect];
      for (const cut of occupied) pieces = pieces.flatMap(piece => subtract(piece, cut));
      for (const piece of pieces) block(root, piece.w, height, piece.d, piece.x, y, piece.z, material);
      occupied.push(rect);
    }
  };
  drawUnion(roads, [], 0.025, 0, asphalt);
  drawUnion([...walks, ...district.plazas], roads, 0.03, 0.018, paving);
  for (const [i, street] of district.streets.entries()) {
    const road = roads[i], alongX = street.axis === "x";
    const crossings = roads.filter((_, j) => district.streets[j].axis !== street.axis);
    for (let t = -street.length / 2 + 1.4; t <= street.length / 2 - 1.4; t += 7) {
      const dash = { x: road.x + (alongX ? t : 0), z: road.z + (alongX ? 0 : t),
        w: alongX ? 2.8 : 0.12, d: alongX ? 0.12 : 2.8 };
      if (crossings.some(c => Math.abs(c.x - dash.x) < (c.w + dash.w) / 2 &&
        Math.abs(c.z - dash.z) < (c.d + dash.d) / 2)) continue;
      block(root, dash.w, 0.006, dash.d, dash.x, 0.0155, dash.z, yellow);
    }
  }
  for (const junction of district.junctions) {
    for (const s of [-1, 1]) for (let i = -5; i <= 5; i++) {
      block(root, 0.52, 0.006, 2.5, junction.x + i * 0.9, 0.0155, junction.z + s * 9, white);
      block(root, 2.5, 0.006, 0.52, junction.x + s * 9, 0.0155, junction.z + i * 0.9, white);
    }
  }
  return root;
}
