import RAPIER from "@dimforge/rapier3d-compat";
import { afterEach, describe, expect, test } from "vitest";
import { Simulation, type Actor } from "../src/game/simulation";
import { HeightField } from "../src/game/height-field";
import { FOREST_GROUND, FOREST_SITES } from "../src/game/forest";
import { ForestMission, FOREST_HOLD_SECONDS } from "../src/game/forest-mission";
import { NEXT_CONTRACT } from "../src/game/missions";
import { STEP, distance2 } from "../src/game/config";
import { levelsForMode } from "../src/game/modes";

describe("Timber Rights and shared natural terrain", () => {
  let sim: Simulation;
  afterEach(() => sim?.world.free());
  const ticks = (seconds: number) => { for (let i = 0; i < seconds / STEP; i++) { sim.step(); sim.events.length = 0; } };
  const mission = () => sim.mission as ForestMission;
  const place = (a: Actor, p: { x: number; z: number }) => {
    a.body.setTranslation({ ...p, y: FOREST_GROUND.heightAt(p) + .93 }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true); a.path = []; a.moveTarget = undefined;
  };
  const kill = () => mission().enemies.forEach(a => sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun"));
  const stop = () => mission().rigs.forEach(r => mission().damageFixture(r.collider, r.maxHp));
  const seal = () => { sim.squad.forEach(a=>a.hp=a.maxHp=10000); stop(); kill(); place(sim.squad[0], {x: 31, z: 2}); ticks(2.2); expect(mission().phase).toBe("hold"); };

  test("mesh triangles, height lookup and real Rapier ray hits agree on both sides of a cell diagonal", async () => {
    sim = await Simulation.create("long");
    const f = new HeightField({left: 0, right: 8, back: 0, front: 8}, 4, (x,z) => x*x*.03 + z*z*.02);
    const world = new RAPIER.World({x:0,y:-9.81,z:0});
    try {
      world.createCollider(RAPIER.ColliderDesc.trimesh(f.vertices, f.indices)); world.step();
      for (const p of [{x:1,z:1},{x:3,z:3},{x:4.8,z:5.2},{x:6.4,z:7.1}]) {
        const hit = world.castRay(new RAPIER.Ray({...p,y:10},{x:0,y:-1,z:0}),20,true)!;
        expect(10-hit.timeOfImpact).toBeCloseTo(f.heightAt(p),5);
        expect(f.pick({...p,y:10},{x:0,y:-1,z:0})!.y).toBeCloseTo(f.heightAt(p),5);
      }
    } finally { world.free(); }
  });

  test("squad walks up and down a real ridge and formation destinations follow local ground", async () => {
    sim = await Simulation.create("forest", "assault", "practice");
    expect(FOREST_GROUND.maxHeight).toBeGreaterThan(5);
    for (const point of [{x:-32,z:20},{x:-22,z:-8}]) {
      sim.move(point);
      expect(sim.moveDestinations(point)).toHaveLength(4);
      for (const a of sim.squad) expect(a.moveTarget!.y).toBeCloseTo(FOREST_GROUND.heightAt(a.moveTarget!),5);
      for(let i=0;i<35/STEP;i++){sim.step();if(sim.squad.every(a=>!a.path.length))break;}
      for (const a of sim.squad) {
        expect(distance2(a.body.translation(), a.moveTarget!)).toBeLessThan(.3);
        expect(Math.abs(sim.walkingPoint(a).y - FOREST_GROUND.heightAt(a.body.translation()))).toBeLessThan(.07);
      }
    }
  }, 15000);

  test.each(["sniper", "minigunner", "assault"] as const)("%s squad starts safely; contract and arena both select the woodland", async model => {
    sim = await Simulation.create("forest", model);
    expect(NEXT_CONTRACT.recovery).toBe("forest");
    expect(levelsForMode("mission")).toContain("forest"); expect(levelsForMode("arena")).toContain("forest");
    expect(sim.squad[3].model).toBe(model); expect(sim.pistolsOnly).toBe(false);
    ticks(15); expect(sim.time).toBe(0); expect(mission().phase).toBe("briefing");
    mission().deploy(); ticks(12);
    expect(mission().enemyShots).toBe(0); expect(mission().responseCount).toBe(0);
    expect(sim.squad.every(a=>a.hp===a.maxHp)).toBe(true);
  }, 15000);

  test("an actual rifle shot damages a felling rig, stopping it leaves solid cover", async () => {
    sim = await Simulation.create("forest"); mission().deploy();
    const a=sim.squad[3],r=mission().rigs[0]; place(a,{x:r.x-10,z:r.z});
    sim.select(4); sim.chooseWeapon("rifle"); sim.setBrace(true); ticks(.8);
    sim.aim={x:r.x,y:r.y+1.8,z:r.z}; sim.shoot(a);
    expect(r.hp).toBe(80); expect(mission().alertedAt).toBeDefined();
    mission().damageFixture(r.collider,80);
    expect(mission().stoppedRigs).toBe(1);
    expect(sim.world.getCollider(r.collider)).toBeTruthy();
    expect(sim.terrain!.canStand({...r,y:r.y})).toBe(false);
  },15000);

  test("low-cover assistance remains relative to the ground on a wooded hill", async () => {
    sim=await Simulation.create("forest","assault","practice"); const a=sim.squad[0]; place(a,{x:-18,z:6});
    const ground={x:-18,z:-3}, low={...ground,y:FOREST_GROUND.heightAt(ground)+.05};
    const raised={...ground,y:FOREST_GROUND.heightAt(ground)+1.65};
    sim.world.step();
    expect(sim.clearsLowCover(a,low,raised)).toBe(true);
  });

  test("grenade pressure damages a nearby rig but solid terrain blocks it", async () => {
    sim=await Simulation.create("forest"); mission().deploy(); const r=mission().rigs[0];
    const origin={x:r.x-3.8,y:r.y+1.2,z:r.z}; mission().blastFixtures(origin);
    expect(r.hp).toBeLessThan(r.maxHp); const hp=r.hp;
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(.15,2,4).setTranslation(r.x-3.2,r.y+2,r.z));sim.world.step();
    mission().blastFixtures(origin);expect(r.hp).toBe(hp);
  });

  test("terminal is contested, requires both rigs, and calls exactly two finite response squads", async () => {
    sim=await Simulation.create("forest");mission().deploy();sim.squad.forEach(a=>a.hp=a.maxHp=10000);place(sim.squad[0],{x:31,z:2});
    const guard=mission().enemies[0];place(guard,{x:33,z:-5});guard.ai!.rally=sim.terrain!.resolve({x:33,z:-5});ticks(2.2);
    expect(mission().sealedAt).toBeUndefined();stop();ticks(2.2);
    expect(mission().phase).toBe("secure");expect(mission().contested).toBe(true);
    kill();ticks(2.2);expect(mission().phase).toBe("hold");ticks(5.2);
    expect(mission().responseCount).toBe(1);expect(mission().enemies).toHaveLength(3);kill();ticks(12.2);
    expect(mission().responseCount).toBe(2);expect(mission().enemies).toHaveLength(3);kill();ticks(40);
    expect(mission().responseCount).toBe(2);expect(mission().phase).toBe("hold"); // Nobody in the clearing.
  },15000);

  test("hold pauses when contested, requires a robot in the clearing, then all survivors must extract", async () => {
    sim=await Simulation.create("forest");mission().deploy();seal();ticks(18);kill();
    place(sim.squad[0],FOREST_SITES.clearing);ticks(5);const progress=mission().holdProgress;expect(progress).toBeGreaterThan(0);
    place(sim.squad[0],FOREST_SITES.entry);ticks(3);expect(mission().holdProgress).toBe(progress);
    place(sim.squad[0],FOREST_SITES.clearing);ticks(FOREST_HOLD_SECONDS);
    expect(mission().phase).toBe("return");ticks(2);expect(mission().finished).toBe(false);
    sim.squad.forEach(a=>place(a,{x:FOREST_SITES.entry.x+(a.id%2?1:-1),z:FOREST_SITES.entry.z+(a.id>2?1:-1)}));ticks(1.2);
    expect(mission().phase).toBe("complete");
  },15000);

  test("arena robots spawn on hill height and can leave their entrances", async () => {
    sim=await Simulation.create("forest","sniper","arena");ticks(6.2);
    expect(sim.mission).toBeUndefined(); expect(sim.arena!.enemies.length).toBeGreaterThan(0);
    for(const a of sim.arena!.enemies)expect(Math.abs(sim.walkingPoint(a).y-FOREST_GROUND.heightAt(a.body.translation()))).toBeLessThan(.1);
    ticks(4);expect(sim.arena!.enemies.some(a=>a.path.length>0||a.ai!.visible)).toBe(true);
  },15000);
});
