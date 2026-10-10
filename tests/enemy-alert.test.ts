import { afterEach, describe, expect, test } from "vitest";
import { FIREARMS, STEP, distance2 } from "../src/game/config";
import { updateEnemy } from "../src/game/enemies";
import { PriorityMission } from "../src/game/priority-mission";
import { Simulation } from "../src/game/simulation";

const ticks = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
};

describe("enemy contact reports", () => {
  let sim: Simulation;
  afterEach(() => sim?.world.free());

  test.each(["sniper", "minigunner"] as const)("a real %s hit alerts every active defender, including on a lethal shot", async model => {
    sim = await Simulation.create("priority", model); sim.mission!.deploy();
    sim.select(4); sim.setBrace(true); ticks(sim, .7);
    const mission = sim.mission as PriorityMission, shooter = sim.primary;
    const victim = mission.guards[0], observer = mission.guards[3];
    const origin = sim.walkingPoint(shooter);
    expect(distance2(observer.body.translation(), origin)).toBeGreaterThan(28);
    expect(mission.guards.every(a => a.ai!.state === "holding" && !a.ai!.alertPosition)).toBe(true);
    victim.hp = FIREARMS[shooter.weapon].damage;
    shooter.spin = 1;
    const p = victim.body.translation(); sim.aim = { x: p.x, y: p.y + .25, z: p.z };
    sim.shoot(shooter);
    expect(victim.dead).toBe(true);
    expect(mission.guards).toHaveLength(5);
    expect(mission.guards.every(a => a.ai!.alertPosition && distance2(a.ai!.alertPosition, origin) < .01)).toBe(true);
    ticks(sim, 1.5);
    expect(mission.guards.every(a => a.ai!.state !== "holding")).toBe(true);
    expect(observer.path.length).toBeGreaterThan(0);
    expect(distance2(observer.moveTarget!, origin)).toBeLessThan(1);
    // Contact memory must not silently follow subsequent player movement.
    shooter.body.setTranslation({ x: origin.x - 8, y: .93, z: origin.z + 5 }, true);
    expect(distance2(observer.ai!.alertPosition!, origin)).toBeLessThan(.01);
  }, 15_000);

  test("missed rifle shots leave the perimeter unaware", async () => {
    sim = await Simulation.create("priority"); sim.mission!.deploy();
    sim.select(4); sim.setBrace(true); ticks(sim, .7);
    sim.aim = { x: -70, y: 8, z: 16 }; sim.shoot(sim.primary); ticks(sim, .5);
    const guards = (sim.mission as PriorityMission).guards;
    expect(guards.every(a => !a.ai!.alertPosition && a.ai!.state === "holding")).toBe(true);
  });

  test("alerted defenders can leave their post to engage but still need line of sight and pistol range", async () => {
    sim = await Simulation.create("priority"); sim.mission!.deploy();
    const guard = (sim.mission as PriorityMission).guards[0], shooter = sim.squad[0];
    guard.ai!.alertPosition = sim.walkingPoint(shooter);
    const profile = { brace: false, grenades: false, automaticBurst: .06, attackInterval: 2.2,
      noticeRange: 100, leash: 1, reactionTime: 1.1, pistolRange: 22 };
    updateEnemy(sim, guard, [shooter], profile);
    expect(guard.ai!.fire).toBe(false); expect(guard.ai!.state).toBe("advancing");
    expect(distance2(guard.moveTarget!, guard.ai!.rally)).toBeGreaterThan(1);
    expect(guard.path.length).toBeGreaterThan(0);
  });
});
