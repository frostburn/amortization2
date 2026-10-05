import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  BARRIERS,
  BOUNDS,
  FORMATION_SPACING,
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  SHOT_INTERVAL,
  STEP,
  distance2,
} from "../src/game/config";
import { findPath } from "../src/game/navigation";
import { Simulation } from "../src/game/simulation";

describe("proving ground simulation", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create();
  });
  afterEach(() => sim.world.free());
  const ticks = (sim: Simulation, seconds: number) => {
    for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
  };

  test("the full squad settles onto the four corners of its square move order", () => {
    sim.select(5);
    sim.move({ x: 0, z: 8 });
    const goals = sim.active.map((a) => a.moveTarget!);
    expect(new Set(goals.map((p) => p.x)).size).toBe(2);
    expect(new Set(goals.map((p) => p.z)).size).toBe(2);
    expect(
      Math.max(...goals.map((p) => p.x)) - Math.min(...goals.map((p) => p.x)),
    ).toBeCloseTo(FORMATION_SPACING);
    expect(
      Math.max(...goals.map((p) => p.z)) - Math.min(...goals.map((p) => p.z)),
    ).toBeCloseTo(FORMATION_SPACING);
    ticks(sim, 8);
    for (const a of sim.active) {
      expect(a.path).toHaveLength(0);
      expect(distance2(a.body.translation(), a.moveTarget!)).toBeLessThan(0.15);
    }
  });

  test("steering preserves square slots and queued moves finish in the next formation", () => {
    sim.select(5);
    sim.move({ x: 0, z: 8 });
    const first = sim.active.map((a) => ({ ...a.moveTarget! }));
    ticks(sim, 1);
    sim.move({ x: 12, z: 8 });
    const steered = sim.active.map((a) => ({ ...a.moveTarget! }));
    for (let i = 0; i < first.length; i++) {
      expect(steered[i].x - first[i].x).toBeCloseTo(12);
      expect(steered[i].z).toBeCloseTo(first[i].z);
    }
    sim.move({ x: -10, z: 6 }, true);
    for (const [i, a] of sim.active.entries()) {
      expect(a.path).toContainEqual(steered[i]);
      expect(a.path.at(-1)).toEqual(a.moveTarget);
    }
    ticks(sim, 18);
    for (const a of sim.active) {
      expect(a.path).toHaveLength(0);
      expect(distance2(a.body.translation(), a.moveTarget!)).toBeLessThan(0.15);
    }
  });

  test("cover and yard edges shift the complete footprint without collapsing its corners", () => {
    sim.select(5);
    for (const point of [
      { x: -0.8, z: -6.5 },
      { x: -22, z: 14 },
      { x: 22, z: -18 },
      { x: -20, z: 11 },
    ]) {
      const goals = sim.moveDestinations(point).map((t) => t.position);
      expect(goals).toHaveLength(4);
      expect(distance2(goals[0], goals[1])).toBeCloseTo(FORMATION_SPACING);
      expect(distance2(goals[1], goals[2])).toBeCloseTo(FORMATION_SPACING);
      for (const p of goals) {
        expect(p.x).toBeGreaterThanOrEqual(BOUNDS.left + 1);
        expect(p.x).toBeLessThanOrEqual(BOUNDS.right - 1);
        expect(p.z).toBeGreaterThanOrEqual(BOUNDS.back + 1);
        expect(p.z).toBeLessThanOrEqual(BOUNDS.front - 1);
        expect(
          BARRIERS.some(
            (b) =>
              Math.abs(p.x - b.x) < b.w / 2 + 0.55 &&
              Math.abs(p.z - b.z) < b.d / 2 + 0.55,
          ),
        ).toBe(false);
      }
    }
    sim.move({ x: -0.8, z: -6.5 });
    ticks(sim, 15);
    for (const a of sim.active) {
      expect(a.path).toHaveLength(0);
      expect(distance2(a.body.translation(), a.moveTarget!)).toBeLessThan(0.15);
    }
  });

  test("navigation keeps a clear exact destination within the same grid cell", () => {
    const goal = { x: 0.12, z: 8.2 };
    expect(findPath({ x: 0.1, z: 8.1 }, goal, BARRIERS).at(-1)).toEqual(goal);
  });

  test("continuous fire follows the supplied loop cadence and reloads a depleted magazine", () => {
    sim.aim = { x: -21, y: 2, z: -17 };
    sim.trigger = true;
    ticks(sim, 1);
    expect(sim.shots).toBeGreaterThanOrEqual(Math.floor(1 / SHOT_INTERVAL));
    expect(sim.shots).toBeLessThanOrEqual(Math.ceil(1 / SHOT_INTERVAL) + 1);
    sim.primary.ammo = 1;
    ticks(sim, 0.1);
    expect(sim.primary.reload).toBeGreaterThan(0);
    sim.trigger = false;
    ticks(sim, 2.3);
    expect(sim.primary.ammo).toBe(90);
  });

  test("machine gun hits damage and displace targets, while concrete blocks the same shot", () => {
    const target = sim.actors.find((a) => a.id === 10)!;
    sim.aim = { ...target.body.translation(), y: 1.2 };
    sim.trigger = true;
    ticks(sim, 0.3);
    sim.trigger = false;
    expect(target.hp).toBeLessThan(target.maxHp);
    expect(distance2(target.spawn, target.body.translation())).toBeGreaterThan(
      0.02,
    );
    const protectedTarget = sim.actors.find((a) => a.kind === "blast")!;
    sim.select(4);
    sim.aim = { ...protectedTarget.body.translation(), y: 1.1 };
    sim.trigger = true;
    ticks(sim, 0.6);
    expect(protectedTarget.hp).toBe(protectedTarget.maxHp);
  });

  test("grenades leave the thrower, travel ballistically, and detonate on their fuse", () => {
    sim.select(4);
    const before = sim.primary.body.translation();
    expect(sim.throwGrenade({ x: 14, z: -9 })).toBe(true);
    ticks(sim, 0.5);
    expect(sim.grenades).toHaveLength(1);
    expect(sim.grenades[0].body.translation().y).toBeGreaterThan(2);
    expect(sim.grenades[0].body.translation().z).toBeLessThan(before.z - 3);
    ticks(sim, GRENADE_FUSE - 0.5 + STEP);
    expect(sim.grenades).toHaveLength(0);
    expect(sim.events.some((e) => e.type === "explosion")).toBe(true);
  });

  test("a solid barrier blocks blast pressure while the exposed side remains vulnerable", () => {
    const target = sim.actors.find((a) => a.kind === "blast")!;
    const p = target.body.translation();
    expect(sim.blastExposure({ x: p.x, y: 0.2, z: -4.8 }, target)).toBe(0);
    expect(
      sim.blastExposure({ x: p.x, y: 0.2, z: -10.5 }, target),
    ).toBeGreaterThan(0);
  });

  test("grenade clicks rotate through the ready squad and enforce a cooldown per robot", () => {
    sim.select(5);
    for (const id of [1, 2, 3, 4]) {
      expect(sim.grenadeThrower?.id).toBe(id);
      expect(sim.throwGrenade({ x: 0, z: -15 })).toBe(true);
    }
    expect(sim.grenades.map((g) => g.owner)).toEqual([1, 2, 3, 4]);
    expect(sim.grenadeThrower).toBeUndefined();
    expect(sim.throwGrenade({ x: 0, z: -15 })).toBe(false);
    expect(sim.throws).toBe(4);
    ticks(sim, GRENADE_COOLDOWN - 0.25);
    expect(sim.throwGrenade({ x: 0, z: -15 })).toBe(false);
    ticks(sim, 0.25 + STEP);
    expect(sim.throws).toBe(4); // Blocked clicks never queue an automatic throw.
    expect(sim.grenadeThrower?.id).toBe(1);
    expect(sim.throwGrenade({ x: 0, z: -15 })).toBe(true);
    expect(sim.grenades.at(-1)?.owner).toBe(1);
  });

  test("grenade rotation skips unavailable robots and cooldowns persist across selection changes", () => {
    sim.throwGrenade({ x: -14, z: -14 });
    sim.select(3);
    expect(sim.grenadeThrower?.id).toBe(3);
    sim.throwGrenade({ x: 4, z: -14 });
    sim.select(5);
    sim.damage(
      sim.squad[1],
      1000,
      { x: 0, y: 0, z: 0 },
      sim.squad[1].body.translation(),
    );
    expect(sim.grenadeThrower?.id).toBe(4);
    sim.throwGrenade({ x: 14, z: -14 });
    expect(sim.grenadeThrower).toBeUndefined();
    sim.select(1);
    ticks(sim, 1);
    expect(sim.throwGrenade({ x: -14, z: -14 })).toBe(false);
    expect(sim.squad[2].grenadeCooldown).toBeCloseTo(GRENADE_COOLDOWN - 1);
    sim.reset();
    sim.select(5);
    expect(sim.grenadeThrower?.id).toBe(1);
    expect(sim.active.every((a) => a.grenadeCooldown === 0)).toBe(true);
  });

  test("grenade kills cannot complete the machine-gun drill", () => {
    sim.throwGrenade({ x: -17, z: 2 });
    ticks(sim, GRENADE_FUSE + STEP);
    const plates = sim.actors.filter((a) => a.kind === "plate");
    expect(plates.some((a) => a.dead && a.killedBy === "grenade")).toBe(true);
    for (const plate of plates.filter((a) => !a.dead))
      sim.damage(
        plate,
        plate.hp,
        { x: 0, y: 0, z: 0 },
        plate.body.translation(),
        "gun",
      );
    sim.step();
    expect(plates.every((a) => a.dead)).toBe(true);
    expect(sim.drill.gun).toBe(false);
    expect(
      sim.events.some(
        (e) => e.type === "drill" && e.message.startsWith("Firing"),
      ),
    ).toBe(false);
  });

  test("bracing reduces impact displacement without cancelling a pending move order", () => {
    const a = sim.primary;
    sim.move({ x: -14, z: 2 });
    const pathLength = a.path.length;
    a.braced = true;
    sim.damage(a, 1, { x: 300, y: 0, z: 0 }, a.body.translation());
    ticks(sim, 0.1);
    const bracedDistance = Math.abs(a.body.translation().x - a.spawn.x);
    expect(a.path.length).toBe(pathLength);
    sim.reset();
    const free = sim.primary;
    sim.damage(free, 1, { x: 300, y: 0, z: 0 }, free.body.translation());
    ticks(sim, 0.1);
    expect(Math.abs(free.body.translation().x - free.spawn.x)).toBeGreaterThan(
      bracedDistance * 1.5,
    );
  });

  test("reset restores the complete range and clears held input and live explosives", () => {
    sim.trigger = true;
    sim.throwGrenade({ x: -14, z: 0 });
    ticks(sim, 0.3);
    sim.reset();
    expect(sim.shots).toBe(0);
    expect(sim.grenades).toHaveLength(0);
    expect(sim.trigger).toBe(false);
    expect(sim.actors).toHaveLength(16);
    expect(sim.primary.ammo).toBe(90);
    expect(sim.actors.every((a) => a.hp === a.maxHp)).toBe(true);
  });

  test("the moving target traverses its lane instead of stalling against floor friction", () => {
    const target = sim.actors.find((a) => a.kind === "moving")!;
    ticks(sim, 2.5);
    expect(target.body.translation().x - target.spawn.x).toBeGreaterThan(1.5);
    ticks(sim, 4);
    expect(target.body.translation().x - target.spawn.x).toBeLessThan(-1.5);
  });

  test("all authored drills can be completed with their intended weapons from the firing line", () => {
    sim.trigger = true;
    for (const target of sim.actors.filter((a) => a.kind === "plate")) {
      for (let i = 0; i < 180 && !target.dead; i++) {
        sim.aim = { ...target.body.translation(), y: 1.25 };
        sim.step();
      }
      expect(target.dead).toBe(true);
    }
    expect(sim.drill.gun).toBe(true);
    sim.select(2);
    sim.trigger = true;
    const heavy = sim.actors.find((a) => a.kind === "heavy")!;
    for (let i = 0; i < 240 && !sim.drill.impulse; i++) {
      sim.aim = { ...heavy.body.translation(), y: 1.25 };
      sim.step();
    }
    expect(sim.maxDisplacement).toBeGreaterThanOrEqual(2);
    sim.select(4);
    sim.throwGrenade({ x: 13, z: -9.8 });
    ticks(sim, 2.5);
    expect(sim.drill).toEqual({ gun: true, impulse: true, grenade: true });
  });

  test("routes go around inflated range barriers without diagonal corner cutting", () => {
    const path = findPath({ x: 10, z: -3 }, { x: 12, z: -10 }, BARRIERS);
    expect(path.length).toBeGreaterThan(8);
    for (const p of path)
      expect(
        BARRIERS.some(
          (b) =>
            Math.abs(p.x - b.x) < b.w / 2 + 0.54 &&
            Math.abs(p.z - b.z) < b.d / 2 + 0.54,
        ),
      ).toBe(false);
  });
});
