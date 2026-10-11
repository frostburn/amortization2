import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import RAPIER from "@dimforge/rapier3d-compat";
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

  test.each(["low rail", "wall corner"])("a visible target clears a %s in both the scope and the shot", (cover) => {
    const target = sim.actors.find(a => a.id === 11)!;
    for (let i = 0; i < Math.ceil((RIFLE.settle + 0.1) / STEP); i++) sim.step();
    sight.aim(sim);
    const direction = sight.camera.getWorldDirection(new Vector3());
    const centre = sight.camera.position.clone().addScaledVector(direction, 3);
    const right = new Vector3(direction.z, 0, -direction.x).normalize();
    const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
    if (cover === "low rail") {
      // The optical line clears the rail, but the old lower muzzle line did not.
      sim.world.createCollider(RAPIER.ColliderDesc.cuboid(.8, .5, .8)
        .setTranslation(centre.x, centre.y - .62, centre.z), body);
    } else {
      // A corner beside the optic used to intercept the right-offset barrel.
      centre.addScaledVector(right, .25);
      sim.world.createCollider(RAPIER.ColliderDesc.cuboid(.11, .5, .11)
        .setTranslation(centre.x, centre.y, centre.z), body);
    }
    sim.world.step();
    sight.aim(sim);
    expect(sim.fireRay(sim.primary, sight.camera.position, sight.camera.position.clone().addScaledVector(sight.camera.getWorldDirection(new Vector3()), RIFLE.range))?.collider.handle).toBe(target.collider.handle);
    sim.shoot(sim.primary);
    expect(target.killedBy).toBe("rifle");
  });

  test("cover immediately in front of the scope still blocks firing instead of being skipped by barrel reach", () => {
    const target = sim.actors.find(a => a.id === 11)!;
    for (let i = 0; i < Math.ceil((RIFLE.settle + 0.1) / STEP); i++) sim.step();
    sight.aim(sim);
    const centre = sight.camera.position.clone().addScaledVector(sight.camera.getWorldDirection(new Vector3()), .4);
    const wall = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(.15, .5, .15)
      .setTranslation(centre.x, centre.y, centre.z));
    sim.world.step();
    sight.aim(sim);
    expect(sim.fireRay(sim.primary, sight.camera.position, sight.camera.position.clone().addScaledVector(sight.camera.getWorldDirection(new Vector3()), RIFLE.range))?.collider.handle).toBe(wall.handle);
    sim.shoot(sim.primary);
    expect(target.hp).toBe(target.maxHp);
    const shot = sim.events.find(e => e.type === "shot")!;
    if (shot.type !== "shot") throw Error("missing shot");
    expect(new Vector3().copy(shot.to).distanceTo(sight.camera.position)).toBeLessThan(.5);
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
