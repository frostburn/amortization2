import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Simulation } from "../src/game/simulation";
import { STEP, distance2 } from "../src/game/config";
import { inWater } from "../src/game/city";
import { MARINE_PORT } from "../src/game/port";
import { PORTER, TOTE } from "../src/game/porters";
import { NavigationGrid, segmentClear } from "../src/game/navigation";

const ticks = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds / STEP; i++) sim.step(); };
describe("PORTER and the marine port", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("port"); });
  afterEach(() => { vi.restoreAllMocks(); sim.world.free(); });

  test("four neutral working bipeds share a port with clear cargo routes and connected ground lanes", () => {
    expect(sim.city!.porters).toHaveLength(4); expect(sim.city!.carts).toHaveLength(6); expect(sim.city!.kites).toHaveLength(1);
    expect(sim.arena).toBeUndefined(); expect([...sim.selected]).toEqual([1, 2, 3, 4]);
    for (const p of sim.city!.porters) {
      expect(p.body.mass()).toBeCloseTo(PORTER.mass); expect(p.cargo.body.mass()).toBeCloseTo(TOTE.mass);
      expect(sim.city!.neutral(p.collider.handle)).toBe(p);
      for (const [i, point] of p.route.points.entries()) expect(segmentClear(point, p.route.points[(i + 1) % p.route.points.length],
        sim.layout.barriers, 0.28), p.route.id).toBe(true);
    }
    for (const route of MARINE_PORT.routes) for (const [i, point] of route.points.entries()) expect(segmentClear(point,
      route.points[(i + 1) % route.points.length], sim.layout.barriers, 0.95), route.id).toBe(true);
    sim.move({ x: 38, z: 0 }); ticks(sim, 14);
    for (const a of sim.squad) expect(distance2(a.body.translation(), { x: 38, z: 0 })).toBeLessThan(3);
  });

  test("cargo is physically lifted, placed and reused across repeated transfers without ground A*", () => {
    const search = vi.spyOn(NavigationGrid.prototype, "findPath"), lifted = new Set<number>(), placed = new Set<number>();
    for (let i = 0; i < 100 / STEP; i++) {
      sim.step();
      if (i % 30) continue;
      for (const p of sim.city!.porters) {
        expect(p.hp).toBe(PORTER.hp);
        expect(p.body.translation().y).toBeGreaterThan(0.9);
        expect(p.body.translation().y).toBeLessThan(1.05);
        expect(Math.hypot(p.body.linvel().x, p.body.linvel().z)).toBeLessThan(PORTER.speed + 0.08);
        if (p.grip && p.cargo.body.translation().y > 1.04) lifted.add(p.id);
        if (!p.grip && p.transfers > 0) placed.add(p.id);
        expect(MARINE_PORT.water.some(w => inWater(p.body.translation(), w))).toBe(false);
      }
    }
    expect(search).not.toHaveBeenCalled(); expect(sim.props).toHaveLength(4);
    expect([...lifted].sort()).toEqual([3000, 3001, 3002, 3003]);
    expect([...placed].sort()).toEqual([3000, 3001, 3002, 3003]);
    for (const p of sim.city!.porters) { expect(p.transfers).toBeGreaterThan(1); expect(p.distance).toBeGreaterThan(60); }
  }, 15000);

  test("nearby fire steadies an intact load and retreats, then work resumes after quiet", () => {
    ticks(sim, 5); const p = sim.city!.porters[0], at = p.body.translation(), distance = p.distance;
    expect(p.grip).toBeDefined();
    sim.city!.disturb({ x: at.x + 3, y: 1, z: at.z });
    expect(p.state).toBe("steady"); ticks(sim, 0.4);
    expect(Math.hypot(p.body.linvel().x, p.body.linvel().z)).toBeLessThan(0.1);
    expect(p.grip).toBeDefined(); ticks(sim, 2);
    expect(p.state).toBe("withdraw"); expect(p.distance).toBeGreaterThan(distance + 0.5);
    expect(Math.hypot(p.body.linvel().x, p.body.linvel().z)).toBeLessThan(PORTER.retreatSpeed + 0.05);
    ticks(sim, 45); expect(p.transfers).toBeGreaterThan(0); expect(p.hp).toBe(PORTER.hp);
  });

  test("a waiting worker pushed off its station finishes its pause and returns to work", () => {
    const p = sim.city!.porters[0]; p.wait = 1.6;
    p.body.applyImpulse({ x: 180, y: 0, z: 0 }, true);
    ticks(sim, 0.35);
    expect(distance2(p.body.translation(), p.route.points[0])).toBeGreaterThan(0.2);
    expect(p.wait).toBeGreaterThan(0); expect(p.state).toBe("waiting");
    ticks(sim, 2);
    expect(p.wait).toBe(0); expect(p.hp).toBe(PORTER.hp);
    ticks(sim, 4);
    expect(p.grip).toBeDefined(); expect(p.distance).toBeGreaterThan(0.8);
  });

  test("a bullet hit drops the physical tote and releases the heavy neutral hull without score credit", () => {
    ticks(sim, 5); const p = sim.city!.porters[0], a = sim.squad[0], at = p.body.translation();
    expect(p.grip).toBeDefined();
    a.body.setTranslation({ x: at.x - 5, y: 0.98, z: at.z }, true); sim.world.step();
    sim.select(1); sim.aim = { ...at, y: 1.25 }; sim.shoot(a);
    expect(p.hp).toBeLessThan(PORTER.hp); expect(p.grip).toBeUndefined(); expect(p.state).toBe("tumbling");
    expect(sim.shots).toBe(1); expect(sim.hits).toBe(0); expect(sim.coverHits).toBe(0);
    const load = { ...p.cargo.body.translation() }; ticks(sim, 0.7);
    expect(p.cargo.body.translation().y).toBeLessThan(load.y - 0.3);
    expect(Math.abs(p.body.rotation().x) + Math.abs(p.body.rotation().z)).toBeGreaterThan(0.05);
  });

  test("grenades launch PORTER, respect container cover and leave a released load physical", () => {
    ticks(sim, 4); const [exposed, covered] = sim.city!.porters;
    for (const [p, target] of [[exposed, { x: 0, y: 0.96, z: 25 }], [covered, { x: -30, y: 0.96, z: -57 }]] as const) {
      const previous = p.body.translation(), load = p.cargo.body.translation();
      p.cargo.body.setTranslation({ x: load.x + target.x - previous.x, y: load.y + target.y - previous.y, z: load.z + target.z - previous.z }, true);
      p.body.setTranslation(target, true);
    }
    sim.world.step();
    sim.city!.blast({ x: -30, y: 0.2, z: -51 }); expect(covered.hp).toBe(PORTER.hp);
    sim.city!.blast({ x: -1.5, y: 0.2, z: 25 });
    expect(exposed.grip).toBeUndefined(); expect(exposed.hp).toBe(0); expect(exposed.body.linvel().x).toBeGreaterThan(3);
    ticks(sim, 0.25); expect(exposed.body.translation().y).toBeGreaterThan(1.2);
    expect(sim.grenadeHits).toBe(0);
  });

  test("tipped survivors remain stranded; an upright supported survivor can recover", () => {
    const [upright, tipped] = sim.city!.porters;
    for (const p of [upright, tipped]) sim.city!.damage(p, 1, { x: 0, y: 0, z: 0 }, p.body.translation());
    tipped.body.setTranslation({ x: 2, y: 0.36, z: -9 }, true);
    tipped.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    ticks(sim, 5);
    expect(upright.impactUntil).toBe(0); expect(upright.hp).toBe(PORTER.hp - 1);
    expect(tipped.state).toBe("stranded"); expect(tipped.hp).toBe(PORTER.hp - 1);
  });

  test("water orders resolve to dry ground; the harbor has a submerged bed rather than an invisible quay floor", () => {
    sim.select(1); sim.move({ x: 70, z: 10 });
    for (const point of sim.squad[0].path) expect(MARINE_PORT.water.some(w => inWater(point, w))).toBe(false);
    const p = sim.city!.porters[0]; sim.city!.workers.release(p);
    p.cargo.body.setTranslation({ x: 95, y: 2, z: 0 }, true); sim.world.step(); ticks(sim, 3);
    expect(p.cargo.body.translation().y).toBeLessThan(-4);
  });

  test("a displaced tote is not conjured back and reset restores exactly one load per worker", () => {
    const p = sim.city!.porters[0];
    p.cargo.body.setTranslation({ x: 0, y: 0.2, z: 22 }, true); sim.world.step(); ticks(sim, 5);
    expect(p.grip).toBeUndefined(); expect(p.transfers).toBe(0); expect(p.cargo.body.translation().z).toBeGreaterThan(21);
    sim.reset("city"); expect(sim.city!.porters).toHaveLength(0);
    sim.reset("port"); expect(sim.props).toHaveLength(4); expect(sim.city!.porters).toHaveLength(4);
    expect(sim.city!.porters.every(p => !p.grip && p.transfers === 0)).toBe(true);
  });
});
