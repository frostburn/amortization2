import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { STEP, distance2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";

const zero = { x: 0, y: 0, z: 0 };
const ticks = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds / STEP; i++) sim.step(); };
describe("persistent covering orders", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create("arena"); sim.arena!.countdown = 100;
    sim.squad.forEach((a, i) => a.body.setTranslation({ x: -7 + i * 2, y: .98, z: 10 }, true));
    sim.world.step();
  });
  afterEach(() => sim.world.free());

  test("a direction order survives selection and release, fires only in its sector, and reloads", () => {
    sim.select(1); const robot = sim.primary, p = { ...robot.body.translation() };
    robot.ammo = 1;
    const ahead = sim.addEnemy("assault", { x: -7, z: -10 }); ahead.hp = ahead.maxHp = 10000;
    const behind = sim.addEnemy("assault", { x: -7, z: 24 });
    sim.world.step(); sim.coverSector({ x: -7, z: -15 }); sim.select(2); sim.release();
    ticks(sim, 4);
    expect(robot.cover?.mode).toBe("sector"); expect(robot.braced).toBe(true);
    expect(robot.cover?.target).toBe(ahead.id); expect(ahead.hp).toBeLessThan(ahead.maxHp);
    expect(behind.hp).toBe(behind.maxHp); expect(sim.coverShots).toBeGreaterThan(1);
    expect(robot.ammo).toBeGreaterThan(0); expect(robot.reload).toBe(0);
    expect(distance2(robot.body.translation(), p)).toBeLessThan(.1);
    expect(sim.trigger).toBe(false);
  });

  test("manual fire overrides the sector temporarily; move and ceasefire replace only selected orders", () => {
    const ahead = sim.addEnemy("assault", { x: -7, z: -10 }); ahead.hp = ahead.maxHp = 10000;
    const behind = sim.addEnemy("assault", { x: -7, z: 24 }); behind.hp = behind.maxHp = 10000;
    sim.world.step(); sim.selectGroup([1, 2]); sim.coverSector({ x: -7, z: -15 });
    sim.select(1); sim.aim = { ...behind.body.translation(), y: 1.25 }; sim.trigger = true;
    ticks(sim, .6); sim.trigger = false; ticks(sim, .8);
    expect(behind.hp).toBeLessThan(behind.maxHp); expect(ahead.hp).toBeLessThan(ahead.maxHp);
    expect(sim.shots).toBeGreaterThan(0); expect(sim.coverShots).toBeGreaterThan(0);
    sim.move({ x: -10, z: 10 });
    expect(sim.squad[0].cover).toBeUndefined(); expect(sim.squad[1].cover?.mode).toBe("sector");
    sim.select(2); sim.ceasefire(); ticks(sim, .2);
    expect(sim.squad[1].cover).toBeUndefined(); expect(sim.squad[1].firing).toBe(false);
    expect(sim.squad[1].braced).toBe(false);
  });

  test("explicit sector orders survive entering and leaving the sniper scope", () => {
    sim.select(1); sim.coverSector({ x: -7, z: -15 });
    sim.select(4); sim.chooseWeapon("rifle"); sim.toggleSniping();
    expect(sim.squad[0].cover?.mode).toBe("sector");
    expect(sim.squad[1].cover?.mode).toBe("scope");
    sim.endSniping();
    expect(sim.squad[0].cover?.mode).toBe("sector"); expect(sim.squad[0].braced).toBe(true);
    expect(sim.squad[1].cover).toBeUndefined(); expect(sim.squad[2].cover).toBeUndefined();
  });

  test("a whole-squad selection keeps support firing while NEEDLE's rifle trigger is held", () => {
    const enemy = sim.addEnemy("assault", { x: -7, z: -10 }); enemy.hp = enemy.maxHp = 10000;
    sim.world.step(); sim.select(5); sim.chooseWeapon("rifle"); sim.toggleSniping();
    sim.aim = { x: 35, y: 1.25, z: -10 }; sim.trigger = true;
    ticks(sim, 1.2);
    expect(sim.coverHits).toBeGreaterThan(0);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(sim.squad[0].cover?.target).toBe(enemy.id);
  });

  test("cover is interrupted by a real stagger and returns after braced recovery", () => {
    const enemy = sim.addEnemy("assault", { x: -7, z: -10 }); enemy.hp = enemy.maxHp = 10000;
    sim.world.step(); sim.select(1); sim.coverSector({ x: -7, z: -15 });
    sim.damage(sim.primary, 22, zero, sim.primary.body.translation(), "pistol");
    sim.step(); expect(sim.primary.cover!.state).toBe("suppressed"); expect(sim.primary.firing).toBe(false);
    ticks(sim, .8); expect(sim.coverHits).toBeGreaterThan(0); expect(sim.primary.dead).toBe(false);
  });

  test("cover holds fire when a civilian blocks an acquired firing lane", () => {
    sim.reset("port");
    const shooter = sim.squad[0]; shooter.body.setTranslation({ x: -7, y: .98, z: 0 }, true);
    const enemy = sim.addEnemy("assault", { x: 19, z: 0 }); enemy.hp = enemy.maxHp = 10000;
    const worker = sim.city!.porters[0]; sim.city!.workers.release(worker);
    worker.body.setTranslation({ x: 6, y: .98, z: 5 }, true);
    sim.world.step(); sim.select(1); sim.coverSector({ x: 19, z: 0 });
    ticks(sim, .5);
    expect(sim.coverHits).toBeGreaterThan(0);
    const health = worker.hp, shots = sim.coverShots;
    worker.body.setTranslation({ x: 6, y: .98, z: 0 }, true);
    sim.world.step(); sim.primary.shotWait = 0;
    sim.primary.cover!.fire = true;
    sim.shoot(shooter);
    expect(sim.coverShots).toBe(shots); expect(worker.hp).toBe(health);
  });
});
