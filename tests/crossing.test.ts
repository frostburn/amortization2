import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PISTOL, STEP, distance2 } from "../src/game/config";
import { CROSSING_BRIDGE, CROSSING_SITES } from "../src/game/crossing";
import { Simulation } from "../src/game/simulation";
import { segmentClear } from "../src/game/navigation";

const zero = { x: 0, y: 0, z: 0 };
const ticks = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
};
describe("Crossing contract", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("crossing"); });
  afterEach(() => sim.world.free());
  const waitFor = (condition: () => boolean, seconds: number) => {
    for (let i = 0; i < seconds / STEP && !condition() && !sim.mission!.finished; i++) sim.step();
    expect(condition(), JSON.stringify({ mission: sim.mission!.inspect(), coverShots: sim.coverShots, coverHits: sim.coverHits, actors: sim.inspect().actors })).toBe(true);
  };
  const clearGuards = () => {
    for (const guard of sim.mission!.enemies) sim.damage(guard, guard.hp, zero, guard.body.translation(), "pistol");
  };

  test("briefing freezes a fixed pistol squad and the canal has no hidden walking floor", () => {
    sim.reset("crossing", "minigunner");
    ticks(sim, 3);
    expect(sim.time).toBe(0);
    expect(sim.squad.every(a => a.model === "assault" && a.weapons.length === 1 && a.weapon === "pistol")).toBe(true);
    expect(sim.chooseWeapon("minigun")).toBe(false);
    expect(sim.chooseWeapon("grenade")).toBe(false);
    expect(sim.mission!.enemies.every(a => !a.braced && a.pistol.ammo === PISTOL.magazine)).toBe(true);
    expect(sim.ray({ x: 0, y: 3, z: 6 }, { x: 0, y: -4, z: 6 })!.timeOfImpact).toBeGreaterThan(6);
    expect(sim.ray({ x: 0, y: 3, z: 0 }, { x: 0, y: -4, z: 0 })!.timeOfImpact).toBeCloseTo(3, 2);
    expect(segmentClear({ x: -12, z: 6 }, { x: 12, z: 6 }, sim.layout.barriers)).toBe(false);
    expect(segmentClear({ x: -12, z: 0 }, { x: 12, z: 0 }, sim.layout.barriers)).toBe(true);
  });

  test("reusable building lots, spawns and continuing traffic roads clear each other", () => {
    for (const point of [...sim.layout.players, ...sim.mission!.enemies.map(a => a.spawn), CROSSING_SITES.exit])
      expect(segmentClear(point, point, sim.layout.barriers, .55)).toBe(true);
    for (const street of sim.layout.city!.streets) {
      const w = street.width / 2 + street.sidewalk;
      for (const b of sim.layout.barriers.filter(b => b.building))
        expect(Math.abs(b.x - street.at) >= b.w / 2 + w || Math.abs(b.z - street.center) >= b.d / 2 + street.length / 2,
          `${b.building} blocks the road`).toBe(true);
    }
  });

  test("the defenders wait beyond west-bank pistol reach and cannot be picked off before crossing", () => {
    sim.mission!.deploy(); sim.select(1);
    sim.primary.body.setTranslation({ x: -8.2, y: .98, z: 0 }, true);
    sim.setBrace(true);
    for (const guard of sim.mission!.enemies) {
      sim.aim = { ...guard.body.translation(), y: 1.25 }; sim.trigger = true;
      ticks(sim, 3); sim.trigger = false; sim.reloadSelected(); ticks(sim, PISTOL.reload + STEP);
      expect(guard.hp).toBe(guard.maxHp);
    }
    expect(sim.shots).toBeGreaterThan(12);
    expect(sim.mission!.enemyShots).toBe(0);
    expect(sim.mission!.inspect().defending).toBe(false);
    expect(sim.mission!.enemies.every(a => distance2(a.body.translation(), a.spawn) < .15)).toBe(true);
    sim.select(4); sim.move({ x: 11, z: 0 });
    expect(sim.mission!.inspect().defending).toBe(false);
    sim.move({ x: -22, z: 4 }); ticks(sim, 2);
    expect(sim.mission!.inspect().defending).toBe(false);
  }, 15000);

  test("first physical bridge entry commits the defenders to their nearer firing posts", () => {
    sim.mission!.deploy(); sim.select(4); sim.move({ x: 11, z: 0 });
    waitFor(() => sim.mission!.inspect().defending === true, 8);
    expect(sim.mission!.bridge!.onDeck(sim.primary.body.translation())).toBe(true);
    expect(sim.mission!.enemies.every(a => a.ai!.state === "entering" && a.path.length > 0)).toBe(true);
    sim.move({ x: -22, z: 4 }); ticks(sim, 2);
    expect(sim.mission!.inspect().defending).toBe(true);
    expect(sim.mission!.enemies.every(a => a.body.translation().x < a.spawn.x - 3)).toBe(true);
    expect(sim.mission!.alarmAt).toBeUndefined();
  }, 15000);

  test("the bank guards overpower a robot sent across without covering fire", () => {
    sim.mission!.deploy(); sim.select(4); sim.move({ x: 11, z: 0 });
    ticks(sim, 12);
    expect(sim.squad[3].dead).toBe(true);
    expect(sim.mission!.enemies).toHaveLength(3);
    expect(sim.coverShots).toBe(0);
    expect(sim.mission!.enemyShots).toBeGreaterThanOrEqual(8);
    expect(sim.mission!.alarmAt).toBeUndefined();
  }, 15000);

  test("a group crossing queues on dry land, admits one hull, and restores its final formation", () => {
    sim.mission!.deploy(); clearGuards(); sim.select(5); sim.move({ x: 13, z: 0 });
    expect(sim.mission!.bridge!.inspect().queue).toHaveLength(4);
    const destinations = sim.squad.map(a => ({ ...a.moveTarget! }));
    let maxLoad = 0;
    for (let i = 0; i < 28 / STEP && !sim.squad.every(a => distance2(a.body.translation(), a.moveTarget!) < .15); i++) {
      sim.step(); maxLoad = Math.max(maxLoad, sim.mission!.bridge!.load);
      // Isolate the bridge/order test from the separately-tested pursuit fight.
      if (sim.mission!.alarmAt !== undefined) clearGuards();
    }
    expect(maxLoad).toBeGreaterThan(80);
    expect(maxLoad).toBeLessThanOrEqual(CROSSING_BRIDGE.capacity);
    expect(sim.squad.every(a => !a.dead && distance2(a.body.translation(), a.moveTarget!) < .15), JSON.stringify(sim.inspect())).toBe(true);
    expect(sim.squad.map(a => a.moveTarget)).toEqual(destinations);
    expect(sim.mission!.bridge!.inspect().queue).toHaveLength(0);
    expect(sim.mission!.phase).toBe("withdraw");
    expect(sim.mission!.bridge!.collapsed).toBe(false);
  }, 20000);

  test("real hull weight buckles the deck, removes its collider, and fails a stranded crossing", () => {
    sim.mission!.deploy(); clearGuards();
    sim.squad.slice(0, 2).forEach((a, i) => a.body.setTranslation({ x: i * 2 - 1, y: .98, z: 0 }, true));
    sim.world.step(); ticks(sim, CROSSING_BRIDGE.overloadSeconds + STEP);
    expect(sim.mission!.bridge!.collapsed).toBe(true);
    expect(sim.mission!.bridge!.load).toBeGreaterThan(CROSSING_BRIDGE.capacity);
    expect(sim.ray({ x: 3, y: 3, z: 0 }, { x: 3, y: -4, z: 0 })!.timeOfImpact).toBeGreaterThan(6);
    expect(sim.mission!.phase).toBe("failed");
    expect(sim.events.filter(e => e.type === "bridge" && e.phase === "collapse")).toHaveLength(1);
  });

  test("a settled disabled chassis on the deck requests recovery instead of hanging the movement queue", () => {
    sim.mission!.deploy(); clearGuards();
    const casualty = sim.squad[0]; casualty.body.setTranslation({ x: 0, y: .98, z: 0 }, true);
    sim.damage(casualty, casualty.hp, zero, casualty.body.translation(), "pistol");
    sim.selectGroup([2, 3, 4]); sim.move({ x: 13, z: 0 });
    waitFor(() => sim.mission!.finished, 8);
    expect(sim.mission!.phase).toBe("failed");
    expect(sim.mission!.failureReason).toContain("blocking the bridge");
    expect(sim.mission!.bridge!.collapsed).toBe(false);
    expect(sim.squad.slice(1).every(a => !a.dead && !a.path.length)).toBe(true);
  }, 15000);

  test("the last physical entry triggers exactly one alarm and a finite near-bank pursuit", () => {
    sim.mission!.deploy(); clearGuards();
    sim.squad.slice(0, 3).forEach((a, i) => a.body.setTranslation({ x: 11 + i * 2, y: .98, z: -3 }, true));
    sim.step();
    sim.select(4); sim.move({ x: 12, z: 3 });
    expect(sim.mission!.alarmAt).toBeUndefined();
    waitFor(() => sim.mission!.alarmAt !== undefined, 8);
    const alarm = sim.mission!.alarmAt;
    expect(sim.mission!.bridge!.onDeck(sim.squad[3].body.translation())).toBe(true);
    ticks(sim, 1.0);
    expect(sim.mission!.inspect().pursuers).toBe(3);
    expect(sim.events.filter(e => e.type === "bridge" && e.phase === "alarm")).toHaveLength(1);
    ticks(sim, 1.0);
    expect(sim.mission!.alarmAt).toBe(alarm);
    expect(sim.mission!.inspect().pursuers).toBe(3);
    expect(sim.mission!.enemies.every(a => a.ai!.gate === "WEST BANK" && a.weapon === "pistol" && !a.braced)).toBe(true);
    expect(sim.mission!.phase).not.toBe("complete");
  }, 15000);

  test("failing to turn cover back exposes the final crossing to real pursuit fire", () => {
    sim.mission!.deploy(); clearGuards();
    sim.squad.slice(0, 3).forEach((a, i) => a.body.setTranslation({ x: 11 + i * 2, y: .98, z: -4 }, true));
    sim.step(); sim.select(4); sim.move({ x: 13, z: 3 });
    waitFor(() => sim.mission!.alarmAt !== undefined, 8);
    ticks(sim, 8);
    expect(sim.mission!.enemyShots).toBeGreaterThan(0);
    expect(sim.squad[3].dead).toBe(true);
    expect(sim.coverShots).toBe(0);
    expect(sim.mission!.inspect().pursuers).toBe(3);
  }, 15000);

  test("a sole survivor still trips the pursuit alarm on physical entry", () => {
    sim.mission!.deploy(); clearGuards();
    for (const a of sim.squad.slice(0, 3)) sim.damage(a, a.hp, zero, a.body.translation(), "pistol");
    sim.step(); sim.select(4); sim.move({ x: 13, z: 3 });
    expect(sim.mission!.inspect().survivors).toBe(1);
    expect(sim.mission!.inspect().crossed).toEqual([]);
    expect(sim.mission!.alarmAt).toBeUndefined();
    waitFor(() => sim.mission!.alarmAt !== undefined, 8);
    expect(sim.mission!.bridge!.onDeck(sim.squad[3].body.translation())).toBe(true);
    const alarm = sim.mission!.alarmAt;
    ticks(sim, 2);
    expect(sim.mission!.alarmAt).toBe(alarm);
    expect(sim.mission!.inspect().pursuers).toBe(3);
    expect(sim.events.filter(e => e.type === "bridge" && e.phase === "alarm")).toHaveLength(1);
  }, 15000);

  test("steering updates and a queued follow-up retain the bridge reservation and waypoints", () => {
    sim.mission!.deploy(); clearGuards(); sim.select(1); sim.move({ x: 13, z: -3 });
    waitFor(() => sim.mission!.bridge!.onDeck(sim.primary.body.translation()), 8);
    for (let i = 0; i < 120; i++) {
      if (i % 6 === 0) sim.move({ x: 13 + i / 120, z: -3 });
      sim.step();
      expect(sim.mission!.bridge!.inspect().admitted).toBe(1);
    }
    sim.move({ x: 18, z: 6 }, true);
    expect(sim.primary.moveTarget).toEqual({ x: 18, z: 6 });
    waitFor(() => distance2(sim.primary.body.translation(), { x: 18, z: 6 }) < .15, 10);
    expect(sim.primary.dead).toBe(false);
    expect(sim.mission!.bridge!.collapsed).toBe(false);
    expect(sim.mission!.bridge!.inspect().queue).toHaveLength(0);
  }, 15000);

  test("cover from both banks allows all four pistols to cross and withdraw without refits", () => {
    sim.mission!.deploy();
    sim.selectGroup([1, 2, 3]); sim.move({ x: -12, z: -4 });
    waitFor(() => sim.squad.slice(0, 3).every(a => !a.dead && distance2(a.body.translation(), a.moveTarget!) < .2), 8);
    sim.coverSector({ x: 15, z: 0 });
    sim.select(4); sim.move({ x: 10, z: 0 });
    waitFor(() => distance2(sim.squad[3].body.translation(), sim.squad[3].moveTarget!) < .15, 14);
    sim.coverSector({ x: -15, z: 0 });
    expect(sim.squad.every(a => !a.dead), JSON.stringify(sim.inspect())).toBe(true);
    // Bring the damaged covering chassis over before releasing the last guard.
    for (const id of [3, 1, 2]) {
      sim.select(id); sim.move({ x: 10 + id, z: (id - 2) * 2.5 });
      waitFor(() => distance2(sim.squad[id - 1].body.translation(), sim.squad[id - 1].moveTarget!) < .15, 12);
      sim.coverSector({ x: -15, z: 0 });
    }
    expect(sim.mission!.alarmAt).toBeDefined();
    expect(sim.squad.every(a => !a.dead), JSON.stringify(sim.inspect())).toBe(true);
    expect(sim.coverShots).toBeGreaterThan(0);
    expect(sim.coverHits).toBeGreaterThan(0);
    expect(sim.squad.some(a => a.hp < a.maxHp)).toBe(true);
    sim.select(5); sim.move(CROSSING_SITES.exit);
    waitFor(() => sim.mission!.phase === "complete", 12);
    expect(sim.mission!.inspect().survivors).toBe(4);
    expect(sim.squad.every(a => !a.cover && !a.firing)).toBe(true);
  }, 25000);
});
