import RAPIER from "@dimforge/rapier3d-compat";
import { afterEach, describe, expect, test } from "vitest";
import { Simulation, type Actor } from "../src/game/simulation";
import { NightForestMission } from "../src/game/night-forest-mission";
import { NIGHT_CONVOY_END, NIGHT_SITES, NIGHT_ROLL_DELAY, forestPoint } from "../src/game/night-forest";
import { STEP } from "../src/game/config";
import { levelsForMode } from "../src/game/modes";
import { NEXT_CONTRACT } from "../src/game/missions";

describe("Night Shift: two fronts and optical contacts", () => {
  let sim: Simulation;
  afterEach(() => sim?.world.free());
  const mission = () => sim.mission as NightForestMission;
  const ticks = (seconds: number) => { for (let i = 0; i < seconds / STEP; i++) { sim.step(); sim.events.length = 0; } };
  const place = (a: Actor, x: number, z: number) => { a.body.setTranslation(forestPoint({ x, z }, a.flight ? 4.5 : .96), true); a.body.setLinvel({ x: 0, y: 0, z: 0 }, true); a.path = []; a.moveTarget = undefined; };

  test.each(["assault", "sniper", "minigunner"] as const)("selectable %s squad, separate convoy bays, and a clean reset", async model => {
    sim = await Simulation.create("nightforest", model);
    expect(NEXT_CONTRACT.forest).toBe("nightforest");
    expect(levelsForMode("mission")).toContain("nightforest");
    expect(levelsForMode("arena")).toContain("nightforest");
    expect(sim.squad[3].model).toBe(model);
    expect(mission().convoy.map(c => c.model)).toEqual(["VAN", "TRUCK"]);
    expect(sim.night).toBeDefined();
    ticks(1); expect(sim.time).toBe(0);
    mission().deploy(); ticks(.2);
    sim.reset(); expect(mission().occupation).toBe(0); expect(mission().droneWaves).toBe(0);
    expect(mission().convoy.every(c => c.parked && c.hp > 0)).toBe(true);
    sim.reset("forest"); expect(sim.night).toBeUndefined();
  }, 15000);

  test("convoy waits through deployment setup, then physically drives east on the flat track", async () => {
    sim = await Simulation.create("nightforest"); mission().deploy();
    const start = mission().convoy.map(c => c.body.translation().x);
    ticks(.3); expect(mission().rolling).toBe(false);
    sim.time = NIGHT_ROLL_DELAY; sim.step();
    expect(mission().rolling).toBe(true);
    expect(mission().convoy.map(c => c.arrival)).toEqual(NIGHT_CONVOY_END);
    // Isolate driving across several terrain seams from the authored encounter.
    mission().groundEnemies.forEach(a => sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun"));
    mission().groundWaves = 3; mission().droneWaves = 4;
    ticks(12);
    mission().convoy.forEach((c, i) => { expect(c.body.translation().x).toBeGreaterThan(start[i] + 16); expect(Math.abs(c.body.translation().z - 37)).toBeLessThan(.3); });
  });

  test("authored pistol drones target unprotected supplies, while a nearby escort draws fire", async () => {
    sim = await Simulation.create("nightforest"); mission().deploy(); sim.time = 16;
    sim.squad.forEach(a => place(a, -60, -40)); sim.step();
    expect(mission().drones).toHaveLength(2);
    expect(mission().drones.every(a => a.weapon === "pistol" && a.flight!.contract)).toBe(true);
    const drone = mission().drones[0], van = mission().convoy[0], p = van.body.translation();
    place(drone, p.x + 8, p.z - 3); drone.ai!.nextThink = 0; drone.ai!.nextAttack = 0; sim.world.step();
    const hp = van.hp; ticks(1);
    expect(drone.ai!.target).toBe(van.id);
    expect(van.hp).toBeLessThan(hp);
    place(sim.squad[0], p.x + 3, p.z - 5); sim.world.step(); drone.ai!.nextThink = 0;
    sim.step(); expect(drone.ai!.target).toBe(sim.squad[0].id);
    expect(drone.flight!.goal.x).toBeCloseTo(van.body.translation().x + 10, 0);
    expect(drone.flight!.goal.z).toBe(39);
  });

  test("a drone above an obsolete tree detour resumes pursuit of the moving convoy", async () => {
    sim = await Simulation.create("nightforest"); mission().deploy(); sim.time = 16;
    sim.squad.forEach(a => place(a, -60, -40)); sim.step();
    mission().groundWaves = 3; mission().droneWaves = 4;
    mission().groundEnemies.forEach(a => sim.damage(a,a.hp,{x:0,y:0,z:0},a.body.translation(),"gun"));
    const drone = mission().drones[0];
    drone.body.setTranslation({x:-48,y:sim.security!.ceiling,z:25},true);
    drone.flight!.transit = {goal:{x:-48,y:4.5,z:25},stage:"descend"};
    drone.ai!.nextThink = 0;
    ticks(12);
    const vehicle = mission().convoy.find(c=>c.id===drone.ai!.target)!;
    expect(vehicle).toBeDefined();
    expect(drone.flight!.goal.x-vehicle.body.translation().x).toBeCloseTo(10,0);
    expect([35,39]).toContain(drone.flight!.goal.z);
    expect(drone.flight!.transit).toBeUndefined();
    expect(drone.body.translation().y).toBeLessThan(drone.flight!.hover+1);
    expect(Math.hypot(drone.body.translation().x-drone.flight!.goal.x,
      drone.body.translation().z-drone.flight!.goal.z)).toBeLessThan(4);
  });

  test("an abandoned clearing builds a foothold; friendly presence contests it and clearing it reverses pressure", async () => {
    sim = await Simulation.create("nightforest"); mission().deploy();
    sim.squad.forEach(a => place(a, -60, 37)); place(mission().groundEnemies[0], 12, -8);
    mission().occupation = .3; mission().updateObjectives(); expect(mission().occupation).toBeGreaterThan(.3);
    place(sim.squad[0], 12, 4); const occupied = mission().occupation;
    mission().updateObjectives(); expect(mission().contested).toBe(true); expect(mission().occupation).toBe(occupied);
    mission().groundEnemies.forEach(a => sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun"));
    mission().updateObjectives(); expect(mission().occupation).toBeLessThan(occupied);
  });

  test("supply loss and an established foothold fail, while receiving supplies alone cannot finish", async () => {
    sim = await Simulation.create("nightforest"); mission().deploy();
    mission().convoy.forEach((c, i) => c.body.setTranslation({ ...NIGHT_CONVOY_END[i], y: c.body.translation().y }, true));
    mission().updateObjectives(); expect(mission().arrivedAt).toBeDefined(); expect(mission().phase).toBe("hold");
    mission().occupation = 1; mission().updateObjectives(); expect(mission().phase).toBe("failed");
    sim.reset(); mission().deploy(); mission().convoy[0].hp = 0; mission().updateObjectives();
    expect(mission().phase).toBe("failed"); expect(mission().failureReason).toMatch(/supply vehicle/);
  });

  test("completion requires both vehicles, all responses defeated, and surviving robots assembled", async () => {
    sim = await Simulation.create("nightforest"); mission().deploy();
    mission().convoy.forEach((c, i) => c.body.setTranslation({ ...NIGHT_CONVOY_END[i], y: c.body.translation().y }, true));
    mission().groundWaves = 3; mission().droneWaves = 4;
    mission().groundEnemies.forEach(a => sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun"));
    mission().updateObjectives(); expect(mission().phase).toBe("return");
    expect(mission().returnProgress).toBe(0);
    sim.squad.forEach((a, i) => place(a, NIGHT_SITES.receiving.x + i, NIGHT_SITES.receiving.z - 6));
    for (let i = 0; i < 61; i++) mission().updateObjectives(); expect(mission().phase).toBe("complete");
  });

  test("night sensors refresh hull identities when an enemy is replaced without changing actor count", async () => {
    sim = await Simulation.create("nightforest", "assault", "practice");
    sim.squad.forEach(a => place(a, -50, 37));
    const first = sim.addEnemy("assault", { x: -40, z: 37 }); sim.world.step();
    expect(sim.canSee(sim.squad[0], first)).toBe(true);
    const count = sim.actors.length; sim.retireEnemy(first);
    const replacement = sim.addEnemy("assault", { x: -40, z: 37 }); sim.world.step();
    expect(sim.actors).toHaveLength(count);
    expect(sim.canSee(sim.squad[0], replacement)).toBe(true);
    expect(sim.canSee(replacement, sim.squad[0])).toBe(true);
  });

  test("convoy friendly fire still damages supplies but never summons unrelated civilian security", async () => {
    sim = await Simulation.create("nightforest");
    const van = mission().convoy[0], p = { ...van.body.translation() }, zero = { x: 0, y: 0, z: 0 };
    sim.city!.damage(van, 5, zero, p, "player", p);
    expect(van.hp).toBe(315); expect(sim.security!.pressure).toBe(0);
    sim.world.step(); sim.city!.blast({ ...p, y: .4 }, undefined, "player");
    expect(van.hp).toBeLessThan(315); expect(sim.security!.pressure).toBe(0);
    const civilian = sim.city!.traffic.park("CAB", 0x8a9c98, { x: 50, z: 37 }, 0);
    sim.city!.damage(civilian, 5, zero, civilian.body.translation(), "player");
    expect(sim.security!.pressure).toBeGreaterThan(0);
  });

  test("cover sectors cannot acquire dark hostiles outside the local sensor range", async () => {
    sim = await Simulation.create("nightforest", "assault", "practice");
    sim.squad.forEach(a => place(a, -50, 37));
    const target = sim.addEnemy("assault", { x: -20, z: 37 }); sim.world.step();
    sim.select(1); sim.coverSector({ x: -20, z: 37 }); ticks(.2);
    expect(sim.squad[0].cover!.target).toBeNull(); expect(sim.coverShots).toBe(0);
    sim.night!.flash({ ...target.body.translation(), y: 1.5 }, 1.5); ticks(1.1);
    expect(sim.squad[0].cover!.target).toBe(target.id); expect(sim.coverShots).toBeGreaterThan(0);
  });

  test("darkness, flashes and physical obstruction govern contacts, without any camera input", async () => {
    sim = await Simulation.create("nightforest", "assault", "practice");
    const observer = sim.squad[0], target = sim.addEnemy("assault", { x: -20, z: 37 });
    sim.squad.forEach(a => place(a, -50, 37)); sim.world.step();
    expect(sim.canSee(observer, target)).toBe(false); sim.night!.update(); expect(sim.isDetected(target)).toBe(false);
    const p = target.body.translation(); sim.night!.flash({ ...p, y: p.y + .4 });
    expect(sim.canSee(observer, target)).toBe(true); sim.night!.update(); expect(sim.isDetected(target)).toBe(true);
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(.3, 3, 4).setTranslation(-35, 3, 37)); sim.world.step();
    expect(sim.canSee(observer, target)).toBe(false);
    sim.time += .5; sim.night!.update(); expect(sim.isDetected(target)).toBe(false);
  });
});
