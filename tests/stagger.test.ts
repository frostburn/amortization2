import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { STEP, distance2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";

function ticks(sim: Simulation, seconds: number, before?: () => void) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) {
    before?.();
    sim.step();
  }
}
const noImpulse = { x: 0, y: 0, z: 0 };

describe("stagger and recovery", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create("arena");
    sim.arena!.countdown = 100;
    sim.select(1);
    sim.primary.body.setTranslation({ x: -30, y: 0.96, z: 12 }, true);
    ticks(sim, 0.1);
  });
  afterEach(() => sim.world.free());

  test("a bullet pauses walking, manual shots and grenades, then resumes the order and held trigger", () => {
    const a = sim.primary, goal = { x: -30, z: 18 };
    sim.move(goal);
    ticks(sim, 0.5);
    const speed = a.body.linvel().z, ammo = a.ammo;
    sim.damage(a, 1, noImpulse, a.body.translation(), "gun");
    expect(sim.isDisrupted(a)).toBe(true);
    expect(sim.grenadeThrower).toBeUndefined();
    expect(sim.grenadeCooldown).toBeGreaterThan(0);
    sim.shoot(a);
    expect(sim.throwGrenade(goal, a)).toBe(false);
    sim.trigger = true;
    ticks(sim, 0.1);
    expect(a.ammo).toBe(ammo);
    expect(sim.shots).toBe(0);
    expect(a.firing).toBe(false);
    expect(a.body.linvel().z).toBeLessThan(speed - 0.7);
    expect(a.moveTarget).toEqual(goal);
    expect(a.path.length).toBeGreaterThan(0);
    ticks(sim, 0.15);
    expect(sim.isDisrupted(a)).toBe(false);
    expect(sim.shots).toBeGreaterThan(0);
    expect(sim.grenadeThrower).toBe(a);
    sim.trigger = false;
    ticks(sim, 3);
    expect(distance2(a.body.translation(), goal)).toBeLessThan(0.15);
  });

  test("bracing after impact clears the remaining stagger sooner", () => {
    const recovery: number[] = [];
    for (const brace of [false, true]) {
      sim.reset("arena");
      sim.arena!.countdown = 100;
      sim.select(1);
      const a = sim.primary;
      sim.damage(a, 1, noImpulse, a.body.translation(), "gun");
      ticks(sim, 0.05);
      if (brace) sim.setBrace(true);
      const start = sim.time;
      while (sim.isDisrupted(a) && sim.time - start < 1) sim.step();
      recovery.push(sim.time - start);
      expect(sim.isDisrupted(a)).toBe(false);
    }
    expect(recovery[0]).toBeGreaterThan(0.12);
    expect(recovery[1]).toBeLessThan(0.07);
    expect(recovery[0]).toBeGreaterThanOrEqual(recovery[1] * 2);
  });

  test("continuous minigun hits leave firing windows, with more usable time while braced", () => {
    const counts: number[] = [];
    for (const brace of [false, true]) {
      sim.reset("arena");
      sim.arena!.countdown = 100;
      sim.select(1);
      sim.setBrace(brace);
      sim.aim = { x: -6, y: 2, z: -20 };
      sim.trigger = true;
      const a = sim.primary;
      let stoppedFrames = 0, firingFrames = 0;
      ticks(sim, 2, () => {
        // A hit every physics tick is harsher than the minigun's real cadence.
        sim.damage(a, 0, noImpulse, a.body.translation(), "minigun");
        if (sim.isDisrupted(a)) stoppedFrames++;
        if (a.firing) firingFrames++;
      });
      counts.push(sim.shots);
      expect(stoppedFrames).toBeGreaterThan(30);
      expect(firingFrames).toBeGreaterThan(10);
      expect(sim.shots).toBeGreaterThan(5);
      expect(firingFrames).toBeLessThan(100);
    }
    expect(counts[1]).toBeGreaterThan(counts[0] + 2);
  });

  test("rifle and grenade shocks override the ordinary-hit recovery window", () => {
    const a = sim.primary;
    sim.damage(a, 1, noImpulse, a.body.translation(), "gun");
    ticks(sim, 0.2);
    expect(a.staggerGrace).toBeGreaterThan(0);
    sim.damage(a, 1, noImpulse, a.body.translation(), "gun");
    expect(sim.isDisrupted(a)).toBe(false);
    sim.damage(a, 1, noImpulse, a.body.translation(), "rifle");
    expect(sim.isDisrupted(a)).toBe(true);
    ticks(sim, 0.25);
    expect(sim.isDisrupted(a)).toBe(true);
    sim.damage(a, 1, noImpulse, a.body.translation(), "grenade");
    ticks(sim, 0.4);
    expect(sim.isDisrupted(a)).toBe(true);
    sim.setBrace(true);
    ticks(sim, 0.12);
    expect(sim.isDisrupted(a)).toBe(false);
  });

  test("stagger coasts a minigun without spending rounds and resumes retained spin on recovery", () => {
    sim.reset("arena", "minigunner");
    sim.arena!.countdown = 100;
    sim.select(4);
    sim.setBrace(true);
    sim.aim = { x: -6, y: 2, z: -20 };
    sim.trigger = true;
    ticks(sim, 0.65);
    const a = sim.primary, ammo = a.ammo;
    expect(a.firing).toBe(true);
    sim.damage(a, 1, noImpulse, a.body.translation(), "gun");
    expect(a.firing).toBe(false);
    expect(a.spooling).toBe(false);
    sim.shoot(a);
    ticks(sim, 0.05);
    expect(a.ammo).toBe(ammo);
    expect(a.spin).toBeGreaterThan(0.8);
    expect(a.spin).toBeLessThan(1);
    ticks(sim, 0.25);
    expect(a.spin).toBe(1);
    expect(a.ammo).toBeLessThan(ammo);
  });

  test("grenade rotation skips staggered members, and death/refit/reset clear recovery state", () => {
    sim.select(5);
    sim.damage(sim.squad[0], 1, noImpulse, sim.squad[0].body.translation(), "gun");
    expect(sim.grenadeThrower?.id).toBe(2);
    expect(sim.throwGrenade({ x: -20, z: 15 })).toBe(true);
    expect(sim.grenades[0].owner).toBe(2);
    const casualty = sim.squad[2];
    sim.damage(casualty, casualty.hp, noImpulse, casualty.body.translation(), "gun");
    expect(sim.isDisrupted(casualty)).toBe(false);
    expect(casualty.stagger).toBe(0);
    sim.reset("arena");
    sim.arena!.countdown = 0;
    sim.step();
    const survivor = sim.squad[0];
    sim.damage(survivor, 1, noImpulse, survivor.body.translation(), "grenade");
    for (const enemy of sim.arena!.enemies)
      sim.damage(enemy, enemy.hp, noImpulse, enemy.body.translation(), "gun");
    sim.step();
    expect(sim.arena!.phase).toBe("intermission");
    expect(survivor.stagger).toBe(0);
    expect(survivor.staggerGrace).toBe(0);
    sim.damage(survivor, 1, noImpulse, survivor.body.translation(), "gun");
    sim.reset();
    expect(sim.squad.every(a => !sim.isDisrupted(a) && a.staggerGrace === 0)).toBe(true);
  });

  test.each([1, 2, 3])("wave %s enemies fire with the intended bracing policy", (wave) => {
    sim.arena!.wave = wave - 1;
    sim.arena!.entries = [0, 1];
    sim.arena!.countdown = 0;
    sim.step();
    const enemy = sim.arena!.enemies[0];
    for (const other of sim.arena!.enemies.slice(1)) sim.retireEnemy(other);
    enemy.body.setTranslation({ x: -30, y: 0.96, z: -8 }, true);
    enemy.ai!.rally = { x: -30, z: -8 };
    enemy.path = [];
    enemy.moveTarget = undefined;
    sim.world.step();
    let bracedFrames = 0;
    ticks(sim, 2, () => { if (enemy.braced) bracedFrames++; });
    expect(sim.arena!.enemyShots).toBeGreaterThan(0);
    if (wave < 3) expect(bracedFrames).toBe(0);
    else expect(bracedFrames).toBeGreaterThan(60);
  });
});
