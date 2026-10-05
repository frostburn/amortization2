import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Vector3 } from "three";
import { Simulation } from "../src/game/simulation";
import { RIFLE, STEP } from "../src/game/config";
import { SniperView } from "../src/render/scope";

describe("centred sniper sight", () => {
  let sim: Simulation, sight: SniperView;
  beforeEach(async () => {
    // These checks use the real perspective camera and physics rays; no WebGL
    // renderer is needed. Only the two status elements are replaced.
    vi.stubGlobal("document", { getElementById: () => ({ hidden: false }) });
    sim = await Simulation.create("long");
    sim.aim = { ...sim.actors.find(a => a.id === 11)!.body.translation(), y: 3.21 };
    sim.toggleSniping();
    sight = new SniperView();
    sight.aim(sim);
  });
  afterEach(() => {
    sim.world.free();
    vi.unstubAllGlobals();
  });

  test.each([[false, false], [true, false], [false, true], [true, true]])(
    "mouse turns the actual image with independent inversion: X=%s, Y=%s",
    (invertX, invertY) => {
      const point = new Vector3().copy(sim.aim);
      sight.invertX = invertX;
      sight.invertY = invertY;
      sight.look(80, 30, sim, 700);
      point.project(sight.camera);
      // Moving right normally moves the scene left; moving down brings the
      // target above the centre. Each preference reverses only its own axis.
      expect(point.x * (invertX ? 1 : -1)).toBeGreaterThan(0.05);
      expect(point.y * (invertY ? -1 : 1)).toBeGreaterThan(0.05);
    },
  );

  test("stationary centre rays do not rotate the view, and pitch stays short of vertical", () => {
    const initial = sight.inspect();
    for (let i = 0; i < 120; i++) {
      sim.step();
      sight.aim(sim);
      sight.look(0, 0, sim, 700);
    }
    expect(sight.inspect().yaw).toBe(initial.yaw);
    expect(sight.inspect().pitch).toBe(initial.pitch);
    sight.look(0, -100000, sim, 700);
    expect(sight.inspect().pitch).toBeGreaterThan(1.4);
    expect(sight.inspect().pitch).toBeLessThan(Math.PI / 2);
    sight.look(0, 200000, sim, 700);
    expect(sight.inspect().pitch).toBeLessThan(-1.4);
    expect(sight.inspect().pitch).toBeGreaterThan(-Math.PI / 2);
  });

  test("the centred sight kills an elevated target through the real muzzle ray", () => {
    for (let i = 0; i < Math.ceil((RIFLE.settle + 0.1) / STEP); i++) {
      sight.aim(sim);
      sim.step();
    }
    sim.shoot(sim.primary);
    expect(sim.actors.find(a => a.id === 11)!.killedBy).toBe("rifle");
  });
});
