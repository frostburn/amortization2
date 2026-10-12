import { afterEach, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { STEP, distance2 } from "../src/game/config";
let sim: Simulation;
afterEach(() => sim?.world.free());
const ticks = (seconds: number) => { for (let i=0;i<seconds/STEP;i++) { sim.step(); sim.events.length=0; } };
const setup = async () => {
  sim = await Simulation.create("arena", "assault", "practice");
  const wreck = sim.addEnemy("minigunner", {x:-30,z:10}); wreck.yaw = .7;
  sim.damage(wreck, wreck.hp, {x:0,y:0,z:0}, wreck.body.translation(), "gun");
  return wreck;
};
test("disabled chassis settle onto a preferred back panel and remain still", async () => {
  const wreck = await setup(); expect(wreck.body.mass()).toBeCloseTo(130, 2); ticks(8);
  const q = wreck.body.rotation(), target = wreck.wreckRotation!;
  expect(Math.abs(q.x*target.x+q.y*target.y+q.z*target.z+q.w*target.w)).toBeGreaterThan(.98);
  expect(Math.hypot(...Object.values(wreck.body.angvel()))).toBeLessThan(.08);
  const p = {...wreck.body.translation()}; ticks(2);
  expect(distance2(p,wreck.body.translation())).toBeLessThan(.05);
  const mass = wreck.body.mass();
  wreck.body.applyImpulse({x:mass*4,y:mass*4,z:0},true); ticks(.15);
  expect(wreck.body.translation().y).toBeGreaterThan(p.y+.2);
});
test("a movement order physically pushes a heavy wreck aside without steering around it", async () => {
  const wreck = await setup(); ticks(8);
  const actor = sim.squad[0], start={...wreck.body.translation()};
  actor.body.setTranslation({x:-34,y:.96,z:10},true); actor.body.setLinvel({x:0,y:0,z:0},true);
  sim.select(1); sim.world.step(); sim.move({x:-25,z:10}); ticks(5);
  expect(actor.body.translation().x).toBeGreaterThan(-26);
  expect(distance2(start,wreck.body.translation())).toBeGreaterThan(.25);
  expect(Math.abs(actor.body.translation().z-10)).toBeLessThan(.4);
});
