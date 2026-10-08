import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PISTOL, STEP, distance2 } from "../src/game/config";
import { RECEIVING_GUARDS, RECEIVING_SITES } from "../src/game/receiving";
import { segmentClear } from "../src/game/navigation";
import { Simulation } from "../src/game/simulation";

const ticks = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
};
const noImpulse = { x: 0, y: 0, z: 0 };

describe("Receiving contract", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("receiving"); });
  afterEach(() => sim.world.free());
  const clearGuards = () => {
    for (const guard of sim.mission!.enemies)
      sim.damage(guard, guard.hp, noImpulse, guard.body.translation(), "pistol");
    sim.step();
  };
  const waitFor = (condition: () => boolean, timeout: number) => {
    for (let i = 0; i < timeout / STEP && !condition(); i++) sim.step();
    expect(condition()).toBe(true);
  };

  test.each(["sniper", "minigunner", "assault"] as const)("the briefing freezes combat and overrides the saved %s squad with four pistols", model => {
    sim.reset("receiving", model);
    expect(sim.mission!.phase).toBe("briefing");
    expect(sim.arena).toBeUndefined();
    expect([...sim.selected]).toEqual([1, 2, 3, 4]);
    expect(sim.squad.every(a => a.model === "assault" && a.weapon === "pistol" && a.pistol.ammo === 12)).toBe(true);
    for (const weapon of ["gun", "minigun", "rifle", "grenade"] as const) expect(sim.chooseWeapon(weapon)).toBe(false);
    expect(sim.throwGrenade({ x: 0, z: 0 })).toBe(false);
    sim.trigger = true;
    sim.shoot(sim.primary);
    ticks(sim, 5);
    expect(sim.time).toBe(0);
    expect(sim.shots).toBe(0);
    expect(sim.mission!.enemyShots).toBe(0);
    expect(sim.city!.porters.every(p => !!p.grip && p.transfers === 0)).toBe(true);
    expect(sim.fourthModel).toBe(model);
  });

  test("guards notice a nearby squad and fire real pistol shots without bracing or reinforcements", () => {
    sim.mission!.deploy();
    ticks(sim, 3);
    expect(sim.mission!.enemyShots).toBe(0);
    sim.move({ x: -9, z: 5 });
    ticks(sim, 5);
    expect(sim.mission!.enemyShots).toBeGreaterThan(0);
    expect(sim.squad.some(a => a.hp < a.maxHp)).toBe(true);
    expect(sim.actors.filter(a => a.kind === "enemy")).toHaveLength(4);
    expect(sim.mission!.enemies.every(a => !a.braced && a.weapons.length === 1 && a.weapon === "pistol")).toBe(true);
    expect(sim.events.filter(e => e.type === "shot").every(e => e.type === "shot" && e.weapon === "pistol")).toBe(true);
    expect(sim.shots).toBe(0);
    expect(sim.grenades).toHaveLength(0);
  });

  test("shooting a post alerts its unhurt partner at pistol range, while dispatch remains quiet", () => {
    sim.mission!.deploy(); sim.select(1); sim.setBrace(true);
    const [guard, partner, ...dispatch] = sim.mission!.enemies;
    sim.aim = { ...guard.body.translation(), y: 1.25 }; sim.trigger = true; sim.step(); sim.trigger = false;
    expect(guard.hp).toBe(110); expect(partner.hp).toBe(132);
    ticks(sim, 1.5);
    expect(partner.ai!.target).not.toBeNull();
    expect(sim.events.some(e => e.type === "shot" && e.actor === partner.id)).toBe(true);
    expect(dispatch.every(a => a.ai!.target === null && a.pistol.ammo === PISTOL.magazine)).toBe(true);
  });

  test.each([1, 4])("a %i-robot walk-up and concentrated fire approach has a meaningful squad advantage", members => {
    sim.mission!.deploy(); sim.select(members === 4 ? 5 : 1);
    const fight = (seconds: number) => {
      sim.setBrace(true);
      for (let i = 0; i < seconds / STEP && sim.active.length; i++) {
        const nearby = sim.mission!.enemies.filter(g => distance2(g.body.translation(), sim.primary.body.translation()) < PISTOL.range)
          .sort((a, b) => distance2(a.body.translation(), sim.primary.body.translation()) - distance2(b.body.translation(), sim.primary.body.translation()));
        sim.trigger = !!nearby[0];
        if (nearby[0]) sim.aim = { ...nearby[0].body.translation(), y: nearby[0].body.translation().y + .25 };
        sim.step();
      }
      sim.release();
    };
    sim.move({ x: -9, z: 5 }); ticks(sim, 4); fight(8);
    if (members === 1) {
      expect(sim.squad[0].dead).toBe(true); expect(sim.mission!.enemies.length).toBeGreaterThanOrEqual(3);
    } else {
      sim.move({ x: 11, z: 1 }); ticks(sim, 5); fight(10);
      expect(sim.mission!.phase).toBe("dispatch");
      expect(sim.squad.every(a => !a.dead)).toBe(true);
      expect(sim.squad.some(a => a.hp < a.maxHp)).toBe(true);
    }
  }, 15000);

  test("selected pistols use real damage, independent magazines and friendly-safe fire", () => {
    sim.mission!.deploy();
    const guard = sim.mission!.enemies[0];
    sim.aim = { ...guard.body.translation(), y: 1.25 };
    sim.setBrace(true);
    sim.trigger = true;
    sim.step();
    expect(guard.dead).toBe(false);
    expect(guard.hp).toBe(132 - 4 * PISTOL.damage);
    expect(sim.squad.every(a => a.pistol.ammo === PISTOL.magazine - 1 && a.ammo === 0)).toBe(true);
    expect(sim.shots).toBe(4);
    expect(sim.squad.every(a => a.hp === a.maxHp)).toBe(true);
    ticks(sim, PISTOL.interval + STEP);
    expect(guard.dead).toBe(true);
    expect(guard.killedBy).toBe("pistol");
    expect(sim.shots).toBe(8);
    sim.trigger = false;
    sim.reloadSelected();
    ticks(sim, PISTOL.reload + STEP);
    expect(sim.squad.every(a => a.pistol.ammo === PISTOL.magazine)).toBe(true);
  });

  test("real pistol wrecks do not strand a squad member crossing the yard", () => {
    sim.mission!.deploy(); sim.setBrace(true);
    for (const id of [100, 101]) {
      const guard = sim.actors.find(a => a.id === id)!;
      sim.trigger = true;
      for (let i = 0; i < 2 / STEP && !guard.dead; i++) {
        sim.aim = { ...guard.body.translation(), y: guard.body.translation().y + .25 }; sim.step();
      }
      sim.trigger = false;
      expect(guard.dead).toBe(true);
    }
    clearGuards(); sim.release(); sim.select(5); sim.move({ x: 11, z: 1 });
    ticks(sim, 12);
    for (const a of sim.squad) expect(distance2(a.body.translation(), a.moveTarget!)).toBeLessThan(.15);
  }, 15000);

  test("dispatch requires clearing the yard and uninterrupted physical presence", () => {
    sim.mission!.deploy();
    const robot = sim.squad[0];
    robot.body.setTranslation({ ...RECEIVING_SITES.dispatch, y: 0.98 }, true);
    ticks(sim, 2.1);
    expect(sim.mission!.phase).toBe("yard");
    expect(sim.mission!.releaseProgress).toBe(0);
    clearGuards();
    expect(sim.mission!.phase).toBe("dispatch");
    ticks(sim, 0.7);
    expect(sim.mission!.releaseProgress).toBeGreaterThan(0);
    robot.body.setTranslation({ x: 12, y: 0.98, z: 5 }, true);
    sim.step();
    expect(sim.mission!.releaseProgress).toBe(0);
    expect(sim.mission!.cargoReleased).toBe(false);
  });

  test("the whole squad can walk through the authored yard, release real cargo work and extract", () => {
    sim.mission!.deploy();
    ticks(sim, 1);
    const porters = sim.city!.porters, held = porters.map(p => ({ ...p.body.translation() }));
    expect(porters.every(p => p.grip && p.transfers === 0)).toBe(true);
    const survivor = sim.squad[0];
    sim.damage(survivor, 22, noImpulse, survivor.body.translation(), "pistol");
    survivor.pistol.ammo = 6;
    clearGuards();
    expect(survivor.hp).toBe(survivor.maxHp - 22);
    expect(survivor.pistol.ammo).toBe(6);
    sim.move(RECEIVING_SITES.dispatch);
    waitFor(() => sim.mission!.phase === "return", 25);
    expect(sim.squad.every(a => distance2(a.body.translation(), RECEIVING_SITES.dispatch) < 3)).toBe(true);
    expect(porters.every((p, i) => distance2(p.body.translation(), held[i]) < 0.3 && p.transfers === 0)).toBe(true);
    waitFor(() => porters.some(p => p.transfers > 0), 25);
    expect(porters.some(p => p.distance > 10)).toBe(true);
    sim.move(RECEIVING_SITES.return);
    waitFor(() => sim.mission!.phase === "complete", 25);
    expect(sim.mission!.inspect().survivors).toBe(4);
    expect(survivor.hp).toBe(survivor.maxHp - 22);
    const time = sim.time;
    sim.trigger = true;
    sim.move({ x: 0, z: 0 });
    ticks(sim, 2);
    expect(sim.time).toBe(time);
    expect(sim.squad.every(a => !a.path.length && !a.firing)).toBe(true);
  }, 15000);

  test("one robot cannot extract an incomplete squad; disabled members do not block recovery", () => {
    sim.mission!.deploy();
    clearGuards();
    for (const a of sim.squad) a.body.setTranslation({ x: 21 + (a.id % 2) * 1.2, y: 0.98, z: 4 + Math.floor(a.id / 3) * 1.2 }, true);
    ticks(sim, 2.2);
    expect(sim.mission!.phase).toBe("return");
    sim.squad[0].body.setTranslation({ ...RECEIVING_SITES.return, y: 0.98 }, true);
    ticks(sim, 1.2);
    expect(sim.mission!.phase).toBe("return");
    for (const a of sim.squad.slice(1)) sim.damage(a, a.hp, noImpulse, a.body.translation(), "pistol");
    ticks(sim, 1.2);
    expect(sim.mission!.phase).toBe("complete");
    expect(sim.mission!.inspect().survivors).toBe(1);
  });

  test("losing the squad after cargo release fails the contract; restart restores the briefing and workers", () => {
    sim.mission!.deploy(); clearGuards();
    sim.squad[0].body.setTranslation({ ...RECEIVING_SITES.dispatch, y: 0.98 }, true);
    ticks(sim, 2.2);
    for (const a of sim.squad) sim.damage(a, a.hp, noImpulse, a.body.translation(), "pistol");
    sim.step();
    expect(sim.mission!.phase).toBe("failed");
    expect(sim.mission!.cargoReleased).toBe(true);
    expect(sim.mission!.objective).toBe(2);
    expect(sim.closeWeapon).toBe("pistol");
    const time = sim.time; ticks(sim, 5);
    expect(sim.time).toBe(time);
    sim.reset();
    expect(sim.mission!.phase).toBe("briefing");
    expect(sim.mission!.enemies).toHaveLength(4);
    expect(sim.squad.every(a => !a.dead && a.pistol.ammo === 12)).toBe(true);
    expect(sim.city!.porters.every(p => p.grip && p.transfers === 0)).toBe(true);
  });

  test("debug floors retain their configurations and never inherit a mission or cargo hold", () => {
    sim.reset("receiving", "minigunner");
    sim.reset("proving");
    expect(sim.mission).toBeUndefined();
    expect(sim.squad[1].model).toBe("minigunner");
    expect(sim.squad[3].model).toBe("minigunner");
    expect(sim.chooseWeapon("minigun")).toBe(false); // ANCHOR is initially selected.
    sim.select(5); expect(sim.chooseWeapon("minigun")).toBe(true);
    sim.reset("long"); expect(sim.layout.targets).toHaveLength(3);
    sim.reset("arena"); expect(sim.arena!.phase).toBe("incoming");
    sim.reset("city"); expect(sim.city!.district.buildings.length).toBeGreaterThan(10);
    sim.reset("port"); ticks(sim, 3);
    expect(sim.mission).toBeUndefined();
    expect(sim.city!.porters.some(p => p.distance > 0.5)).toBe(true);
  });

  test("spawns, cargo routes and dispatch/return formation centres are unobstructed", () => {
    for (const p of [...sim.layout.players, ...RECEIVING_GUARDS, RECEIVING_SITES.dispatch, RECEIVING_SITES.return])
      expect(segmentClear(p, p, sim.layout.barriers, 0.55), `${p.x}, ${p.z}`).toBe(true);
    for (const worker of sim.city!.porters)
      for (const [i, p] of worker.route.points.entries())
        expect(segmentClear(p, worker.route.points[(i + 1) % worker.route.points.length], sim.layout.barriers, 0.28)).toBe(true);
  });
});
