export type Vec3 = { x: number; y: number; z: number };
export type Vec2 = { x: number; z: number };
/** Roof remains closed to aircraft even when rendered as a cutaway. */
export type RoofedArea = Vec2 & { w: number; d: number; h: number; y?: number; exits: Vec2[] };
export type BoxSpec = {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  y?: number;
  navigationOnly?: boolean;
  building?: string;
  style: "wall" | "barrier" | "crate";
};
export const STEP = 1 / 60;
export const GRAVITY = 12;
export const MAGAZINE = 90;
export const GUN_RANGE = 65;
// The supplied ten-shot loop lasts 0.7145625 s. Match the simulated cadence.
export const SHOT_INTERVAL = 0.7145625 / 10;
export const RELOAD_SECONDS = 2.2;
export const GRENADE_FUSE = 2.4;
export const GRENADE_COOLDOWN = 4;
export const BLAST_RADIUS = 6.5;
export const FORMATION_SPACING = 2.2;
export const RIFLE = {
  magazine: 5,
  interval: 1.4,
  reload: 3,
  range: 140,
  damage: 140,
  settle: 0.6,
  recoil: 180,
  muzzle: 1.65,
};
export const PISTOL = {
  magazine: 12,
  interval: 0.35,
  reload: 1.6,
  range: 28,
  damage: 22,
  muzzle: 0.66,
};
export const MINIGUN = {
  magazine: 240,
  interval: 1 / 30,
  reload: 3.8,
  range: 65,
  damage: 6,
  muzzle: 1.18,
  windUp: 0.5,
  coast: 0.7,
};
export const FIREARMS = {
  gun: {
    magazine: MAGAZINE, interval: SHOT_INTERVAL, reload: RELOAD_SECONDS,
    range: GUN_RANGE, damage: 6, muzzle: 0.86,
  },
  rifle: RIFLE,
  pistol: PISTOL,
  minigun: MINIGUN,
};
export type Firearm = keyof typeof FIREARMS;
export type Weapon = Firearm | "grenade";
// Upper-chest fire clears the arena's 1.25–1.3 m barriers without cursor chasing.
export const AUTOMATIC_AIM = { height: 1.65, bodyOffset: 0.7 };
// Automatic fire buys ground before it kills. Motor control must preserve this
// external velocity rather than treating it as a walking error every frame.
export const KINETIC = {
  impulse: { gun: 180, minigun: 240, pistol: 36, rifle: 180 },
  bracedBullet: 0.6,
  drag: 3.2,
  maxSpeed: 7,
  minigunMaxSpeed: 13,
};
export const STAGGER = {
  duration: { gun: 0.18, minigun: 0.2, pistol: 0.22, rifle: 0.4, grenade: 0.65, vehicle: 0.65 },
  bracedRecovery: 2.5,
  grace: 0.12,
};
export const ENEMY_BRACE_WAVE = 3;
export const FRIENDLY_FIRE = {
  gun: false, pistol: false, minigun: false, rifle: true, grenade: true,
} as const;
export const ROBOT_MODELS = {
  assault: { name: "ASSAULT", hp: 160, mass: 90, weapon: "gun", weapons: ["gun", "grenade"] },
  sniper: { name: "SNIPER", hp: 64, mass: 48, weapon: "rifle", weapons: ["rifle", "pistol"] },
  minigunner: { name: "MINIGUNNER", hp: 200, mass: 130, weapon: "minigun", weapons: ["minigun"] },
} as const;
export type RobotModel = keyof typeof ROBOT_MODELS;
export const squadName = (id: number, model: RobotModel | null) =>
  id === 4 ? model === "sniper" ? "NEEDLE" : model === "minigunner" ? "SPINDLE" : "BOLT"
    : id === 2 && model === "minigunner" ? "ROOK" : SQUAD_NAMES[id - 1];
export type RangeBounds = {
  left: number;
  right: number;
  back: number;
  front: number;
};
export const BOUNDS = { left: -33, right: 33, back: -27, front: 21 };
export const BARRIERS: BoxSpec[] = [
  { x: 0, z: -27.5, w: 67, d: 1, h: 3.7, style: "wall" },
  { x: -33.5, z: -3, w: 1, d: 49, h: 2.5, style: "wall" },
  { x: 33.5, z: -3, w: 1, d: 49, h: 0.6, style: "wall" },
  { x: 0, z: 21.5, w: 67, d: 1, h: 0.4, style: "wall" },
  { x: 7, z: -5, w: 0.65, d: 18, h: 1.15, style: "barrier" },
  { x: 13, z: -6, w: 5.2, d: 0.75, h: 1.35, style: "barrier" },
  { x: 17.9, z: -12.7, w: 6.5, d: 0.75, h: 1.7, style: "barrier" },
  { x: 17.6, z: 0.7, w: 4.7, d: 0.8, h: 1.15, style: "barrier" },
  { x: -0.8, z: -6.5, w: 2.4, d: 2, h: 2.6, style: "crate" },
  { x: 2.2, z: -11.5, w: 2.1, d: 2.1, h: 1.45, style: "crate" },
  { x: -20, z: 11, w: 1.5, d: 1.5, h: 1.4, style: "crate" },
  { x: 20, z: 11, w: 1.5, d: 1.5, h: 1.4, style: "crate" },
  { x: -20, z: -15, w: 1.5, d: 1.5, h: 1.4, style: "crate" },
];
export const PROP_SPAWNS = [
  { x: -3.8, z: 1, w: 1.5, h: 1.2, d: 1.5, mass: 25 },
  { x: -1.9, z: 1, w: 1.5, h: 1.2, d: 1.5, mass: 25 },
  { x: 1.1, z: 0.1, w: 1.6, h: 1.55, d: 1.6, mass: 45 },
  { x: 18.8, z: -8.7, w: 0.8, h: 1.4, d: 0.8, mass: 16 },
  { x: 17.9, z: -9.2, w: 0.8, h: 1.4, d: 0.8, mass: 16 },
  { x: 11.2, z: -11.2, w: 1.3, h: 1.3, d: 1.3, mass: 24 },
];
export const TARGET_SPAWNS = [
  { x: -17, z: 2, kind: "plate" },
  { x: -12, z: -1.5, kind: "plate" },
  { x: -17.5, z: -5.6, kind: "plate" },
  // Distinct firing bearings keep pushed wrecks from sealing the next lane.
  { x: -8.5, z: -8.5, kind: "plate" },
  { x: -16.5, z: -12.5, kind: "plate" },
  { x: -12, z: -14.2, kind: "plate" },
  { x: -4.3, z: -4.3, kind: "heavy" },
  { x: 3.3, z: -3, kind: "heavy" },
  { x: -3, z: -12, kind: "moving" },
  { x: 11.3, z: -8.7, kind: "blast" },
  { x: 14.5, z: -9.5, kind: "blast" },
  { x: 13, z: -12, kind: "blast" },
] as const;
export const SQUAD_NAMES = ["ANCHOR", "BREECH", "LATCH", "NEEDLE"];
export const PLAYER_SPAWNS = [
  { x: -14, z: 10 },
  { x: -4, z: 10 },
  // LATCH takes the grenade bay now that NEEDLE carries no explosives.
  { x: 14, z: 10 },
  { x: 4, z: 10 },
];
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const distance2 = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.z - b.z);

export function grenadeVelocity(
  from: Vec3,
  requested: Vec2,
): { velocity: Vec3; target: Vec3; duration: number } {
  const distance = distance2(from, requested);
  const range = Math.min(28, distance);
  const scale = distance > 0.001 ? range / distance : 0;
  const target = {
    x: from.x + (requested.x - from.x) * scale,
    y: 0.15,
    z: from.z + (requested.z - from.z) * scale,
  };
  const duration = 0.72 + range / 22;
  return {
    target,
    duration,
    velocity: {
      x: (target.x - from.x) / duration,
      y: (target.y - from.y + 0.5 * GRAVITY * duration ** 2) / duration,
      z: (target.z - from.z) / duration,
    },
  };
}
