import { afterEach, beforeEach, describe, expect, test } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
import { STEP, RIFLE } from "../src/game/config";
import { Simulation } from "../src/game/simulation";
import { WATCH } from "../src/game/security";
import { HumanReplayRecorder, playRecordedSession } from "../src/game/replay";

const noImpulse = { x: 0, y: 0, z: 0 };
const advance = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) { sim.step(); sim.events.length = 0; }
};
describe("civilian security response", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("city"); });
  afterEach(() => sim.world.free());
  const harm = (index = 0, amount = 1) => {
    const c = sim.city!.carts[index];
    sim.city!.damage(c, amount, noImpulse, c.body.translation(), "player");
  };
  const stage = () => {
    const c = sim.city!.carts[0], a = sim.squad[0];
    c.body.setTranslation({ x: 0, y: .32, z: 5 }, true); c.wait = 5;
    a.body.setTranslation({ x: 0, y: .98, z: 0 }, true);
    sim.select(1); sim.chooseWeapon("gun"); sim.aim = { x: 0, y: .35, z: 5 };
    sim.world.step();
    return { c, a };
  };

  test("nearby gunfire scatters deliveries; a real player hit calls security without accuracy credit", () => {
    const { c, a } = stage();
    sim.city!.disturb(a.body.translation(), c.body.translation());
    expect(sim.security!.level).toBe(0);
    sim.shoot(a);
    expect(c.hp).toBeLessThan(36);
    expect(sim.security!.level).toBe(1);
    expect(sim.security!.active).toHaveLength(0);
    expect(sim.events.some(e => e.type === "security" && e.phase === "dispatch")).toBe(true);
    expect(sim.hits).toBe(0);
  });

  test("enemy fire, ordinary disturbances and moving wrecks do not blame the player", () => {
    const { c, a } = stage(); a.body.setTranslation({ x: -6, y: .98, z: 0 }, true);
    const enemy = sim.addEnemy("assault", { x: 0, z: 0 }); sim.world.step();
    sim.shoot(enemy); expect(c.hp).toBeLessThan(36);
    expect(sim.security!.level).toBe(0);
    sim.city!.damage(c, c.hp, noImpulse, c.body.translation());
    sim.city!.damage(c, 100, { x: 90, y: 90, z: 0 }, c.body.translation(), "player");
    expect(sim.security!.level).toBe(0);
  });

  test("all six civilian chassis report player damage", () => {
    sim.reset("port");
    const city = sim.city!, civilians = [...city.carts, ...city.kites, ...city.porters, ...city.vehicles];
    for (const model of ["CART", "CRATE", "KITE", "PORTER", "CAB", "VAN"]) {
      const c = civilians.find(c => c.model === model)!;
      expect(c).toBeDefined();
      const before = sim.security!.pressure;
      city.damage(c, 1, noImpulse, c.body.translation(), "player");
      expect(sim.security!.pressure).toBeGreaterThan(before);
    }
    expect(sim.security!.level).toBe(2);
  });

  test("sniping held cargo calls security without damaging its PORTER", () => {
    sim.reset("port"); advance(sim, 5);
    const p = sim.city!.porters[0], load = { ...p.cargo.body.translation() };
    expect(p.grip).toBeDefined();
    sim.select(4); sim.chooseWeapon("rifle"); const a = sim.primary;
    a.body.setTranslation({ x: load.x + 8, y: .98, z: load.z + 8 }, true);
    sim.setBrace(true); a.braceTime = RIFLE.settle; sim.world.step(); sim.aim = { ...p.cargo.body.translation() };
    const hp = p.hp; sim.shoot(a);
    expect(p.grip).toBeUndefined(); expect(p.hp).toBe(hp);
    expect(sim.security!.level).toBe(1); expect(sim.hits).toBe(0);
  });

  test("a hovering WATCH does not deflect a ground movement order", () => {
    stage(); harm(); sim.time = 3; sim.security!.update();
    const drone = sim.security!.active[0];
    drone.body.setTranslation({ x: 0, y: 6, z: -4 }, true);
    drone.flight!.goal = { x: 0, y: 6, z: -4 };
    drone.ai!.nextThink = Infinity; drone.ai!.nextAttack = Infinity;
    sim.world.step(); sim.move({ x: 0, z: -8 }); advance(sim, 2.5);
    expect(Math.abs(sim.squad[0].body.translation().x)).toBeLessThan(.2);
    expect(sim.squad[0].body.translation().z).toBeLessThan(-7);
  });

  test("exposed player blast victims report damage; cover and enemy blasts do not", () => {
    const [exposed, protectedCart] = sim.city!.carts;
    exposed.body.setTranslation({ x: -43.5, y: .32, z: -21 }, true);
    protectedCart.body.setTranslation({ x: -38.8, y: .32, z: -21 }, true); sim.world.step();
    const protectedHP = protectedCart.hp;
    sim.city!.blast({ x: -44, y: .2, z: -21 }, undefined, "player");
    expect(exposed.hp).toBe(0); expect(protectedCart.hp).toBe(protectedHP);
    expect(sim.security!.level).toBe(2); expect(sim.grenadeHits).toBe(0);
    sim.reset("city");
    sim.city!.blast(sim.city!.carts[0].body.translation(), undefined, "enemy");
    expect(sim.security!.level).toBe(0);
  });

  test("WATCH arrives overhead, descends with finite thrust and fires at the squad", () => {
    const { a } = stage(); sim.shoot(a);
    advance(sim, WATCH.dispatchDelay + .15);
    expect(sim.security!.active).toHaveLength(2);
    const drones = [...sim.security!.active];
    expect(drones.every(a => a.body.translation().y > WATCH.hover + 5)).toBe(true);
    expect(drones.every(a => a.body.mass() > 29 && a.body.mass() < 31)).toBe(true);
    const initial = drones.map(a => a.body.translation().y);
    let shots = 0;
    for (let i = 0; i < 7 / STEP; i++) {
      sim.step(); shots += sim.events.filter(e => e.type === "shot" && drones.some(a => a.id === e.actor)).length;
      sim.events.length = 0;
    }
    expect(drones.every((a, i) => a.body.translation().y < initial[i] - 3)).toBe(true);
    expect(drones.some(a => a.flight!.state === "pursuing")).toBe(true);
    expect(shots).toBeGreaterThan(0);
    expect(drones.every(a => a.weapons.length === 1 && a.weapon === "pistol" && !a.braced)).toBe(true);
  }, 15000);

  test("bullet pressure staggers flying hulls; destroyed drones lose lift and become temporary wrecks", () => {
    harm(); sim.time = 3; sim.security!.update(); sim.world.step();
    const drone = sim.security!.active[0], initial = drone.body.translation().y;
    sim.damage(drone, 6, { x: 0, y: 0, z: 180 }, drone.body.translation(), "gun", "player");
    expect(drone.stagger).toBeGreaterThan(0); expect(drone.body.linvel().z).toBeGreaterThan(4);
    expect(drone.ai!.fire).toBe(false);
    sim.damage(drone, drone.hp, noImpulse, drone.body.translation(), "rifle", "player");
    advance(sim, .6);
    expect(drone.dead).toBe(true); expect(drone.body.translation().y).toBeLessThan(initial - .5);
    expect(drone.flight!.rotors).toBe(0);
    sim.time = drone.deathTime! + WATCH.wreckSeconds + .1; sim.security!.update();
    expect(sim.actors).not.toContain(drone);
  });

  test.each(["pursuing", "withdrawing"] as const)("%s flight lifts its whole hull past a wall that clears the centerline", state => {
    stage(); harm(); sim.time = 3; sim.security!.update();
    const drone = sim.security!.active[0], flight = drone.flight!;
    drone.body.setTranslation({ x: 0, y: 5.5, z: 0 }, true);
    drone.body.setLinvel(noImpulse, true);
    flight.state = state;
    flight.goal = { x: 0, y: state === "withdrawing" ? sim.security!.ceiling + 8 : 5.5, z: 10 };
    drone.ai!.nextThink = Infinity; drone.ai!.nextAttack = Infinity;
    // The ray misses this wall, but its edge overlaps the 1.38 m rotor/hull radius.
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(.2, 8, .4).setTranslation(1.3, 8, 4));
    sim.world.step();
    expect(sim.ray(drone.body.translation(), flight.goal, drone.body)).toBeNull();
    let maxHeight = 0, last = { ...drone.body.translation() };
    for (let i = 0; i < 7 / STEP; i++) {
      sim.step(); sim.events.length = 0;
      if (!sim.actors.includes(drone)) break;
      last = { ...drone.body.translation() }; maxHeight = Math.max(maxHeight, last.y);
    }
    expect(maxHeight).toBeGreaterThan(16.3);
    expect(last.z).toBeGreaterThan(6);
  }, 15000);

  test("sniper support aims at the thin airborne hull rather than a biped chest", () => {
    stage(); harm(); sim.time = 3; sim.security!.update();
    const drone = sim.security!.active[0];
    drone.body.setTranslation({ x: 13, y: 5.5, z: 0 }, true);
    drone.flight!.goal = { x: 13, y: 5.5, z: 0 };
    drone.flight!.state = "pursuing";
    drone.ai!.nextThink = Infinity; drone.ai!.nextAttack = Infinity;
    const other = sim.security!.active[1];
    sim.damage(other, other.hp, noImpulse, other.body.translation());
    sim.select(4); sim.chooseWeapon("rifle"); sim.toggleSniping(); sim.world.step();
    advance(sim, .25);
    const support = sim.squad[0];
    expect(support.cover!.target).toBe(drone.id);
    expect(support.cover!.aim.y).toBeCloseTo(drone.body.translation().y, 1);
    expect(sim.fireRay(support, sim.muzzle(support, support.cover!.aim), support.cover!.aim)?.collider.handle)
      .toBe(drone.collider.handle);
    advance(sim, 1);
    expect(drone.hp).toBeLessThan(WATCH.hp);
  });

  test("repeated civilian harm escalates in pairs, caps at six and quiet makes the survivors withdraw", () => {
    for (let i = 0; i < 7; i++) harm(i);
    expect(sim.security!.level).toBe(3);
    for (const time of [3, 11.1, 19.2]) { sim.time = time; sim.security!.update(); sim.world.step(); }
    expect(sim.security!.active).toHaveLength(WATCH.maxActive);
    harm(8); sim.time = 28; sim.security!.update();
    expect(sim.security!.active).toHaveLength(WATCH.maxActive);
    sim.time = 19.2 + WATCH.quietSeconds + .1; sim.security!.update();
    expect(sim.security!.level).toBe(0);
    expect(sim.security!.active.every(a => a.flight!.state === "withdrawing" && !a.ai!.fire)).toBe(true);
    for (const a of sim.security!.active) a.body.setTranslation({ ...a.body.translation(), y: sim.security!.ceiling + 7 }, true);
    sim.security!.update(); expect(sim.security!.drones).toHaveLength(0);
    harm(9); expect(sim.security!.inspect().phase).toBe("dispatched");
    sim.reset(); expect(sim.security!.inspect().phase).toBe("quiet");
    for (const range of ["proving", "long", "arena"] as const) { sim.reset(range); expect(sim.security).toBeUndefined(); }
  });

  test("Receiving's guard count and dispatch objective exclude responding WATCH drones", () => {
    sim.reset("receiving"); sim.mission!.deploy();
    const c = sim.city!.carts[0]; sim.city!.damage(c, 1, noImpulse, c.body.translation(), "player");
    sim.time = 3; sim.security!.update();
    expect(sim.security!.active).toHaveLength(2); expect(sim.mission!.enemies).toHaveLength(4);
    for (const guard of sim.mission!.enemies) sim.damage(guard, guard.hp, noImpulse, guard.body.translation(), "pistol");
    sim.mission!.updateObjectives(); expect(sim.mission!.phase).toBe("dispatch");
    expect(sim.security!.active).toHaveLength(2);
  });

  test("recorded civilian attacks reproduce dispatch, air combat and drone positions", async () => {
    stage();
    // Recording must begin from the authored floor, without fixture teleports.
    sim.reset("receiving");
    const recorder = new HumanReplayRecorder("security-test"); recorder.begin(sim);
    sim.onInput = action => recorder.action(sim, action);
    recorder.action(sim, { type: "deploy" }); sim.mission!.deploy();
    const c = sim.city!.carts[0]; sim.aim = { ...c.body.translation() }; sim.trigger = true;
    const frame = () => { recorder.beforeStep(sim); sim.step(); recorder.afterStep(sim); sim.events.length = 0; };
    for (let i = 0; i < 1 / STEP; i++) frame(); sim.release();
    for (let i = 0; i < 8 / STEP; i++) frame();
    const session = recorder.export(sim).sessions[0];
    expect(sim.security!.drones.length).toBeGreaterThan(0);
    const fresh = await Simulation.create("receiving");
    try { expect(playRecordedSession(fresh, session)).toEqual(session.final); }
    finally { fresh.world.free(); }
  }, 15000);
});
