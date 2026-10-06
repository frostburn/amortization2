import {
  BARRIERS,
  BOUNDS,
  PLAYER_SPAWNS,
  PROP_SPAWNS,
  TARGET_SPAWNS,
  type BoxSpec,
  type RangeBounds,
} from "./config";

export type RangeId = "proving" | "long" | "arena";
export const ARENA_ENTRIES = [
  { name: "NORTH", x: 0, z: -20, dx: 0, dz: 1 },
  { name: "EAST", x: 30, z: 0, dx: -1, dz: 0 },
  { name: "SOUTH", x: 0, z: 20, dx: 0, dz: -1 },
  { name: "WEST", x: -30, z: 0, dx: 1, dz: 0 },
] as const;
export type TargetKind = (typeof TARGET_SPAWNS)[number]["kind"] | "precision";
type RangeDefinition = {
  name: string;
  bounds: RangeBounds;
  barriers: BoxSpec[];
  platforms: BoxSpec[];
  players: { x: number; z: number }[];
  targets: { x: number; z: number; elevation?: number; kind: TargetKind }[];
  props: typeof PROP_SPAWNS;
};

export const RANGES: Record<RangeId, RangeDefinition> = {
  arena: {
    name: "ENDLESS ARENA",
    bounds: { left: -32, right: 32, back: -22, front: 22 },
    barriers: [
      // Four broad entrances. The near wall stays low enough for the overhead camera.
      ...[-19, 19].flatMap((x): BoxSpec[] => [
        { x, z: -22.5, w: 26, d: 1, h: 3, style: "wall" },
        { x, z: 22.5, w: 26, d: 1, h: 0.6, style: "wall" },
      ]),
      ...[-32.5, 32.5].flatMap((x): BoxSpec[] => [-14, 14].map((z) => ({
        x, z, w: 1, d: 16, h: 2, style: "wall",
      }))),
      { x: 0, z: -6, w: 4, d: 3, h: 2.6, style: "crate" },
      { x: -11, z: 0, w: 0.8, d: 9, h: 1.25, style: "barrier" },
      { x: 11, z: 0, w: 0.8, d: 9, h: 1.25, style: "barrier" },
      { x: 0, z: 6, w: 5, d: 0.8, h: 1.3, style: "barrier" },
      { x: -19, z: -11, w: 3, d: 3, h: 2.5, style: "crate" },
      { x: 19, z: -11, w: 3, d: 3, h: 2.5, style: "crate" },
      { x: -19, z: 11, w: 6, d: 0.8, h: 1.3, style: "barrier" },
      { x: 19, z: 11, w: 6, d: 0.8, h: 1.3, style: "barrier" },
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
    bounds: { left: -8, right: 98, back: -9, front: 9 },
    barriers: [
      { x: 45, z: -9.5, w: 107, d: 1, h: 2.8, style: "wall" },
      { x: 45, z: 9.5, w: 107, d: 1, h: 0.6, style: "wall" },
      { x: -8.5, z: 0, w: 1, d: 19, h: 1.4, style: "wall" },
      { x: 98.5, z: 0, w: 1, d: 19, h: 4, style: "wall" },
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
