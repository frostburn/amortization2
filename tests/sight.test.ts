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

  test("a settled shot converges on the reticle after turning away from the robot's heading", () => {
    for (let i = 0; i < Math.ceil((RIFLE.settle + 0.1) / STEP); i++) sim.step();
    sight.look(100, -65, sim, 700);
    const aim = new Vector3().copy(sim.aim), centred = aim.clone().project(sight.camera);
    expect(Math.abs(centred.x) + Math.abs(centred.y)).toBeLessThan(1e-6);
    sim.primary.yaw = -Math.PI / 2;
    sim.shoot(sim.primary);
    const shot = sim.events.find(e => e.type === "shot" && e.actor === sim.primary.id)!;
    if (shot.type !== "shot") throw Error("missing shot");
    const from = new Vector3().copy(shot.from), direction = new Vector3().copy(shot.to).sub(from).normalize();
    const expected = aim.clone().sub(from).normalize();
    expect(direction.distanceTo(expected)).toBeLessThan(1e-6);
    expect(sim.rifleSpread(sim.primary)).toBeGreaterThan(0); // The fired shot restarts settling.
  });

  test("a teammate crossing the fixed optic intercepts its aim ray and actual rifle shot", () => {
    const ally = sim.squad[0], target = sim.actors.find(a => a.id === 11)!;
    ally.body.setTranslation({ x: 4, y: 0.98, z: 0 }, true);
    sim.world.step();
    const yaw = sight.inspect().yaw, pitch = sight.inspect().pitch;
    expect(sim.ray(sight.camera.position, sim.aim, sim.primary.body)?.collider.handle).toBe(ally.collider.handle);
    for (let i = 0; i < Math.ceil((RIFLE.settle + 0.1) / STEP); i++) {
      sight.aim(sim);
      sim.step();
    }
    expect(sim.aim.x).toBeGreaterThan(3);
    expect(sim.aim.x).toBeLessThan(4);
    expect(sight.inspect().yaw).toBe(yaw);
    expect(sight.inspect().pitch).toBe(pitch);
    sim.shoot(sim.primary);
    expect(ally.hp).toBe(ally.maxHp - RIFLE.damage);
    expect(ally.stability).toBeLessThan(1);
    expect(target.hp).toBe(target.maxHp);
    expect(sim.shots).toBe(1);
    expect(sim.hits).toBe(0);
  });
});
