import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { OrthographicCamera, Plane, Raycaster, Vector3 } from "three";
import { FIREARMS, type Vec3 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";
import { RangeScene } from "../src/render/scene";
import { TACTICAL_CAMERA_OFFSET } from "../src/render/tactical-camera";

describe("automatic upper-body aim", () => {
  let sim: Simulation, scene: RangeScene;
  beforeEach(async () => {
    sim = await Simulation.create("arena", "minigunner");
    sim.arena!.countdown = 100;
    const camera = new OrthographicCamera(-44.8, 44.8, 28, -28, 0.1, 400);
    camera.position.copy(TACTICAL_CAMERA_OFFSET);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    // Exercise the actual scene picker and Rapier rays without a GPU renderer.
    scene = Object.assign(Object.create(RangeScene.prototype) as RangeScene, {
      sim, camera, raycaster: new Raycaster(),
      groundPlane: new Plane(new Vector3(0, 1, 0), 0),
      canvas: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 1440, height: 900 }) },
    });
  });
  afterEach(() => sim.world.free());

  function pick(point: Vec3, groundOnly = false) {
    const screen = scene.project(point);
    return scene.pick(screen.x, screen.y, groundOnly)!;
  }

  test.each([1, 4])("operator %s clears a low barrier while aiming at empty ground beyond a target", (id) => {
    sim.select(id);
    sim.primary.body.setTranslation({ x: -19, y: 0.96, z: 16 }, true);
    const enemy = sim.addEnemy("assault", { x: -19, z: 5 });
    for (let i = 0; i < 20; i++) sim.step();
    const cursor = { x: -19, y: 0, z: -5 };
    const selected = pick(cursor);
    expect(selected.actor).toBeUndefined();
    expect(selected.ground.x).toBeCloseTo(cursor.x);
    expect(selected.ground.z).toBeCloseTo(cursor.z);
    sim.aim = selected.aim;
    expect(sim.fireRay(sim.primary, sim.muzzle(sim.primary), sim.aim)?.collider.handle).toBe(enemy.collider.handle);
    expect(sim.aimTrace(sim.primary).to.z).toBeGreaterThan(4.5);
    sim.primary.spin = 1;
    sim.shoot(sim.primary);
    expect(enemy.hp).toBe(enemy.maxHp - FIREARMS[sim.primary.weapon].damage);
    expect(sim.hits).toBe(1);
  });

  test.each([1, 4])("operator %s keeps a leg hover above low cover", (id) => {
    sim.select(id);
    sim.primary.body.setTranslation({ x: -19, y: 0.96, z: 16 }, true);
    const enemy = sim.addEnemy("assault", { x: -19, z: 5 });
    for (let i = 0; i < 20; i++) sim.step();
    const p = enemy.body.translation();
    const selected = pick({ ...p, y: p.y - 0.4 });
    expect(selected.actor).toBe(enemy.id);
    sim.aim = selected.aim;
    expect(sim.fireRay(sim.primary, sim.muzzle(sim.primary), sim.aim)?.collider.handle).toBe(enemy.collider.handle);
    sim.primary.spin = 1;
    sim.shoot(sim.primary);
    expect(sim.hits).toBe(1);
  });

  test("tall crates still block the default line and the actual shot", () => {
    sim.select(1);
    sim.primary.body.setTranslation({ x: -19, y: 0.96, z: -4 }, true);
    const enemy = sim.addEnemy("assault", { x: -19, z: -17 });
    for (let i = 0; i < 20; i++) sim.step();
    sim.aim = pick({ x: -19, y: 0, z: -23 }).aim;
    expect(sim.aimTrace(sim.primary).to.z).toBeGreaterThan(-12);
    sim.shoot(sim.primary);
    expect(enemy.hp).toBe(enemy.maxHp);
    expect(sim.hits).toBe(0);
  });

  test.each([1, 4])("operator %s can aim at and knock around a dropped PORTER tote", (id) => {
    sim.reset("port", "minigunner"); sim.select(id);
    const cargo = sim.city!.porters[0].cargo;
    cargo.body.setTranslation({ x: 6, y: 0.4, z: 4 }, true);
    if (id === 4) cargo.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    sim.primary.body.setTranslation({ x: 2, y: 0.96, z: 4 }, true);
    for (let i = 0; i < 30; i++) sim.step();
    const before = { ...cargo.body.translation() }, selected = pick(before);
    expect(selected.actor).toBeUndefined(); expect(selected.aim.y).toBeLessThan(0.8);
    sim.aim = selected.aim;
    expect(sim.fireRay(sim.primary, sim.muzzle(sim.primary), sim.aim)?.collider.parent()?.handle).toBe(cargo.body.handle);
    sim.primary.spin = 1; sim.setBrace(true); sim.shoot(sim.primary);
    expect(cargo.body.linvel().x).toBeGreaterThan(0.8);
    expect(sim.shots).toBe(1); expect(sim.hits).toBe(0);
    for (let i = 0; i < 15; i++) sim.step();
    expect(cargo.body.translation().x - before.x).toBeGreaterThan(0.02);
    // Movement and grenade placement still resolve the same cursor to the floor.
    expect(pick({ ...cargo.body.translation() }, true).aim.y).toBeGreaterThan(1);
    expect(pick({ ...cargo.body.translation() }, true).ground.y).toBe(0);
  });

  test("elevated silhouettes keep their height while movement and grenades use the ground", () => {
    sim.reset("long", "sniper");
    sim.select(1);
    for (let i = 0; i < 20; i++) sim.step();
    const target = sim.actors.find(a => a.id === 11)!;
    const p = target.body.translation();
    const cursor = { ...p, y: p.y + 0.6 };
    const raised = pick(cursor);
    expect(raised.actor).toBe(target.id);
    expect(raised.aim.y).toBeGreaterThan(3.5);
    const ground = pick(cursor, true);
    expect(ground.ground.y).toBe(0);
    expect(ground.ground).toEqual(raised.ground);
    expect(ground.aim.y).toBeLessThan(2);
    sim.chooseWeapon("grenade");
    expect(pick(cursor, true).ground).toEqual(raised.ground);
    sim.select(4);
    sim.chooseWeapon("rifle");
    const rifle = pick(cursor);
    expect(rifle.aim.y).toBeGreaterThan(3.5);
    sim.toggleSniping();
    expect(scene.pick(720, 450)).toBeNull();
  });
});
