import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FIREARMS, KINETIC, STEP, distance2, type Vec2 } from "../src/game/config";
import { Simulation, type Actor } from "../src/game/simulation";

function ticks(sim: Simulation, seconds: number, beforeStep?: () => void) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) {
    beforeStep?.();
    sim.step();
  }
}
function track(sim: Simulation, target: Actor) {
  const p = target.body.translation();
  sim.aim = { x: p.x, y: p.y + 0.25, z: p.z };
}

describe("kinetic combat and recovery", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create("arena");
    sim.arena!.countdown = 100;
    sim.select(1);
    sim.primary.body.setTranslation({ x: -30, y: 0.96, z: 12 }, true);
  });
  afterEach(() => sim.world.free());

  test("a tracked volley buys metres of ground while the hostile is still alive", () => {
    const enemy = sim.addEnemy("assault", { x: -30, z: -8 });
    const start = { ...enemy.body.translation() };
    sim.world.step();
    sim.setBrace(true);
    sim.trigger = true;
    ticks(sim, 0.8, () => track(sim, enemy));
    expect(sim.hits).toBeGreaterThanOrEqual(10);
    expect(enemy.hp).toBeGreaterThan(0);
    expect(start.z - enemy.body.translation().z).toBeGreaterThan(2);
    expect(Math.abs(enemy.body.translation().x - start.x)).toBeLessThan(0.2);
    expect(sim.isDisrupted(enemy)).toBe(false);

    // A second firing angle redirects pressure across the floor instead of
    // selecting a fixed east-west displacement or teleporting the target.
    sim.primary.body.setTranslation({ x: -42, y: 0.96, z: enemy.body.translation().z }, true);
    sim.world.step();
    const turn = { ...enemy.body.translation() };
    ticks(sim, 0.45, () => track(sim, enemy));
    expect(enemy.body.translation().x - turn.x).toBeGreaterThan(0.7);
    expect(enemy.dead).toBe(false);
  });

  test("bracing and chassis mass resist pressure without eliminating displacement", () => {
    const displacements: number[] = [];
    for (const [model, braced] of [["assault", false], ["assault", true], ["minigunner", false]] as const) {
      const enemy = sim.addEnemy(model, { x: -30, z: -8 });
      enemy.braced = braced;
      sim.world.step();
      const start = { ...enemy.body.translation() };
      sim.damage(enemy, FIREARMS.gun.damage, { x: 0, y: 0, z: -KINETIC.impulse.gun }, start, "gun");
      ticks(sim, 0.5);
      displacements.push(start.z - enemy.body.translation().z);
      sim.retireEnemy(enemy);
    }
    expect(displacements[0]).toBeGreaterThan(0.4);
    expect(displacements[1]).toBeGreaterThan(0.15);
    expect(displacements[0]).toBeGreaterThan(displacements[1] * 1.4);
    expect(displacements[0]).toBeGreaterThan(displacements[2] * 1.25);
  });

  test("walking orders survive a volley and recover after momentum decays", () => {
    const robot = sim.primary;
    const goal: Vec2 = { x: -30, z: 18 };
    sim.move(goal);
    ticks(sim, 0.3);
    const beforeHit = { ...robot.body.translation() };
    ticks(sim, 0.6, () => {
      if (Math.round(sim.time / STEP) % 4 === 0)
        sim.damage(robot, 1, { x: KINETIC.impulse.gun, y: 0, z: 0 }, robot.body.translation(), "gun");
    });
    expect(robot.body.translation().x - beforeHit.x).toBeGreaterThan(1.5);
    expect(robot.moveTarget).toEqual(goal);
    ticks(sim, 5);
    expect(robot.path).toHaveLength(0);
    expect(distance2(robot.body.translation(), goal)).toBeLessThan(0.15);
    expect(Math.hypot(robot.knockback.x, robot.knockback.z)).toBeLessThan(0.001);
  });

  test("repeated fire is bounded and a solid wall stops the slide", () => {
    const robot = sim.primary;
    robot.body.setTranslation({ x: -53, y: 0.96, z: 12 }, true);
    ticks(sim, 2, () => {
      sim.damage(robot, 0, { x: -KINETIC.impulse.gun, y: 0, z: 0 }, robot.body.translation(), "gun");
      expect(Math.hypot(robot.knockback.x, robot.knockback.z)).toBeLessThanOrEqual(KINETIC.maxSpeed + 1e-6);
    });
    expect(robot.body.translation().x).toBeGreaterThan(sim.layout.bounds.left);
    expect(robot.body.translation().x).toBeLessThan(-55);
    sim.move({ x: -48, z: 12 });
    ticks(sim, 5);
    expect(distance2(robot.body.translation(), robot.moveTarget!)).toBeLessThan(0.15);
  });

  test("the extended long-range apron has a physical floor and reachable destinations", () => {
    sim.reset("long");
    sim.select(1);
    const robot = sim.primary;
    robot.body.setTranslation({ x: 121, y: 0.96, z: 10 }, true);
    sim.move({ x: 124, z: 10 });
    ticks(sim, 3);
    expect(robot.path).toHaveLength(0);
    expect(distance2(robot.body.translation(), robot.moveTarget!)).toBeLessThan(0.15);
    expect(robot.body.translation().y).toBeGreaterThan(0.9);
    expect(robot.body.translation().y).toBeLessThan(1.1);
  });

  test("a moving practice target retains bounded impacts and recovers its lane", () => {
    sim.reset("proving");
    const target = sim.actors.find(a => a.kind === "moving")!;
    ticks(sim, 2, () => {
      if (Math.round(sim.time / STEP) % 4 === 0)
        sim.damage(target, 1, { x: 0, y: 0, z: -180 }, target.body.translation(), "gun");
      expect(Math.hypot(target.knockback.x, target.knockback.z)).toBeLessThanOrEqual(KINETIC.maxSpeed + 1e-6);
    });
    expect(target.body.translation().z).toBeLessThan(target.spawn.z - 1);
    expect(target.dead).toBe(false);
    ticks(sim, 5);
    expect(Math.abs(target.body.translation().z - target.spawn.z)).toBeLessThan(0.15);
    expect(Math.hypot(target.knockback.x, target.knockback.z)).toBeLessThan(0.001);
  });

  test("an AI machine gunner returns fire while consecutive hits keep it sliding", () => {
    sim.arena!.countdown = 0;
    sim.step();
    const enemy = sim.arena!.enemies[0];
    for (const other of sim.arena!.enemies.slice(1)) sim.retireEnemy(other);
    enemy.body.setTranslation({ x: -30, y: 0.96, z: -8 }, true);
    enemy.hp = enemy.maxHp = 1000;
    enemy.ai!.state = "aiming";
    enemy.ai!.target = sim.primary.id;
    enemy.ai!.nextAttack = sim.time + 0.2;
    enemy.path = [];
    enemy.moveTarget = undefined;
    sim.world.step();
    sim.setBrace(true);
    sim.trigger = true;
    let firingWhileSliding = false;
    ticks(sim, 2.5, () => {
      track(sim, enemy);
      if (enemy.firing && Math.hypot(enemy.body.linvel().x, enemy.body.linvel().z) > 1)
        firingWhileSliding = true;
    });
    expect(sim.hits).toBeGreaterThan(25);
    expect(sim.time - enemy.hitTime).toBeLessThan(0.15);
    expect(enemy.body.translation().z).toBeLessThan(-12);
    expect(sim.arena!.enemyShots).toBeGreaterThanOrEqual(5);
    expect(firingWhileSliding).toBe(true);
    expect(sim.primary.hp).toBeLessThan(sim.primary.maxHp);
    expect(sim.isDisrupted(enemy)).toBe(false);
  });
});
