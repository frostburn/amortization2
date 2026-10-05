import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { RIFLE, STEP, distance2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";
import { rifleMix } from "../src/audio/spatial";

const ticks = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
};

describe("long-range sniper", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create("long");
  });
  afterEach(() => sim.world.free());

  test("the light chassis is fragile and weapon selection respects each model", () => {
    const sniper = sim.squad[3],
      assault = sim.squad[0];
    expect(sniper.maxHp).toBeLessThan(assault.maxHp / 2);
    expect(sniper.body.mass()).toBeLessThan(assault.body.mass() * 0.6);
    expect(sim.primary).toBe(sniper);
    expect(sim.weapon).toBe("rifle");
    expect(sim.chooseWeapon("gun")).toBe(false);
    sim.select(1);
    expect(sim.weapon).toBe("gun");
    expect(sim.chooseWeapon("rifle")).toBe(false);
    sim.select(5);
    sim.setBrace(true);
    expect(sim.chooseWeapon("rifle")).toBe(true);
    expect(sniper.braced).toBe(true);
    sim.trigger = true;
    sim.step();
    expect(sim.shots).toBe(1);
    expect(sim.squad.slice(0, 3).every((a) => a.ammo === 90)).toBe(true);
    sim.damage(sniper, 65, { x: 0, y: 0, z: 0 }, sniper.body.translation());
    expect(sniper.dead).toBe(true);
  });

  test("settled rifle shots complete the 30, 60 and 90 metre drill", () => {
    sim.setBrace(true);
    for (const target of sim.actors.filter((a) => a.kind === "precision")) {
      sim.aim = { ...target.body.translation(), y: 1.25 };
      ticks(sim, RIFLE.interval + 0.1);
      sim.trigger = true;
      sim.step();
      sim.trigger = false;
      expect(target.dead).toBe(true);
      expect(target.killedBy).toBe("rifle");
    }
    expect(sim.shots).toBe(3);
    expect(sim.hits).toBe(3);
    expect(sim.primary.ammo).toBe(RIFLE.magazine - 3);
    expect(sim.drill).toEqual({
      gun: false,
      grenade: false,
      impulse: false,
      rifle: true,
    });
  });

  test("an unbraced 90 metre shot misses and recoils substantially; a settled shot hits", () => {
    let sniper = sim.primary,
      target = sim.actors.find((a) => a.id === 12)!;
    sim.aim = { ...target.body.translation(), y: 1.25 };
    const start = { ...sniper.body.translation() };
    sim.shoot(sniper);
    expect(target.hp).toBe(target.maxHp);
    expect(
      Math.hypot(sniper.body.linvel().x, sniper.body.linvel().z),
    ).toBeGreaterThan(3);
    expect(sniper.stability).toBeLessThan(0.5);
    ticks(sim, 0.2);
    expect(distance2(start, sniper.body.translation())).toBeGreaterThan(0.2);

    sim.reset();
    sniper = sim.primary;
    target = sim.actors.find((a) => a.id === 12)!;
    sim.aim = { ...target.body.translation(), y: 1.25 };
    sim.setBrace(true);
    ticks(sim, RIFLE.settle + 0.1);
    const bracedStart = { ...sniper.body.translation() };
    sim.shoot(sniper);
    expect(target.dead).toBe(true);
    ticks(sim, 0.2);
    expect(distance2(bracedStart, sniper.body.translation())).toBeLessThan(
      0.05,
    );
  });

  test("bracing must settle, and moving releases the support", () => {
    const target = sim.actors.find((a) => a.id === 12)!;
    sim.aim = { ...target.body.translation(), y: 1.25 };
    sim.setBrace(true);
    ticks(sim, 0.2);
    sim.shoot(sim.primary);
    expect(target.hp).toBe(target.maxHp);
    ticks(sim, RIFLE.interval);
    const sight = { ...sim.aim };
    sim.chooseWeapon("grenade");
    sim.aim = { x: 5, y: 1.25, z: -3 };
    sim.chooseWeapon("rifle");
    expect(sim.aim).toEqual(sight);
    expect(sim.primary.braced).toBe(true);
    sim.shoot(sim.primary);
    expect(target.dead).toBe(true);
    sim.move({ x: 3, z: 0 });
    expect(sim.primary.braced).toBe(false);
    expect(sim.primary.braceTime).toBe(0);
  });

  test("the rifle cycles single shots and reloads its own five-round magazine", () => {
    sim.aim = { x: 97, y: 1.25, z: 7 };
    sim.setBrace(true);
    ticks(sim, RIFLE.settle);
    sim.trigger = true;
    ticks(sim, 6);
    expect(sim.shots).toBe(5);
    expect(sim.primary.ammo).toBe(0);
    expect(sim.primary.reload).toBeGreaterThan(2);
    expect(
      sim.events.some((e) => e.type === "reload" && e.weapon === "rifle"),
    ).toBe(true);
    sim.trigger = false;
    ticks(sim, RIFLE.reload + STEP);
    expect(sim.primary.ammo).toBe(5);
    expect(sim.shots).toBe(5);
  });

  test("cover blocks a long rifle shot and wrong-weapon kills cannot complete the drill", () => {
    const target = sim.actors.find((a) => a.id === 12)!;
    target.body.setTranslation({ x: 88, y: 0.96, z: -5 }, true);
    sim.aim = { x: 88, y: 1.25, z: -5 };
    sim.setBrace(true);
    ticks(sim, RIFLE.settle + 0.1);
    sim.shoot(sim.primary);
    expect(target.hp).toBe(target.maxHp);
    const shot = sim.events.filter((e) => e.type === "shot").at(-1);
    expect(shot?.type === "shot" && shot.to.x < 74).toBe(true);
    for (const a of sim.actors.filter((a) => a.kind === "precision"))
      sim.damage(a, 1000, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun");
    sim.step();
    expect(sim.drill.rifle).toBe(false);
  });

  test("the complete squad can navigate beyond the old yard to the far end of the lane", () => {
    sim.select(5);
    sim.move({ x: 88, z: -6 });
    expect(sim.active.every((a) => a.moveTarget!.x > 80)).toBe(true);
    ticks(sim, 30);
    for (const a of sim.active) {
      expect(a.path).toHaveLength(0);
      expect(distance2(a.body.translation(), a.moveTarget!)).toBeLessThan(0.15);
    }
    sim.reset("proving");
    expect(sim.actors).toHaveLength(16);
    expect(sim.primary.id).toBe(1);
    expect(sim.weapon).toBe("gun");
  });
});

test("rifle recording mix and stereo placement follow the camera", () => {
  const shot = { x: 30, y: 1.3, z: 0 };
  const close = rifleMix(shot, { x: 30, y: 10, z: 10 });
  const distant = rifleMix(shot, { x: -40, y: 28, z: 38 });
  expect(close.near).toBeGreaterThan(0.99);
  expect(close.far).toBe(0);
  expect(distant.far).toBeGreaterThan(0.99);
  expect(distant.near).toBeLessThan(0.001);
  expect(close.gain).toBeGreaterThan(distant.gain);
  expect(rifleMix(shot, { x: 40, y: 10, z: 10 }).pan).toBeLessThan(0);
  expect(rifleMix(shot, { x: 20, y: 10, z: 10 }).pan).toBeGreaterThan(0);
});
