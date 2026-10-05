import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { FIREARMS, RIFLE, STEP, distance2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";

function ticks(sim: Simulation, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
}
const noImpulse = { x: 0, y: 0, z: 0 };

describe("friendly fire and sniper support", () => {
  let sim: Simulation;
  beforeEach(async () => {
    sim = await Simulation.create("arena");
    sim.arena!.countdown = 100; // Isolate weapon/support behavior from new arrivals.
    sim.squad.forEach((a, i) => a.body.setTranslation({ x: 20 + i * 2, y: 0.98, z: 15 }, true));
  });
  afterEach(() => sim.world.free());

  test.each([
    ["player", "gun"], ["player", "rifle"], ["player", "pistol"],
    ["enemy", "gun"], ["enemy", "rifle"], ["enemy", "pistol"],
  ] as const)("%s %s shots and their preview pass allies and hit an opponent", (team, weapon) => {
    const model = weapon === "gun" ? "assault" : "sniper";
    const shooter = team === "player"
      ? sim.squad[weapon === "gun" ? 0 : 3]
      : sim.addEnemy(model, { x: -7, z: 10 });
    const ally = team === "player" ? sim.squad[1] : sim.addEnemy("assault", { x: -7, z: 4 });
    const opponent = team === "player" ? sim.addEnemy("assault", { x: -7, z: -10 }) : sim.squad[0];
    shooter.body.setTranslation({ x: -7, y: 0.98, z: 10 }, true);
    ally.body.setTranslation({ x: -7, y: 0.98, z: 4 }, true);
    opponent.body.setTranslation({ x: -7, y: 0.98, z: -10 }, true);
    shooter.weapon = weapon;
    if (team === "player") { sim.select(shooter.id); sim.chooseWeapon(weapon); }
    shooter.braced = true;
    shooter.braceTime = RIFLE.settle;
    sim.world.step();
    sim.aim = { ...opponent.body.translation(), y: opponent.body.translation().y + 0.25 };
    const velocity = { ...ally.body.linvel() }, lastHit = ally.hitTime;
    const muzzle = sim.muzzle(shooter);
    expect(sim.ray(muzzle, sim.aim, shooter.body)?.collider.handle).toBe(ally.collider.handle);
    expect(sim.fireRay(shooter, muzzle, sim.aim)?.collider.handle).toBe(opponent.collider.handle);
    expect(sim.aimTrace(shooter).to.z).toBeLessThan(-9);
    sim.shoot(shooter);
    expect(ally.hp).toBe(ally.maxHp);
    expect(ally.stability).toBe(1);
    expect(ally.hitTime).toBe(lastHit);
    expect(ally.body.linvel()).toEqual(velocity);
    expect(opponent.hp).toBe(opponent.maxHp - FIREARMS[weapon].damage);
    expect(sim.events.some((e) => e.type === "shot" && e.hit && e.to.z < -9)).toBe(true);
  });

  test.each(["player", "enemy"] as const)("%s grenades spare their owner and allies but damage opponents", (team) => {
    const owner = team === "player" ? sim.squad[0] : sim.addEnemy("assault", { x: -7, z: 10 });
    const ally = team === "player" ? sim.squad[1] : sim.addEnemy("assault", { x: -7, z: 8 });
    const opponent = team === "player" ? sim.addEnemy("assault", { x: -7, z: 4 }) : sim.squad[0];
    owner.body.setTranslation({ x: -7, y: 0.98, z: 10 }, true);
    ally.body.setTranslation({ x: -7, y: 0.98, z: 8 }, true);
    opponent.body.setTranslation({ x: -7, y: 0.98, z: 4 }, true);
    sim.world.step();
    expect(sim.throwGrenade({ x: -7, z: 5.5 }, owner)).toBe(true);
    const grenade = sim.grenades[0];
    grenade.body.setTranslation({ x: -7, y: 0.18, z: 5.5 }, true);
    grenade.body.setLinvel(noImpulse, true);
    sim.world.step();
    const velocities = [owner, ally].map((a) => ({ ...a.body.linvel() }));
    sim.explode(grenade);
    for (const [i, a] of [owner, ally].entries()) {
      expect(a.hp).toBe(a.maxHp);
      expect(a.stability).toBe(1);
      expect(a.hitTime).toBe(-10);
      expect(a.body.linvel()).toEqual(velocities[i]);
    }
    expect(opponent.hp).toBeLessThan(opponent.maxHp);
    expect(sim.events.some((e) => e.type === "explosion" && e.team === team && e.affected === 1)).toBe(true);
  });

  test("unselected teammates hold their pending orders and cover independently of the sniper's trigger and aim", () => {
    sim.reset("arena");
    sim.arena!.countdown = 100;
    sim.move({ x: -12, z: 8 });
    const orders = sim.squad.map((a) => ({ path: [...a.path], destination: a.moveTarget }));
    sim.select(4);
    sim.chooseWeapon("rifle");
    sim.squad[0].braced = true;
    const start = sim.squad.map((a) => ({ ...a.body.translation() }));
    const enemy = sim.addEnemy("assault", { x: -7, z: -10 });
    sim.world.step();
    const sight = { ...sim.aim };
    sim.toggleSniping();
    ticks(sim, 1.3);
    expect(sim.squad.slice(0, 3).every((a) => a.cover && a.braced)).toBe(true);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(sim.coverShots).toBeGreaterThan(0);
    expect(sim.coverHits).toBeGreaterThan(0);
    expect(sim.shots).toBe(0);
    expect(sim.hits).toBe(0);
    expect(sim.trigger).toBe(false);
    expect(sim.aim).toEqual(sight);
    expect([...sim.selected]).toEqual([4]);
    expect(sim.weapon).toBe("rifle");
    sim.squad.forEach((a, i) => {
      expect(distance2(a.body.translation(), start[i])).toBeLessThan(0.15);
      expect(a.path).toEqual(orders[i].path);
      expect(a.moveTarget).toEqual(orders[i].destination);
    });
    const coverShots = sim.coverShots;
    sim.endSniping();
    expect(sim.squad.every((a) => !a.cover && !a.firing)).toBe(true);
    expect(sim.squad.slice(0, 3).map((a) => a.braced)).toEqual([true, false, false]);
    ticks(sim, 1);
    expect(sim.coverShots).toBe(coverShots);
    expect(distance2(sim.squad[1].body.translation(), start[1])).toBeGreaterThan(1);
    expect(distance2(sim.squad[0].body.translation(), start[0])).toBeLessThan(0.15);
  });

  test("support respects tall cover, then acquires an exposed enemy without advancing", () => {
    const gunner = sim.squad[0];
    gunner.body.setTranslation({ x: -7, y: 0.98, z: 10 }, true);
    sim.damage(sim.squad[1], 1000, noImpulse, sim.squad[1].body.translation());
    sim.damage(sim.squad[2], 1000, noImpulse, sim.squad[2].body.translation());
    const hidden = sim.addEnemy("assault", { x: 0, z: -10 });
    sim.world.step();
    sim.select(4);
    sim.chooseWeapon("rifle");
    sim.toggleSniping();
    ticks(sim, 0.8);
    expect(gunner.cover?.state).toBe("watching");
    expect(gunner.cover?.target).toBeNull();
    expect(sim.coverShots).toBe(0);
    expect(hidden.hp).toBe(hidden.maxHp);
    const exposed = sim.addEnemy("assault", { x: -7, z: -10 });
    sim.world.step();
    ticks(sim, 1);
    expect(exposed.hp).toBeLessThan(exposed.maxHp);
    expect(hidden.hp).toBe(hidden.maxHp);
    expect(distance2(gunner.body.translation(), { x: -7, z: 10 })).toBeLessThan(0.1);
    expect(gunner.path).toHaveLength(0);
  });

  test("support excludes casualties, reacts to hostile hits, reloads and stops on NEEDLE's death", () => {
    const gunner = sim.squad[0];
    gunner.body.setTranslation({ x: -7, y: 0.98, z: 10 }, true);
    gunner.ammo = 1;
    sim.damage(sim.squad[1], 1000, noImpulse, sim.squad[1].body.translation());
    sim.damage(sim.squad[2], 1000, noImpulse, sim.squad[2].body.translation());
    const enemy = sim.addEnemy("assault", { x: -7, z: -10 });
    enemy.hp = enemy.maxHp = 10000;
    sim.world.step();
    sim.select(4);
    sim.chooseWeapon("rifle");
    sim.toggleSniping();
    sim.damage(gunner, 14, noImpulse, gunner.body.translation(), "gun");
    ticks(sim, 0.2);
    expect(gunner.cover?.state).toBe("suppressed");
    expect(sim.coverShots).toBe(0);
    expect(sim.squad.filter((a) => a.cover)).toHaveLength(1);
    ticks(sim, 0.8);
    expect(sim.coverShots).toBe(1);
    expect(gunner.reload).toBeGreaterThan(0);
    ticks(sim, 3);
    expect(sim.coverShots).toBeGreaterThan(1);
    expect(gunner.ammo).toBeGreaterThan(0);
    expect(gunner.reload).toBe(0);
    sim.damage(sim.primary, 1000, noImpulse, sim.primary.body.translation());
    const coverShots = sim.coverShots;
    expect(sim.sniping).toBe(false);
    expect(sim.squad.every((a) => !a.cover && !a.firing)).toBe(true);
    ticks(sim, 1);
    expect(sim.coverShots).toBe(coverShots);
  });
});
