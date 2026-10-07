import { BUILDING_KIT, type BuildingSpec, type CityDistrict } from "./city";
import type { BoxSpec, Vec3 } from "./config";

export type Opening = { x: number; y: number; w: number; h: number; kind: "window" | "door" | "shutter" };
export type Facade = { x: number; z: number; turn: number; w: number; h: number; openings: Opening[] };
export type PaneSpec = Vec3 & { id: string; w: number; h: number; turn: number; pitch?: number };
export const WINDOW_BORDER = 0.14, MULLION = 0.065;

/** One opening layout for wall geometry, glass, and physical apertures. */
export function buildingFacades(spec: BuildingSpec): Facade[] {
  const { w, h, d, floors } = BUILDING_KIT[spec.prefab], windows: Opening[] = [], ends: Opening[] = [];
  for (let f = 0; f < floors; f++) {
    for (const x of [-7.5, -3.75, 0, 3.75, 7.5].filter(x => Math.abs(x) + 1.18 < w / 2))
      windows.push({ x, y: 2 + f * 3.35, w: 2.35, h: 2.1, kind: "window" });
    for (const x of [-d / 4, d / 4]) ends.push({ x, y: 2 + f * 3.35, w: 2.35, h: 2.1, kind: "window" });
  }
  const shop = spec.prefab === "shop", front = windows.filter(o => o.y !== 2 || (!shop && o.x !== 0));
  front.push({ x: 0, y: 1.5, w: 2.5, h: 3, kind: "door" });
  if (shop) for (const x of [-5.5, 5.5]) front.push({ x, y: 1.625, w: 6.7, h: 2.85, kind: "window" });
  if (spec.prefab === "depot") {
    front.length = 0;
    for (const x of [-5.5, 5.5]) front.push({ x, y: 2.1, w: 6.2, h: 4.2, kind: "shutter" });
  }
  return [
    { x: 0, z: d / 2, turn: 0, w, h, openings: front },
    { x: 0, z: -d / 2, turn: 2, w, h, openings: windows },
    { x: w / 2, z: 0, turn: 1, w: d, h, openings: ends },
    { x: -w / 2, z: 0, turn: 3, w: d, h, openings: ends },
  ];
}

export function wallPanels(face: Facade) {
  const panels: { x: number; y: number; w: number; h: number }[] = [];
  const levels = [...new Set([0, face.h, ...face.openings.flatMap(o => [o.y - o.h / 2, o.y + o.h / 2])])].sort((a, b) => a - b);
  for (let i = 1; i < levels.length; i++) {
    const bottom = levels[i - 1], top = levels[i];
    const gaps = face.openings.filter(o => o.y - o.h / 2 <= bottom && o.y + o.h / 2 >= top).sort((a, b) => a.x - b.x);
    let left = -face.w / 2;
    for (const gap of [...gaps, { x: face.w / 2, w: 0 }]) {
      const right = gap.x - gap.w / 2;
      if (right > left) panels.push({ x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: top - bottom });
      left = Math.max(left, gap.x + gap.w / 2);
    }
  }
  return panels;
}

/** Quarter turns in the same convention as THREE and the building root. */
export function turnPoint(p: Vec3, turn: number): Vec3 {
  const angle = turn * Math.PI / 2, s = Math.sin(angle), c = Math.cos(angle);
  return { x: c * p.x + s * p.z, y: p.y, z: c * p.z - s * p.x };
}

export function openingPanes(o: Opening) {
  const cols = o.w > 4 ? 3 : 2, width = o.w - WINDOW_BORDER * 2;
  // A transom and vertical mullions read as glazed windows at tactical zoom.
  const split = o.y + o.h * 0.16;
  const rows = [[o.y - o.h / 2 + WINDOW_BORDER, split - MULLION / 2],
    [split + MULLION / 2, o.y + o.h / 2 - WINDOW_BORDER]].map(([bottom, top]) => ({ y: (bottom + top) / 2, h: top - bottom }));
  const paneWidth = (width - (cols - 1) * MULLION) / cols;
  return rows.flatMap(row => Array.from({ length: cols }, (_,i) => ({
    x: o.x - width / 2 + paneWidth / 2 + i * (paneWidth + MULLION),
    y: row.y, w: paneWidth, h: row.h,
  })));
}

export function buildingPanes(spec: BuildingSpec, world = false): PaneSpec[] {
  const vertical = buildingFacades(spec).flatMap((face, f) => face.openings.flatMap((o, i) => o.kind !== "window" ? [] :
    openingPanes(o).map((p, n) => {
      const at = turnPoint({ x: p.x, y: p.y, z: 0.04 }, face.turn);
      const local = { x: at.x + face.x, y: at.y, z: at.z + face.z };
      const position = world ? turnPoint(local, spec.turn) : local;
      return { ...p, ...position, x: position.x + (world ? spec.x : 0), z: position.z + (world ? spec.z : 0),
        turn: face.turn + (world ? spec.turn : 0), id: `${spec.id}/${f}/${i}/${n}` };
    })));
  const kit = BUILDING_KIT[spec.prefab];
  const roof = spec.prefab !== "depot" ? [] : [-5.5, 0, 5.5].flatMap((z,i) => Array.from({ length: 5 }, (_,n) => {
    const w = (kit.w - 1) / 5;
    const local = { x: -(kit.w - 1) / 2 + (n + 0.5) * w, y: kit.h + 0.46, z };
    const at = world ? turnPoint(local, spec.turn) : local;
    return { ...at, x: at.x + (world ? spec.x : 0), z: at.z + (world ? spec.z : 0),
      w: w - MULLION, h: 1.8 - WINDOW_BORDER * 2, pitch: -Math.PI / 2, turn: world ? spec.turn : 0, id: `${spec.id}/roof/${i}/${n}` };
  }));
  return [...vertical, ...roof];
}

export function roofPanels(spec: BuildingSpec, w: number = BUILDING_KIT[spec.prefab].w, d: number = BUILDING_KIT[spec.prefab].d) {
  const openings: Opening[] = spec.prefab === "depot" ? [-5.5, 0, 5.5].map(z =>
    ({ x: 0, y: z + d / 2, w: BUILDING_KIT[spec.prefab].w - 1, h: 1.8, kind: "window" })) : [];
  return wallPanels({ x: 0, z: 0, turn: 0, w, h: d, openings }).map(p => ({ x: p.x, z: p.y - d / 2, w: p.w, d: p.h }));
}

function facadeShells(faces: Facade[], x: number, z: number, turn: number, elevation = 0): BoxSpec[] {
  return faces.flatMap(face => {
    const solids = [...wallPanels(face)];
    for (const o of face.openings) {
      if (o.kind !== "window") { solids.push(o); continue; }
      for (const side of [-1, 1]) {
        solids.push({ x: o.x, y: o.y + side * (o.h - WINDOW_BORDER) / 2, w: o.w, h: WINDOW_BORDER });
        solids.push({ x: o.x + side * (o.w - WINDOW_BORDER) / 2, y: o.y, w: WINDOW_BORDER, h: o.h });
      }
      solids.push({ x: o.x, y: o.y + o.h * 0.16, w: o.w, h: MULLION });
      const cols = o.w > 4 ? 3 : 2, width = o.w - WINDOW_BORDER * 2, paneWidth = (width - (cols - 1) * MULLION) / cols;
      for (let i = 1; i < cols; i++) solids.push({ x: o.x - width / 2 + i * (paneWidth + MULLION) - MULLION / 2, y: o.y, w: MULLION, h: o.h });
    }
    return solids.map(p => {
      const at = turnPoint({ x: p.x, y: p.y, z: 0 }, face.turn);
      const center = turnPoint({ x: at.x + face.x, y: at.y, z: at.z + face.z }, turn);
      const acrossX = (face.turn + turn) % 2 === 0;
      return { x: x + center.x, z: z + center.z, y: elevation + center.y - p.h / 2,
        w: acrossX ? p.w : 0.18, d: acrossX ? 0.18 : p.w, h: p.h, style: "wall" as const };
    });
  });
}

export function buildingShell(spec: BuildingSpec): BoxSpec[] {
  const { w, h, d } = BUILDING_KIT[spec.prefab];
  const pieces = facadeShells(buildingFacades(spec), spec.x, spec.z, spec.turn);
  const rotated = spec.turn % 2 !== 0;
  pieces.push({ x: spec.x, z: spec.z, y: 0, w: rotated ? d : w, d: rotated ? w : d, h: 0.16, style: "wall" });
  for (const p of roofPanels(spec)) {
    const at = turnPoint({ x: p.x, y: 0, z: p.z }, spec.turn);
    pieces.push({ x: spec.x + at.x, z: spec.z + at.z, y: h, w: rotated ? p.d : p.w, d: rotated ? p.w : p.d, h: 0.16, style: "wall" });
  }
  if (spec.prefab === "depot") for (const z of [-5.5, 0, 5.5]) {
    const frames = [-1, 1].map(side => ({ x: 0, z: z + side * (1.8 - WINDOW_BORDER) / 2, w: w - 1, d: WINDOW_BORDER }));
    for (let i = 0; i <= 5; i++) frames.push({ x: -(w - 1) / 2 + i * (w - 1) / 5, z, w: MULLION, d: 1.8 });
    for (const p of frames) {
      const at = turnPoint({ x: p.x, y: 0, z: p.z }, spec.turn);
      pieces.push({ x: spec.x + at.x, z: spec.z + at.z, y: h + 0.4, w: rotated ? p.d : p.w, d: rotated ? p.w : p.d, h: 0.12, style: "wall" });
    }
  }
  return pieces;
}

/** Wheelhouse glazing is authored in ship-local coordinates, like its render kit. */
export function wheelhouseFacades(): Facade[] {
  return [
    { x: 0, z: -27, turn: 0, w: 9.5, h: 2.2, openings: [-3, 0, 3].map(x => ({ x, y: 1.35, w: 2.1, h: 0.7, kind: "window" })) },
    { x: 0, z: -35, turn: 2, w: 9.5, h: 2.2, openings: [] },
    ...[-1, 1].map(side => ({ x: side * 4.75, z: -31, turn: side > 0 ? 1 : 3, w: 8, h: 2.2,
      openings: [0, -side * 2.2].map(x => ({ x, y: 1.35, w: 1.55, h: 0.7, kind: "window" as const })) })),
  ];
}
export function shipPanes(district: CityDistrict): PaneSpec[] {
  const ship = district.port?.ship;
  if (!ship) return [];
  return wheelhouseFacades().flatMap((face,f) => face.openings.flatMap((o,i) => openingPanes(o).map((p,n) => {
    const at = turnPoint({ x: p.x, y: p.y, z: 0.04 }, face.turn);
    return { ...p, x: ship.x + face.x + at.x, y: at.y + 3.7, z: ship.z + face.z + at.z, turn: face.turn, id: `ship/${f}/${i}/${n}` };
  })));
}
export function shipShell(district: CityDistrict): BoxSpec[] {
  const ship = district.port?.ship;
  if (!ship) return [];
  return [...facadeShells(wheelhouseFacades(), ship.x, ship.z, 0, 3.7),
    { x: ship.x, z: ship.z - 31, y: 5.9, w: 9.5, d: 8, h: 0.16, style: "wall" }];
}
