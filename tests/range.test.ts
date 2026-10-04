import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  BARRIERS,
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
