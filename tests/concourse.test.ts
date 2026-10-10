import { afterEach, describe, expect, test } from "vitest";
import { CONCOURSE_RAILS, CONCOURSE_SURFACES } from "../src/game/concourse";
import { STEP, distance2, grenadeVelocity, type Vec2 } from "../src/game/config";
import { RANGES } from "../src/game/ranges";
import { SurfaceNavigation, WalkTerrain, surfaceHeight, surfacePrism } from "../src/game/walk-surfaces";
import { Simulation } from "../src/game/simulation";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay } from "../src/game/replay";
import { ConcourseView } from "../src/render/concourse";
import { VEHICLES, vehicleFootprint } from "../src/game/traffic";
import * as THREE from "three";

const terrain = () => new WalkTerrain(CONCOURSE_SURFACES, CONCOURSE_RAILS,
  RANGES.concourse.barriers, RANGES.concourse.bounds);
describe("raised debug district", () => {
  let sim: Simulation | undefined;
  afterEach(() => { sim?.world.free(); sim = undefined; });
  const ticks = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim!.step(); };
  const arrive = (goal: Vec2, seconds = 45) => {
    sim!.move(goal);
    const arrived = () => sim!.active.every(a => !a.path.length && !!a.moveTarget &&
      distance2(a.body.translation(), a.moveTarget) < .15 &&
      Math.abs(sim!.walkingPoint(a).y - (a.moveTarget.y ?? 0)) < .12);
    for (let i = 0; i < seconds / STEP && !arrived(); i++) sim!.step();
    expect(arrived(), JSON.stringify(sim!.active.map(a => ({ id: a.id, p: a.body.translation(),
      path: a.path, goal: a.moveTarget })))).toBe(true);
  };

  test("ramps and deck prisms share exact top heights and closed physical bottoms", () => {
    for (const s of CONCOURSE_SURFACES) {
      const data = surfacePrism(s);
      expect(data.vertices).toHaveLength(24); expect(data.indices).toHaveLength(36);
      for (let i = 0; i < 4; i++) {
        const x = data.vertices[i * 3], y = data.vertices[i * 3 + 1], z = data.vertices[i * 3 + 2];
        expect(y).toBeCloseTo(surfaceHeight(s, { x, z }), 5);
        expect(data.vertices[(i + 4) * 3 + 1]).toBeCloseTo(s.filled ? -.12 : y - s.thickness, 5);
      }
    }
  });

  test("street and overhead decks remain distinct layers; retaining walls cannot be climbed", () => {
    const t = terrain(), nav = new SurfaceNavigation(t);
    expect(t.canStand({ x: 0, y: 0, z: -16 })).toBe(true);
    expect(t.canStand({ x: 0, y: 4.8, z: -16 })).toBe(true);
    expect(t.segmentClear({ x: -36, y: 0, z: -16 }, { x: -26, y: 4.8, z: -16 })).toBe(false);
    expect(nav.findPath({ x: 0, y: 0, z: 10 }, { x: 0, y: 0, z: -32 })).toEqual([{ x: 0, y: 0, z: -32 }]);
    const path = nav.findPath({ x: -36, y: 0, z: -16 }, { x: 0, y: 4.8, z: -16 });
    expect(path.length).toBeGreaterThan(1);
    expect(path.some(p => p.z > -5)).toBe(true);
    expect(path.at(-1)).toEqual({ x: 0, y: 4.8, z: -16 });
    path.forEach((p, i) => expect(t.segmentClear(i ? path[i - 1] : { x: -36, y: 0, z: -16 }, p)).toBe(true));
  });

  test("surface picking resolves raised paving while a nearby street click stays at zero", () => {
    const t = terrain();
    expect(t.pick({ x: 0, y: 30, z: -16 }, { x: 0, y: -1, z: 0 }).y).toBeCloseTo(4.8);
    expect(t.pick({ x: -26, y: 30, z: 3 }, { x: 0, y: -1, z: 0 }).y).toBeCloseTo(2.4);
    expect(t.pick({ x: 0, y: 30, z: 16 }, { x: 0, y: -1, z: 0 }).y).toBe(0);
  });

  test("thin railings block the body footprint even when its corner samples miss the wall", () => {
    const rail = { id: "thin-rail", x: 0, z: 0, w: .18, d: 8, height: 1, thickness: 1 };
    const bounds = { left: -10, right: 10, back: -10, front: 10 };
    const t = new WalkTerrain([], [rail], [], bounds);
    expect(t.canStand({ x: .4, y: 0, z: 0 })).toBe(false);
    expect(t.canStand({ x: .7, y: 0, z: 0 })).toBe(true);
    const raised = new WalkTerrain([{ id: "deck", x: 0, z: 0, w: 12, d: 12, height: 4.8, thickness: .4 }],
      [{ ...rail, height: 5.8, slopeZ: .2 }], [], bounds);
    expect(raised.canStand({ x: .4, y: 0, z: 0 })).toBe(true);
    expect(raised.canStand({ x: .4, y: 4.8, z: 0 })).toBe(false);
  });

  test("movement chooses the current floor under open decks without changing weapon picking", () => {
    const t = terrain(), bridge = t.pick({ x: 0, y: 30, z: -16 }, { x: 0, y: -1, z: 0 });
    expect(t.movementPoint(bridge, 0)).toEqual({ x: 0, y: 0, z: -16 });
    expect(t.movementPoint(bridge, 4.8)).toEqual({ ...bridge, y: 4.8 });
    expect(t.movementPoint({ x: 0, y: 8.4, z: -45 }, 0).y).toBe(0);
    expect(t.movementPoint({ x: -26, y: 2.4, z: 3 }, 0).y).toBe(2.4);
    expect(t.movementPoint({ x: -26, y: 4.8, z: -16 }, 0).y).toBe(4.8);
    // A support pillar below the click must nudge the ground order, not lift it.
    expect(t.movementPoint({ x: 14, y: 4.8, z: -16 }, 0).y).toBe(0);
    expect(bridge.y).toBeCloseTo(4.8);
  });

  test("a ground squad clicking a bridge approaches its underpass and never climbs the deck", async () => {
    sim = await Simulation.create("concourse");
    const point = sim.terrain!.movementPoint({ x: 0, y: 4.8, z: -16 }, sim.walkingPoint(sim.primary).y);
    sim.move(point);
    expect(sim.active.every(a => a.moveTarget?.y === 0)).toBe(true);
    for (let i = 0; i < 24 / STEP && sim.active.some(a => a.path.length); i++) {
      sim.step(); expect(sim.active.every(a => a.body.translation().y < 1.4)).toBe(true);
    }
    expect(sim.active.every(a => !a.path.length && distance2(a.body.translation(), a.moveTarget!) < .15)).toBe(true);
  });

  test("long flat shortcuts reject unsupported gaps and narrow obstructions", () => {
    const surfaces = [0, 12].map(x => ({ id: `deck-${x}`, x, z: 0, w: 8, d: 8, height: 4.8, thickness: .4 }));
    const t = new WalkTerrain(surfaces, [], [], { left: -20, right: 20, back: -20, front: 20 });
    expect(t.segmentClear({ x: 0, y: 4.8, z: 0 }, { x: 12, y: 4.8, z: 0 })).toBe(false);
    const wall = { x: 4.17, z: 10, w: .03, d: 2, y: 0, h: 2 };
    expect(t.segmentClear({ x: 0, y: 0, z: 10 }, { x: 12, y: 0, z: 10 }, .55, [wall])).toBe(false);
    expect(t.segmentClear({ x: 0, y: 0, z: 10 }, { x: 12, y: 0, z: 10 }, .55, [{ ...wall, y: 4.8 }])).toBe(true);
    new SurfaceNavigation(t);
    // Reusing the same surface array after an edit must rebuild its static graph.
    surfaces[0].w = 16; surfaces[1].x = 8;
    t.boxes.push({ x: 4, z: 0, w: 1, d: 2, y: 4.8, h: 2 });
    const edited = new SurfaceNavigation(t), path = edited.findPath({ x: 0, y: 4.8, z: 0 }, { x: 8, y: 4.8, z: 0 });
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual({ x: 8, y: 4.8, z: 0 });
    path.forEach((p, i) => expect(t.segmentClear(i ? path[i - 1] : { x: 0, y: 4.8, z: 0 }, p)).toBe(true));
  });

  test("a bridge fades for a selected robot underneath while collision stays closed", async () => {
    sim = await Simulation.create("concourse"); sim.select(1);
    arrive({ x: 0, y: 0, z: -16 });
    const view = new ConcourseView(), camera = new THREE.PerspectiveCamera();
    camera.position.set(0, 30, -16); camera.lookAt(0, 0, -16); camera.updateMatrixWorld();
    view.update(sim, camera, 1);
    expect(view.inspect().find(s => s.id === "street-bridge")!.opacity).toBeLessThan(.23);
    expect(sim.surfaceColliders.has(sim.ray(camera.position, sim.primary.body.translation(), sim.primary.body)!.collider.handle)).toBe(true);
    sim.sniping = true; view.update(sim, camera, 1);
    expect(view.inspect().every(s => s.opacity > .99)).toBe(true);
    view.root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose();
      (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
  });

  test("a square squad climbs both levels, traverses the gallery and returns using ramps", async () => {
    sim = await Simulation.create("concourse");
    expect(sim.mission).toBeUndefined(); expect(sim.terrain).toBeDefined();
    for (const goal of [{ x: -26, z: -16, y: 4.8 }, { x: 26, z: -20, y: 4.8 },
      { x: 26, z: -45, y: 8.4 }, { x: -12, z: -45, y: 8.4 }, { x: -26, z: 19, y: 0 }]) {
      arrive(goal);
      const goals = sim.active.map(a => a.moveTarget!);
      expect(distance2(goals[0], goals[1])).toBeCloseTo(2.2);
      expect(distance2(goals[1], goals[2])).toBeCloseTo(2.2);
      expect(goals.every(p => Math.abs(p.y! - goal.y) < .01)).toBe(true);
    }
  }, 30000);

  test("a street order passes under the bridge without repelling robots on its deck", async () => {
    sim = await Simulation.create("concourse"); sim.select(1);
    arrive({ x: 0, z: 10, y: 0 });
    arrive({ x: 0, z: -30, y: 0 });
    expect(sim.primary.body.translation().y).toBeCloseTo(.93, 1);
    expect(sim.primary.path).toEqual([]);
  });

  test("loose obstacles are isolated by height and successive searches retain no stale block", () => {
    const t = terrain(), nav = new SurfaceNavigation(t), a = { x: -10, y: 4.8, z: -16 }, b = { x: 10, y: 4.8, z: -16 };
    const wall = { x: 0, z: -16, w: 1, d: 12, y: 0, h: 2 };
    expect(nav.findPath(a, b, [wall])).toEqual([b]);
    const blocked = nav.findPath(a, b, [{ ...wall, y: 4.8 }]);
    expect(blocked).not.toEqual([b]);
    expect(nav.findPath(a, b, [wall])).toEqual([b]);
  });

  test("a stranded vehicle on a deck blocks that floor while the street stays open", async () => {
    sim = await Simulation.create("concourse");
    const car = sim.city!.vehicles[0], size = VEHICLES[car.model];
    car.body.setTranslation({ x: 0, y: 4.8 + size.height / 2, z: -16 }, true);
    car.state = "stranded";
    const obstacle = vehicleFootprint(car), nav = new SurfaceNavigation(terrain());
    expect(obstacle.y).toBeCloseTo(4.8); expect(obstacle.h).toBeCloseTo(size.height);
    const ground = { x: 0, y: 0, z: -30 }, upper = { x: 8, y: 4.8, z: -16 };
    expect(nav.findPath({ x: 0, y: 0, z: 10 }, ground, [obstacle])).toEqual([ground]);
    expect(nav.findPath({ x: -8, y: 4.8, z: -16 }, upper, [obstacle])).not.toEqual([upper]);
  });

  test("braced low-cover assistance recognizes raised parapets and requires a clear upper line", async () => {
    sim = await Simulation.create("concourse"); sim.select(1);
    arrive({ x: -12, y: 4.8, z: -14.2 });
    const low = { x: -12, y: 0, z: 12 }, upper = { ...low, y: 1.35 };
    const hit = sim.fireRay(sim.primary, sim.muzzle(sim.primary, low), low)!;
    expect(sim.surfaceColliders.has(hit.collider.handle)).toBe(false);
    expect(sim.clearsLowCover(sim.primary, low, upper)).toBe(true);
    expect(sim.clearsLowCover(sim.primary, { ...low, z: -5 }, { ...upper, z: -5 })).toBe(false);
  });

  test("queued orders and replays preserve surface height, and reset isolates older floors", async () => {
    sim = await Simulation.create("concourse");
    const recorder = new HumanReplayRecorder("raised-test"); recorder.begin(sim);
    sim.onInput = action => recorder.action(sim!, action);
    sim.select(4);
    sim.move({ x: -26, z: -16, y: 4.8 }); sim.move({ x: -26, z: -45, y: 8.4 }, true);
    expect(sim.primary.path.some(p => p.y === 4.8)).toBe(true);
    expect(sim.primary.moveTarget?.y).toBeCloseTo(8.4);
    for (let i = 0; i < 24 / STEP; i++) { recorder.beforeStep(sim); sim.step(); recorder.afterStep(sim); sim.events.length = 0; }
    const replay = readHumanReplay(recorder.export(sim));
    expect(playRecordedSession(sim, replay.sessions[0])).toEqual(replay.sessions[0].final);
    expect(sim.primary.body.translation().y).toBeCloseTo(9.33, 1);
    sim.onInput = undefined; sim.reset("proving");
    expect(sim.terrain).toBeUndefined(); expect(sim.squad.every(a => a.body.translation().y < 1.1)).toBe(true);
    sim.reset("concourse"); expect(sim.terrain).toBeDefined();
    expect(sim.squad.every(a => a.body.translation().y < 1.1)).toBe(true);
  }, 30000);

  test("an elevated rifle shot hits the upper target; upward impacts keep real free flight", async () => {
    sim = await Simulation.create("concourse"); sim.select(4);
    arrive({ x: -26, z: -45, y: 8.4 });
    sim.chooseWeapon("rifle"); sim.setBrace(true); ticks(.9);
    const target = sim.actors.find(a => a.kind === "precision")!;
    sim.aim = { ...target.body.translation() };
    const from = sim.muzzle(sim.primary);
    expect(sim.fireRay(sim.primary, from, sim.aim)?.collider.handle).toBe(target.collider.handle);
    sim.shoot(sim.primary); expect(target.hp).toBeLessThan(target.maxHp);
    sim.release(); sim.primary.braced = false;
    const before = sim.primary.body.translation().y;
    sim.primary.body.applyImpulse({ x: 0, y: 800, z: 0 }, true); ticks(.2);
    expect(sim.primary.body.translation().y).toBeGreaterThan(before + 1);
    expect(sim.primary.body.linvel().y).toBeGreaterThan(2);
  });

  test("grenade ballistics use the requested deck elevation", () => {
    const from = { x: -20, y: 6.2, z: -16 }, goal = { x: 0, y: 4.8, z: -16 };
    const { velocity, duration, target } = grenadeVelocity(from, goal);
    expect(target.y).toBeCloseTo(4.95);
    expect(from.y + velocity.y * duration - 6 * duration ** 2).toBeCloseTo(target.y);
    // Horizontal throw limits must not scale an absolute floor height down.
    expect(grenadeVelocity({ x: -26, y: 9.8, z: -45 }, { x: 26, y: 8.4, z: -45 }).target.y).toBeCloseTo(8.55);
    expect(grenadeVelocity({ x: 0, y: 9.8, z: -45 }, { x: 0, y: 8.4, z: -45 }).target.y).toBeCloseTo(8.55);
  });
});
