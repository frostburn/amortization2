import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FIREARMS, GRENADE_FUSE, PISTOL, RIFLE, STEP, distance2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";
import { ARENA_ENTRIES } from "../src/game/ranges";

function ticks(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
}
const noImpulse = { x: 0, y: 0, z: 0 };

describe("NEEDLE pistol loadout", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("long"); });
  afterEach(() => sim.world.free());

  test("NEEDLE has only rifle and pistol; mixed grenade orders skip it", () => {
    const needle = sim.primary;
    expect(sim.closeWeapon).toBe("pistol");
    expect(sim.chooseWeapon("gun")).toBe(false);
    expect(sim.chooseWeapon("grenade")).toBe(false);
    expect(sim.throwGrenade({ x: 5, z: 0 })).toBe(false);
    expect(sim.chooseWeapon("pistol")).toBe(true);
    expect(sim.toggleSniping()).toBe(false);
    sim.select(1);
    expect(sim.weapon).toBe("gun");
    expect(sim.chooseWeapon("pistol")).toBe(false);
    sim.chooseWeapon("grenade");
    sim.select(4);
    expect(sim.weapon).toBe("rifle");
    sim.select(5);
    sim.chooseWeapon("pistol");
    expect(sim.closeWeapon).toBe("pistol");
    expect(sim.nextCloseWeapon).toBe("gun");
    sim.chooseWeapon(sim.nextCloseWeapon);
    expect(sim.weapon).toBe("gun");
    expect(sim.nextCloseWeapon).toBe("pistol");
    for (const id of [1, 2, 3]) {
      expect(sim.grenadeThrower?.id).toBe(id);
      sim.throwGrenade({ x: 15, z: 0 });
    }
    expect(sim.grenadeThrower).toBeUndefined();
    expect(needle.grenadeCooldown).toBe(0);
  });

  test("pistol hits, cycles slowly and reloads independently of the rifle", () => {
    const needle = sim.primary, target = sim.actors.find((a) => a.id === 10)!;
    needle.body.setTranslation({ x: 18, y: 0.96, z: -3 }, true);
    sim.chooseWeapon("pistol");
    sim.aim = { ...target.body.translation(), y: target.body.translation().y + 0.25 };
    sim.setBrace(true);
    ticks(sim, 0.1);
    sim.trigger = true;
    ticks(sim, STEP);
    expect(target.hp).toBe(target.maxHp - PISTOL.damage);
    expect(needle.pistol.ammo).toBe(PISTOL.magazine - 1);
    expect(needle.ammo).toBe(RIFLE.magazine);
    expect(sim.events.some((e) => e.type === "shot" && e.weapon === "pistol")).toBe(true);
    ticks(sim, PISTOL.interval * 0.6);
    expect(sim.shots).toBe(1);
    sim.trigger = false;
    sim.reloadSelected();
    expect(needle.pistol.reload).toBeGreaterThan(0);
    expect(needle.reload).toBe(0);
    sim.chooseWeapon("rifle");
    ticks(sim, PISTOL.reload + STEP);
    expect(needle.pistol.ammo).toBe(PISTOL.magazine);
    expect(needle.ammo).toBe(RIFLE.magazine);
  });

  test("the pistol preview and actual miss stop at pistol reach", () => {
    sim.chooseWeapon("pistol");
    sim.aim = { x: 97, y: 1.4, z: -6 };
    const trace = sim.aimTrace(sim.primary);
    expect(Math.hypot(trace.to.x - trace.from.x, trace.to.y - trace.from.y, trace.to.z - trace.from.z)).toBeCloseTo(PISTOL.range);
    sim.shoot(sim.primary);
    const shot = sim.events.find((e) => e.type === "shot");
    expect(shot?.type).toBe("shot");
    if (shot?.type === "shot") expect(Math.hypot(shot.to.x - shot.from.x, shot.to.y - shot.from.y, shot.to.z - shot.from.z)).toBeCloseTo(PISTOL.range);
    expect(sim.actors.filter((a) => a.kind === "precision").every((a) => a.hp === a.maxHp)).toBe(true);
  });
});

describe("endless arena", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("arena"); });
  afterEach(() => sim.world.free());
  const clearWave = () => {
    for (const a of sim.arena!.enemies)
      sim.damage(a, a.maxHp, noImpulse, a.body.translation(), "gun");
    sim.step();
  };

  test("the initial warning precedes squad entry, flank movement and real damaging bursts", () => {
    expect(sim.selected.size).toBe(4);
    ticks(sim, 3.5);
    expect(sim.arena!.wave).toBe(0);
    expect(sim.arena!.enemyShots).toBe(0);
    ticks(sim, 0.6);
    expect(sim.arena!.wave).toBe(1);
    expect(sim.arena!.enemies).toHaveLength(3);
    expect(new Set(sim.arena!.enemies.map((a) => a.ai!.squad)).size).toBe(1);
    expect(sim.arena!.enemies.every((a) => a.ai!.state === "entering" && a.path.length > 0)).toBe(true);
    const spawns = sim.arena!.enemies.map((a) => ({ ...a.body.translation() }));
    ticks(sim, 12);
    expect(sim.arena!.enemies.some((a, i) => distance2(spawns[i], a.body.translation()) > 6)).toBe(true);
    expect(sim.arena!.enemyShots).toBeGreaterThan(0);
    expect(sim.squad.some((a) => a.hp < a.maxHp)).toBe(true);
    expect(sim.shots).toBe(0);
    expect(sim.hits).toBe(0);
  });

  test("AI aims independently, uses cover-clipped shots and does not pollute player accuracy", () => {
    ticks(sim, 4.1);
    const enemy = sim.arena!.enemies[0], player = sim.squad[0];
    enemy.body.setTranslation({ x: -7, y: 0.96, z: -10 }, true);
    player.body.setTranslation({ x: -7, y: 0.96, z: 10 }, true);
    sim.world.step();
    enemy.ai!.aim = { ...player.body.translation(), y: player.body.translation().y + 0.25 };
    const sight = { ...sim.aim }, hp = player.hp;
    enemy.braced = true;
    sim.shoot(enemy);
    expect(player.hp).toBe(hp - FIREARMS.gun.damage);
    expect(sim.aim).toEqual(sight);
    expect(sim.shots).toBe(0);
    expect(sim.arena!.enemyShots).toBe(1);
    enemy.shotWait = 0;
    enemy.body.setTranslation({ x: 0, y: 0.96, z: -10 }, true);
    player.body.setTranslation({ x: 0, y: 0.96, z: 0 }, true);
    sim.world.step();
    enemy.ai!.aim = { ...player.body.translation(), y: 1.25 };
    const protectedHp = player.hp;
    sim.shoot(enemy);
    expect(player.hp).toBe(protectedHp);
    const shot = sim.events.filter((e) => e.type === "shot").at(-1)!;
    expect(shot.to.z).toBeLessThan(-7);
  });

  test("clears repair and rearm survivors, retain casualties, and add sniper squads", () => {
    ticks(sim, 4.1);
    const survivor = sim.squad[0], casualty = sim.squad[1];
    sim.damage(survivor, 50, noImpulse, survivor.body.translation());
    sim.damage(casualty, casualty.hp, noImpulse, casualty.body.translation());
    survivor.ammo = 2;
    sim.squad[3].pistol.ammo = 1;
    sim.squad[3].ammo = 1;
    clearWave();
    expect(sim.arena!.phase).toBe("intermission");
    expect(sim.arena!.cleared).toBe(1);
    expect(survivor.hp).toBe(survivor.maxHp);
    expect(survivor.ammo).toBe(90);
    expect(casualty.dead).toBe(true);
    expect(sim.squad[3].pistol.ammo).toBe(PISTOL.magazine);
    expect(sim.squad[3].ammo).toBe(RIFLE.magazine);
    ticks(sim, 6.1);
    expect(sim.arena!.wave).toBe(2);
    expect(sim.arena!.enemies).toHaveLength(4);
    clearWave();
    ticks(sim, 6.1);
    expect(sim.arena!.wave).toBe(3);
    expect(sim.arena!.enemies).toHaveLength(5);
    expect(sim.arena!.enemies.some((a) => a.model === "sniper")).toBe(true);
    expect(new Set(sim.arena!.enemies.map((a) => a.ai!.gate)).size).toBe(2);
    sim.select(4);
    sim.chooseWeapon("rifle");
    sim.toggleSniping();
    const hostileNeedle = sim.arena!.enemies.find((a) => a.model === "sniper")!;
    sim.damage(hostileNeedle, hostileNeedle.hp, noImpulse, hostileNeedle.body.translation(), "rifle");
    expect(sim.sniping).toBe(true); // Enemy sniper deaths must not eject the player's scope.
  });

  test("later waves stay endless while live bodies and corpses remain bounded", () => {
    ticks(sim, 4.1);
    for (let wave = 1; wave <= 14; wave++) {
      expect(sim.arena!.wave).toBe(wave);
      expect(sim.arena!.enemies.length).toBe(Math.min(12, wave + 2));
      expect(sim.actors.length).toBeLessThanOrEqual(28);
      clearWave();
      ticks(sim, 6.1);
    }
    expect(sim.arena!.wave).toBe(15);
    expect(sim.arena!.kills).toBeGreaterThan(100);
    expect(sim.arena!.phase).toBe("active");
    expect(sim.actors.every((a) => a.kind === "player" || !a.dead || sim.time - a.deathTime! <= 8)).toBe(true);
  });

  test("later assault squads throw physical grenades at clusters without giving NEEDLE explosives", () => {
    ticks(sim, 4.1);
    for (let i = 0; i < 3; i++) { clearWave(); ticks(sim, 6.1); }
    expect(sim.arena!.wave).toBe(4);
    const enemy = sim.arena!.enemies[0];
    enemy.body.setTranslation({ x: -7, y: 0.96, z: -7 }, true);
    enemy.ai!.rally = { x: -7, z: -7 };
    enemy.path = [];
    enemy.moveTarget = undefined;
    for (const a of sim.arena!.enemies) a.ai!.nextAttack = sim.time + 30;
    ticks(sim, 6.1);
    const frag = sim.grenades.find((g) => g.team === "enemy");
    expect(frag).toBeDefined();
    expect(sim.actors.find((a) => a.id === frag!.owner)?.model).toBe("assault");
    expect(sim.grenades.filter((g) => g.team === "enemy")).toHaveLength(1);
    expect(sim.throws).toBe(0);
    expect(sim.grenadeThrower?.id).toBe(1);
    const hostileNeedle = sim.arena!.enemies.find((a) => a.model === "sniper")!;
    expect(sim.throwGrenade({ x: 0, z: 8 }, hostileNeedle)).toBe(false);
    ticks(sim, GRENADE_FUSE + STEP);
    expect(sim.events.some((e) => e.type === "explosion" && e.team === "enemy")).toBe(true);
    expect(sim.squad.some((a) => a.hp < a.maxHp)).toBe(true);
    expect(sim.grenadeHits).toBe(0);
    expect(sim.throws).toBe(0);
  });

  test("live explosives must resolve before a cleared wave repairs survivors", () => {
    ticks(sim, 4.1);
    sim.throwGrenade({ x: 24, z: 16 });
    clearWave();
    expect(sim.arena!.phase).toBe("active");
    expect(sim.arena!.enemies).toHaveLength(0);
    ticks(sim, GRENADE_FUSE + STEP * 2);
    expect(sim.arena!.phase).toBe("intermission");
    expect(sim.arena!.cleared).toBe(1);
  });

  test("an occupied announced entrance spawns a squad beside the player, never inside it", () => {
    const gate = ARENA_ENTRIES[0];
    const placements = [{ x: -1.1, z: gate.z }, { x: 1.1, z: gate.z },
      { x: -1.1, z: gate.z + 1.9 }, { x: 1.1, z: gate.z + 1.9 }];
    sim.squad.forEach((a, i) => a.body.setTranslation({ ...placements[i], y: 0.96 }, true));
    ticks(sim, 4.01);
    for (const a of sim.arena!.enemies)
      for (const player of sim.squad)
        expect(distance2(a.body.translation(), player.body.translation())).toBeGreaterThan(1.1);
    expect(sim.arena!.enemies).toHaveLength(3);
    expect(sim.arena!.enemies.every((a) => a.ai!.gate === "NORTH")).toBe(true);
  });

  test("squad loss stops enemy fire and new waves; reset restores the full squad", () => {
    ticks(sim, 4.1);
    sim.select(4);
    sim.chooseWeapon("rifle");
    sim.toggleSniping();
    sim.trigger = true;
    for (const a of sim.squad) sim.damage(a, a.hp, noImpulse, a.body.translation());
    sim.step();
    expect(sim.arena!.phase).toBe("defeat");
    expect(sim.trigger).toBe(false);
    expect(sim.sniping).toBe(false);
    const shots = sim.arena!.enemyShots;
    ticks(sim, 10);
    expect(sim.arena!.wave).toBe(1);
    expect(sim.arena!.enemyShots).toBe(shots);
    sim.reset();
    expect(sim.arena!.wave).toBe(0);
    expect(sim.arena!.phase).toBe("incoming");
    expect(sim.actors).toHaveLength(4);
    expect(sim.active).toHaveLength(4);
    expect(sim.squad.every((a) => a.hp === a.maxHp)).toBe(true);
  });

  test("a robot displaced beyond an open entrance can walk back into the arena", () => {
    sim.select(1);
    const edge = sim.layout.bounds.right;
    const goal = { x: edge - 4, z: 0 };
    sim.primary.body.setTranslation({ x: edge + 2.5, y: 0.96, z: 0 }, true);
    sim.squad[1].body.setTranslation({ x: edge - 1, y: 0.96, z: 1.7 }, true);
    sim.move(goal);
    ticks(sim, 3);
    expect(sim.primary.path).toHaveLength(0);
    expect(distance2(sim.primary.body.translation(), goal)).toBeLessThan(0.15);
  });
});
