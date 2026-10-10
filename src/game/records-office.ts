import type { BoxSpec } from "./config";
import { facadePanes, facadeShells, turnPoint, wallPanels, type Facade } from "./facades";

/** A street-facing lobby, partitioned archive and rear staff exit. */
export const RECORDS_OFFICE = { x: 6, z: -2, w: 26, d: 20, h: 4.4 };
export const RECORDS_ENTRANCE: BoxSpec = { x: -1, z: 8, w: 4.8, d: .35, h: 3.5, style: "wall" };
export const RECORDS_EXIT: BoxSpec = { x: 14, z: -12, w: 3.8, d: .35, h: 3.2, style: "wall" };
export const RECORDS_ROOF: BoxSpec = { x: 6, z: -2, w: 26.5, d: 20.5, y: 4.4, h: .28, style: "wall" };
export const RECORDS_CANOPY: BoxSpec = { x: -1, z: 9.3, w: 9.6, d: 2.6, y: 3.55, h: .2, style: "wall" };
export const RECORDS_POSTS: BoxSpec[] = [-5.3, 3.3].map(x => ({ x, z: 9.8, w: .26, d: .26, h: 3.55, style: "wall" }));
export const RECORDS_FACADES: Facade[] = [
  { x: 6, z: 8, turn: 0, w: 26, h: 4.4, openings: [
    { x: -7, y: 1.75, w: 4.8, h: 3.5, kind: "door" },
    ...[2, 9].map(x => ({ x, y: 2.3, w: 5, h: 2.3, kind: "window" as const })),
  ] },
  { x: 6, z: -12, turn: 2, w: 26, h: 4.4, openings: [
    { x: -8, y: 1.6, w: 3.8, h: 3.2, kind: "door" },
    ...[1, 8].map(x => ({ x, y: 2.85, w: 4, h: 1.3, kind: "window" as const })),
  ] },
  ...[-1, 1].map(side => ({ x: 6 + side * 13, z: -2, turn: side > 0 ? 1 : 3, w: 20, h: 4.4,
    openings: [-5, 3].map(x => ({ x, y: 2.85, w: 3.2, h: 1.3, kind: "window" as const })) })),
  { x: 6, z: -3, turn: 0, w: 26, h: 3.3, openings: [{ x: 5, y: 1.65, w: 4, h: 3.3, kind: "door" }] },
  { x: 5, z: -7.5, turn: 1, w: 9, h: 3.3, openings: [] },
];
export const RECORDS_PANES = facadePanes(RECORDS_FACADES, "records");
export const RECORDS_SHELL = [...facadeShells(RECORDS_FACADES, 0, 0, 0, 0, false), RECORDS_CANOPY, ...RECORDS_POSTS];

// Navigation treats window sills as full walls, while the combat shell retains
// framed apertures and breakable glass. Both door gaps have runtime locks.
export const RECORDS_WALLS: BoxSpec[] = RECORDS_FACADES.flatMap(face =>
  wallPanels({ ...face, openings: face.openings.filter(o => o.kind === "door").map(o => ({ ...o, y: face.h / 2, h: face.h })) })
    .map(p => {
      const at = turnPoint({ x: p.x, y: 0, z: 0 }, face.turn), acrossX = face.turn % 2 === 0;
      return { x: face.x + at.x, z: face.z + at.z, w: acrossX ? p.w : .3, d: acrossX ? .3 : p.w,
        h: face.h, style: "wall" as const, navigationOnly: true };
    }));
