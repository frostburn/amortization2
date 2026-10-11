import { expect, test } from "vitest";
import { distance2, STEP, type Vec3 } from "../src/game/config";
import { CONCOURSE_RAILS, CONCOURSE_SURFACES } from "../src/game/concourse";
import { RECOVERY_RAILS, RECOVERY_SURFACES } from "../src/game/recovery";
import { RANGES } from "../src/game/ranges";
import { Simulation } from "../src/game/simulation";
import { WalkTerrain, surfaceHeight } from "../src/game/walk-surfaces";

const recovery = () => new WalkTerrain(RECOVERY_SURFACES, RECOVERY_RAILS,
  RANGES.recovery.barriers, RANGES.recovery.bounds);
const bridge = { x: -5, y: 4.8, z: -24 };

test.each([-5, -43])("clicking the open ramp at z=%s climbs it from street level", z => {
  const t = recovery(), ramp = t.resolve({ x: -5, z });
  expect(ramp.y).toBeCloseTo(3.8);
  expect(t.heights(ramp)).toContain(0); // There really is an underpass here.
  expect(t.movementPoint(ramp, { x: -16, y: 0, z })).toEqual(ramp);
});

test.each([7, -55])("a low ramp at z=%s implies its connected bridge rather than the street", z => {
  const t = recovery(), from = t.resolve({ x: -5, z });
  expect(from.y).toBeCloseTo(1.4);
  expect(t.movementPoint(bridge, from)).toEqual(bridge);
  const street = { x: -16, y: 0, z: -24 };
  expect(t.movementPoint(bridge, street)).toEqual({ ...bridge, y: 0 });
  expect(t.movementPoint(street, bridge)).toEqual(street);
});

test("raised route intent carries across seams and multiple connected levels", () => {
  const t = new WalkTerrain(CONCOURSE_SURFACES, CONCOURSE_RAILS,
    RANGES.concourse.barriers, RANGES.concourse.bounds);
  const from = { x: -26, y: .8, z: 11 }, gallery = { x: 0, y: 8.4, z: -45 };
  expect(t.movementPoint(gallery, from)).toEqual(gallery);
  expect(t.movementPoint({ x: 26, y: 4.8, z: -16 }, gallery).y).toBe(4.8);
});

test.each(["gap", "step"])("an unrelated raised surface across a %s does not imply bridge access", kind => {
  const surfaces = [
    { id: "ramp", x: 0, z: 0, w: 8, d: 14, height: 1.4, slopeZ: -.2, thickness: .4, filled: true },
    { id: "deck", x: 0, z: kind === "gap" ? -14 : -12, w: 8, d: 10, height: 4.8, thickness: .4 },
  ];
  const t = new WalkTerrain(surfaces, [], [], { left: -30, right: 30, back: -30, front: 30 });
  expect(t.movementPoint({ x: 0, y: 4.8, z: surfaces[1].z }, { x: 0, y: 1.4, z: 0 }).y).toBe(0);
});

test("x-axis ramps communicate climbing intent too", () => {
  const ramp = { id: "ramp", x: 0, z: 0, w: 24, d: 8, height: 2.4, slopeX: .2, thickness: .4 };
  const t = new WalkTerrain([ramp], [], [], { left: -30, right: 30, back: -30, front: 30 });
  const p = { x: 8, y: surfaceHeight(ramp, { x: 8, z: 0 }), z: 0 };
  expect(t.movementPoint(p, { x: -15, y: 0, z: 0 })).toEqual(p);
});

test("a square squad follows inferred ramp and bridge orders without switching to the underpass", async () => {
  const sim = await Simulation.create("recovery");
  try {
    // Exercise the real district's movement/physics, without convoy combat.
    sim.mission = undefined; sim.select(5);
    const arrive = (p: Vec3) => {
      sim.move(sim.terrain!.movementPoint(p, sim.walkingPoint(sim.primary)));
      const arrived = () => sim.active.every(a => !!a.moveTarget && !a.path.length &&
        distance2(sim.walkingPoint(a), a.moveTarget) < .15 &&
        Math.abs(sim.walkingPoint(a).y - a.moveTarget.y!) < .12);
      for (let i = 0; i < 40 / STEP && !arrived(); i++) sim.step();
      expect(arrived(), JSON.stringify(sim.active.map(a => ({p:sim.walkingPoint(a), goal:a.moveTarget, path:a.path})))).toBe(true);
    };
    arrive({ x: -5, y: 1.4, z: 7 });
    expect(sim.walkingPoint(sim.primary).y).toBeLessThan(2.4);
    arrive(bridge);
    expect(sim.active.every(a => a.moveTarget!.y === 4.8)).toBe(true);
    arrive({ x: -5, y: 3.8, z: -43 });
    arrive({ x: -5, y: 0, z: -65 });
    expect(sim.active.every(a => Math.abs(sim.walkingPoint(a).y) < .12)).toBe(true);
  } finally { sim.world.free(); }
}, 20000);
