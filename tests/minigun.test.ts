import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { MINIGUN, FIREARMS, STEP } from "../src/game/config";
import { Simulation } from "../src/game/simulation";
import { readFileSync } from "node:fs";

const ticks = (sim: Simulation, count: number) => {
  for (let i = 0; i < count; i++) sim.step();
};
const rounds = (sim: Simulation, id = 4) => sim.events.filter((e) => e.type === "shot" && e.actor === id);

describe("miniguns and squad configuration", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create("proving", "minigunner");
    sim.select(4);
    sim.aim = { x: 4, y: 2, z: -15 };
    sim.setBrace(true);
    ticks(sim, 20);
  });
  afterEach(() => sim.world.free());

  test("loadout persists across ranges and resets, and assault adds a fourth grenadier", () => {
    expect(sim.primary.model).toBe("minigunner");
    expect(sim.primary.maxHp).toBe(200);
    expect(sim.primary.body.mass()).toBeCloseTo(130);
    expect(sim.canUse("minigun")).toBe(true);
    expect(sim.canUse("rifle")).toBe(false);
    expect(sim.canUse("grenade")).toBe(false);
    for (const range of ["proving", "long", "arena"] as const) {
      sim.reset(range);
      expect(sim.squad.map((a) => a.model)).toEqual(["assault", "minigunner", "assault", "minigunner"]);
      sim.select(2);
      expect(sim.primary.weapon).toBe("minigun");
      expect(sim.primary.maxHp).toBe(200);
      expect(sim.primary.body.mass()).toBeCloseTo(130);
      expect(sim.canUse("grenade")).toBe(false);
      expect(sim.canUse("rifle")).toBe(false);
      sim.reset();
      expect(sim.squad[1].model).toBe("minigunner");
    }
    expect(sim.fourthModel).toBe("minigunner");
    expect(sim.active).toHaveLength(4);
    sim.reset("proving", "assault");
    expect(sim.squad.every((a) => a.model === "assault")).toBe(true);
    sim.select(4);
    expect(sim.primary.weapon).toBe("gun");
    expect(sim.primary.maxHp).toBe(160);
    expect(sim.grenadeThrower?.id).toBe(4);
    sim.reset("long", "sniper");
    expect(sim.squad.map((a) => a.model)).toEqual(["assault", "assault", "assault", "sniper"]);
    expect(sim.weapon).toBe("rifle");
    expect(sim.toggleSniping()).toBe(true);
    sim.reset("long", "minigunner");
    expect(sim.sniping).toBe(false);
    expect(sim.toggleSniping()).toBe(false);
  });

  test("cold wind-up consumes no rounds and cannot be bypassed by shooting directly", () => {
    sim.shoot(sim.primary);
    expect(sim.primary.ammo).toBe(MINIGUN.magazine);
    sim.trigger = true;
    ticks(sim, 29);
    expect(sim.primary.spin).toBeLessThan(1);
    expect(sim.primary.spooling).toBe(true);
    expect(sim.primary.firing).toBe(false);
    expect(rounds(sim)).toHaveLength(0);
    expect(sim.primary.ammo).toBe(MINIGUN.magazine);
    ticks(sim, 1);
    expect(sim.primary.spin).toBe(1);
    expect(rounds(sim)).toHaveLength(1);
    ticks(sim, 60);
    expect(rounds(sim)).toHaveLength(31);
    expect(sim.primary.ammo).toBe(MINIGUN.magazine - 31);
    expect(rounds(sim).every((e) => e.type === "shot" && e.weapon === "minigun")).toBe(true);
  });

  test("release stops bullets at once; retained rotation shortens the next wind-up", () => {
    sim.trigger = true;
    ticks(sim, 42);
    const fired = rounds(sim).length;
    sim.trigger = false;
    ticks(sim, 6);
    expect(rounds(sim)).toHaveLength(fired);
    expect(sim.primary.firing).toBe(false);
    expect(sim.primary.spin).toBeGreaterThan(0.8);
    sim.trigger = true;
    ticks(sim, 6);
    expect(rounds(sim).length).toBeGreaterThan(fired);
    sim.trigger = false;
    ticks(sim, 43);
    expect(sim.primary.spin).toBe(0);
  });

  test("cancelled wind-up never plays a simulated gunshot or spends ammo", () => {
    sim.trigger = true;
    ticks(sim, 10);
    sim.trigger = false;
    ticks(sim, 43);
    expect(sim.primary.spin).toBe(0);
    expect(rounds(sim)).toHaveLength(0);
    expect(sim.primary.ammo).toBe(MINIGUN.magazine);
  });

  test("empty belts coast and reload to 240, then held fire needs a fresh wind-up", () => {
    const a = sim.primary;
    a.ammo = 2;
    sim.trigger = true;
    ticks(sim, 33);
    expect(a.reload).toBeGreaterThan(0);
    expect(rounds(sim)).toHaveLength(2);
    expect(a.spooling).toBe(false);
    ticks(sim, 43);
    expect(a.spin).toBe(0);
    while (a.reload > STEP) sim.step();
    sim.step();
    expect(a.ammo).toBe(240);
    expect(a.spin).toBeLessThan(0.1);
    expect(rounds(sim)).toHaveLength(2);
    ticks(sim, 29);
    expect(rounds(sim).length).toBeGreaterThan(2);
  });

  test("group automatic order fires each robot's own weapon and reloads its own magazine", () => {
    sim.select(5);
    sim.chooseWeapon("minigun");
    sim.setBrace(true);
    sim.trigger = true;
    ticks(sim, 12);
    expect(sim.events.some((e) => e.type === "shot" && e.actor === 1 && e.weapon === "gun")).toBe(true);
    expect(rounds(sim)).toHaveLength(0);
    expect(rounds(sim, 2)).toHaveLength(0);
    ticks(sim, 30);
    expect(rounds(sim).length).toBeGreaterThan(0);
    expect(rounds(sim, 2)).toHaveLength(rounds(sim).length);
    expect(sim.squad.map((a) => a.weapon)).toEqual(["gun", "minigun", "gun", "minigun"]);
    sim.trigger = false;
    sim.reloadSelected();
    expect(sim.squad[0].reload).toBe(FIREARMS.gun.reload);
    expect(sim.squad[1].reload).toBe(MINIGUN.reload);
    expect(sim.squad[3].reload).toBe(MINIGUN.reload);
    ticks(sim, 231);
    expect(sim.squad[0].ammo).toBe(90);
    expect(sim.squad[1].ammo).toBe(240);
    expect(sim.squad[3].ammo).toBe(240);
  });

  test("grenade rotation in the twin-minigun squad uses only ANCHOR and LATCH", () => {
    sim.select(5);
    expect(sim.chooseWeapon("grenade")).toBe(true);
    expect(sim.throwGrenade(sim.aim)).toBe(true);
    expect(sim.throwGrenade(sim.aim)).toBe(true);
    expect(sim.throwGrenade(sim.aim)).toBe(false);
    expect(sim.grenades.map((g) => g.owner)).toEqual([1, 3]);
    expect(sim.squad.filter((a) => a.model === "minigunner").every((a) => a.grenadeCooldown === 0)).toBe(true);
  });

  test("a staggered ROOK coasts while SPINDLE keeps firing, then resumes held fire", () => {
    sim.selectGroup([2, 4]);
    sim.setBrace(true);
    sim.trigger = true;
    ticks(sim, 35);
    const rook = sim.squad[1], spindle = sim.squad[3];
    const before = [rook.ammo, spindle.ammo];
    sim.damage(rook, 1, { x: 0, y: 0, z: 0 }, rook.body.translation(), "minigun");
    ticks(sim, 3);
    expect(rook.ammo).toBe(before[0]);
    expect(rook.spin).toBeLessThan(1);
    expect(rook.firing).toBe(false);
    expect(spindle.ammo).toBeLessThan(before[1]);
    expect(spindle.firing).toBe(true);
    ticks(sim, 12);
    expect(rook.ammo).toBeLessThan(before[0]);
    expect(rook.firing).toBe(true);
  });

  test("selection, weapon changes and death stop the rotary weapon", () => {
    sim.trigger = true;
    ticks(sim, 35);
    sim.select(1);
    expect(sim.squad[3].spin).toBe(0);
    expect(sim.squad[3].firing).toBe(false);
    sim.select(4);
    sim.trigger = true;
    ticks(sim, 30);
    const a = sim.primary;
    sim.damage(a, 300, { x: 0, y: 0, z: 0 }, a.body.translation());
    expect(a.dead).toBe(true);
    expect(a.spin).toBe(0);
    expect(a.firing).toBe(false);
  });

  test("minigun kills complete the automatic plate drill", () => {
    sim.squad[0].body.setTranslation({ x: -19, y: 0.98, z: 10 }, true);
    sim.primary.body.setTranslation({ x: -14, y: 0.98, z: 10 }, true);
    sim.trigger = true;
    for (const target of sim.actors.filter((a) => a.kind === "plate")) {
      for (let i = 0; i < 300 && !target.dead; i++) {
        sim.aim = { ...target.body.translation(), y: target.body.translation().y + 0.25 };
        sim.step();
      }
      expect(target.dead, `plate ${target.id} has ${target.hp} HP at ${JSON.stringify(target.body.translation())}`).toBe(true);
      expect(target.killedBy).toBe("minigun");
    }
    expect(sim.drill.gun).toBe(true);
  });

  test("minigun rays ignore teammates, damage a hostile and impart real momentum", () => {
    const a = sim.primary, ally = sim.squad[1];
    a.body.setTranslation({ x: -14, y: 0.98, z: 10 }, true);
    ally.body.setTranslation({ x: -15.5, y: 0.98, z: 6 }, true);
    ticks(sim, 3);
    const target = sim.actors.find((t) => t.id === 10)!;
    sim.aim = { ...target.body.translation(), y: target.body.translation().y + 0.25 };
    const line = sim.aimTrace(a);
    expect(sim.ray(line.from, sim.aim, a.body)?.collider.handle).toBe(ally.collider.handle);
    expect(sim.fireRay(a, line.from, sim.aim)?.collider.handle).toBe(target.collider.handle);
    const hp = target.hp, allyHp = ally.hp;
    sim.trigger = true;
    ticks(sim, 31);
    expect(target.hp).toBeLessThan(hp);
    expect(ally.hp).toBe(allyHp);
    expect(Math.hypot(target.body.linvel().x, target.body.linvel().z)).toBeGreaterThan(0.05);
    expect(sim.inspect().friendlyFire.minigun).toBe(false);
  });

  test.each(["player", "enemy"] as const)("%s minigun rounds pass through allied robot hulls to hit an opponent", (team) => {
    const shooter = team === "player" ? sim.primary : sim.addEnemy("minigunner", { x: -14, z: 10 });
    const ally = team === "player" ? sim.squad[0] : sim.addEnemy("assault", { x: -14, z: 3 });
    const target = team === "player" ? sim.addEnemy("assault", { x: -14, z: -4 }) : sim.squad[0];
    shooter.body.setTranslation({ x: -14, y: 0.98, z: 10 }, true);
    ally.body.setTranslation({ x: -14, y: 0.98, z: 3 }, true);
    target.body.setTranslation({ x: -14, y: 0.98, z: -4 }, true);
    ticks(sim, 3);
    shooter.braced = true;
    shooter.spin = 1;
    sim.aim = { ...target.body.translation(), y: target.body.translation().y + 0.25 };
    const from = sim.muzzle(shooter);
    expect(sim.ray(from, sim.aim, shooter.body)?.collider.handle).toBe(ally.collider.handle);
    expect(sim.fireRay(shooter, from, sim.aim)?.collider.handle).toBe(target.collider.handle);
    const hp = target.hp, allyHp = ally.hp;
    sim.shoot(shooter);
    expect(target.hp).toBe(hp - MINIGUN.damage);
    expect(ally.hp).toBe(allyHp);
  });

  test("arena repair refills both minigun belts without resurrecting fallen squad members", () => {
    sim.reset("arena");
    ticks(sim, 250);
    const gunners = [sim.squad[1], sim.squad[3]];
    for (const a of gunners) {
      a.ammo = 5;
      a.hp = 100;
    }
    const fallen = sim.squad[0];
    sim.damage(fallen, 1000, { x: 0, y: 0, z: 0 }, fallen.body.translation());
    for (const enemy of sim.arena!.enemies)
      sim.damage(enemy, 1000, { x: 0, y: 0, z: 0 }, enemy.body.translation());
    ticks(sim, 1);
    expect(sim.arena!.phase).toBe("intermission");
    for (const a of gunners) {
      expect(a.ammo).toBe(240);
      expect(a.hp).toBe(200);
    }
    expect(fallen.dead).toBe(true);
  });
});

test("shipped PCM fragments match the weapon timers and loop without a silent motor seam", () => {
  const read = (name: string) => {
    const bytes = readFileSync(new URL(`../sounds/minigun/${name}.wav`, import.meta.url));
    expect(bytes.toString("ascii", 0, 4)).toBe("RIFF");
    expect(bytes.readUInt16LE(22)).toBe(1);
    const rate = bytes.readUInt32LE(24);
    expect(rate).toBe(48000);
    expect(bytes.readUInt16LE(34)).toBe(16);
    const samples = new Int16Array(bytes.buffer.slice(bytes.byteOffset + 44, bytes.byteOffset + bytes.length));
    return { seconds: samples.length / rate, samples };
  };
  expect(read("spin-up").seconds).toBe(MINIGUN.windUp);
  expect(read("spin-down").seconds).toBe(MINIGUN.coast);
  expect(read("fire-loop").seconds).toBeCloseTo(12 * MINIGUN.interval, 8);
  const motor = read("motor-loop").samples;
  expect(Math.abs(motor[0] - motor.at(-1)!)).toBeLessThan(10);
  const rms = (x: Int16Array) => Math.sqrt(x.reduce((sum, v) => sum + v * v, 0) / x.length);
  expect(rms(motor.slice(-480))).toBeGreaterThan(rms(motor) * 0.4);
  for (const name of ["fire-start", "fire-loop", "fire-tail", "spin-up", "spin-down", "impact-1", "impact-2", "impact-3"])
    expect(Math.max(...Array.from(read(name).samples, Math.abs))).toBeLessThan(32767);
});
