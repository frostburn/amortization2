import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { CITY_DISTRICT, buildingSolid, inWater } from "../src/game/city";
import { KITE } from "../src/game/aircraft";
import { STEP, distance2 } from "../src/game/config";
import * as THREE from "three";
import { kiteBody, makeDeliveryPad, KiteFleet } from "../src/render/kites";

const ticks = (sim: Simulation, seconds: number) => { for (let i = 0; i < seconds / STEP; i++) sim.step(); };
describe("KITE parcel flights", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("city"); });
  afterEach(() => sim.world.free());

  test("pads clear roads, water and solid scenery; cruise clears the roof equipment", () => {
    for (const pad of CITY_DISTRICT.pads) {
      for (const b of [...CITY_DISTRICT.buildings.map(buildingSolid), ...CITY_DISTRICT.furniture]) {
        const dx = Math.max(0, Math.abs(pad.x - b.x) - b.w / 2), dz = Math.max(0, Math.abs(pad.z - b.z) - b.d / 2);
        expect(Math.hypot(dx, dz), pad.id).toBeGreaterThan(2.3);
      }
      for (const street of CITY_DISTRICT.streets) expect(Math.abs((street.axis === "x" ? pad.z : pad.x) - street.at), pad.id).toBeGreaterThan(street.width / 2 + 2.3);
      expect(CITY_DISTRICT.water.some(w => inWater(pad, w))).toBe(false);
    }
    for (const route of CITY_DISTRICT.flights) {
      expect(CITY_DISTRICT.pads.some(p => p.id === route.home)).toBe(true);
      expect(CITY_DISTRICT.pads.some(p => p.id === route.destination)).toBe(true);
      expect(route.altitude - 0.5).toBeGreaterThan(Math.max(...CITY_DISTRICT.buildings.map(b => buildingSolid(b).h + 1.8)));
    }
    expect(sim.city!.kites).toHaveLength(3);
    expect(sim.city!.kites[0].body.mass()).toBeCloseTo(KITE.mass);
  });

  test("three aircraft complete repeated deliveries with bounded physical flight", () => {
    const loaded = new Set<number>(), unloaded = new Set<number>();
    for (let i = 0; i < 160 / STEP; i++) {
      sim.step();
      if (i % 30) continue;
      for (const c of sim.city!.kites) {
        const p = c.body.translation();
        expect(c.hp).toBe(KITE.hp);
        expect(["disabled", "stranded", "crashing", "hover"]).not.toContain(c.state);
        expect(p.y).toBeGreaterThan(0.40); expect(p.y).toBeLessThan(c.route.altitude + 0.5);
        expect(Math.hypot(c.body.linvel().x, c.body.linvel().z)).toBeLessThan(KITE.speed + 0.1);
        expect(sim.layout.barriers.some(b => !b.navigationOnly && p.y < b.h && Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2)).toBe(false);
        (c.loaded ? loaded : unloaded).add(c.id);
      }
    }
    expect([...loaded].sort()).toEqual([...unloaded].sort());
    for (const c of sim.city!.kites) { expect(c.deliveries).toBeGreaterThan(0); expect(c.distance).toBeGreaterThan(150); }
    expect(sim.city!.kites[0].deliveries).toBeGreaterThan(1);
    expect(sim.hits).toBe(0); expect(sim.grenadeHits).toBe(0);
  }, 15000);

  test("an occupied pad causes a safe hover, followed by delivery after it clears", () => {
    const c = sim.city!.kites[0], end = c.plan.at(-1)!;
    c.body.setTranslation({ ...end, y: 4 }, true); c.next = c.plan.length - 1;
    sim.squad[0].body.setTranslation({ ...end, y: 0.98 }, true); sim.world.step();
    ticks(sim, 5);
    expect(c.state).toBe("hover"); expect(c.body.translation().y).toBeGreaterThan(3.3); expect(c.deliveries).toBe(0);
    sim.squad[0].body.setTranslation({ x: 0, y: 0.98, z: 0 }, true); sim.world.step(); ticks(sim, 5);
    expect(c.deliveries).toBe(1); expect(c.state).toBe("delivery"); expect(c.loaded).toBe(false);
  });

  test("combat cancels approach, climbs vertically and returns to its own depot pad", () => {
    const c = sim.city!.kites[0], end = c.plan.at(-1)!;
    c.body.setTranslation({ ...end, y: 4 }, true); c.next = c.plan.length - 1; sim.world.step();
    sim.city!.disturb({ ...end, y: 1 }, undefined, 70);
    expect(c.state).toBe("abort"); ticks(sim, 2);
    expect(distance2(c.body.translation(), end)).toBeLessThan(0.2); expect(c.body.translation().y).toBeGreaterThan(7);
    ticks(sim, 48);
    const home = CITY_DISTRICT.pads.find(p => p.id === c.route.home)!;
    expect(distance2(c.body.translation(), home)).toBeLessThan(0.2);
    expect(c.state).toBe("delivery"); expect(c.rotors).toBe(0); expect(c.loaded).toBe(true); expect(c.deliveries).toBe(0);
    ticks(sim, 22); expect(c.state).toBe("takeoff"); expect(c.body.translation().y).toBeGreaterThan(2);
  });

  test("compound rotor hits resolve to the neutral aircraft and damage removes lift", () => {
    const c = sim.city!.kites[0], p = c.body.translation();
    expect(c.colliders.every(h => sim.city!.neutral(h.handle) === c)).toBe(true);
    sim.city!.damage(c, 6, { x: 60, y: 0, z: 30 }, { x: p.x + 0.72, y: p.y + 0.23, z: p.z + 0.63 });
    expect(c.hp).toBe(18); expect(c.state).toBe("crashing");
    ticks(sim, 0.8); expect(c.body.translation().y).toBeLessThan(p.y - 2); expect(c.rotors).toBe(0);
    expect(Math.hypot(c.body.rotation().x, c.body.rotation().z)).toBeGreaterThan(0.1);
    ticks(sim, 7); expect(c.state).toBe("stranded");
    sim.city!.damage(c, 100, { x: 80, y: 120, z: 0 }, c.body.translation());
    expect(c.state).toBe("disabled"); expect(c.body.linvel().y).toBeGreaterThan(4);
    const deaths = sim.events.filter(e => e.type === "down").length;
    sim.city!.damage(c, 100, { x: 80, y: 120, z: 0 }, c.body.translation());
    expect(sim.events.filter(e => e.type === "down")).toHaveLength(deaths);
  });

  test("rifle shots hit aircraft at elevation without hostile accuracy credit", () => {
    const c = sim.city!.kites[0], a = sim.squad[3];
    c.body.setTranslation({ x: 0, y: 8, z: 12 }, true); c.wait = 5; c.state = "delivery";
    a.body.setTranslation({ x: 0, y: 0.98, z: 0 }, true); sim.world.step();
    sim.select(4); sim.chooseWeapon("rifle"); sim.setBrace(true); ticks(sim, 0.7);
    sim.aim = { ...c.body.translation(), y: c.body.translation().y + 0.1 }; sim.shoot(a);
    expect(c.hp).toBe(0); expect(c.state).toBe("disabled"); expect(sim.shots).toBe(1);
    expect(sim.hits).toBe(0); expect(sim.coverHits).toBe(0); expect(sim.grenadeHits).toBe(0);
    expect(sim.events.some(e => e.type === "shot" && !e.hit && e.material === "metal")).toBe(true);
  });

  test("blast pressure is three dimensional and respects solid cover", () => {
    const [low, high, covered] = sim.city!.kites;
    low.body.setTranslation({ x: -43.5, y: 2, z: -21 }, true);
    high.body.setTranslation({ x: -43, y: 18, z: -21 }, true);
    covered.body.setTranslation({ x: -36, y: 2, z: -21 }, true); sim.world.step();
    sim.city!.blast({ x: -42, y: 0.2, z: -21 });
    expect(low.hp).toBe(0); expect(high.hp).toBe(KITE.hp); expect(covered.hp).toBe(KITE.hp);
    expect(low.body.linvel().y).toBeGreaterThan(3); expect(sim.grenadeHits).toBe(0);
  });

  test("a machine-gun shot through the swept rotor disc damages its neutral owner", () => {
    const c = sim.city!.kites[0], a = sim.squad[0];
    c.body.setTranslation({ x: 0, y: 2, z: 5 }, true);
    a.body.setTranslation({ x: 0.72, y: 0.98, z: 0 }, true); sim.world.step();
    sim.select(1); sim.aim = { x: 0.72, y: 2.23, z: 4.37 }; sim.shoot(a);
    expect(c.hp).toBeLessThan(KITE.hp); expect(c.hp).toBeGreaterThan(0);
    expect(c.state).toBe("crashing"); expect(sim.shots).toBe(1); expect(sim.hits).toBe(0);
  });

  test("reset rebuilds aircraft and range changes remove the civilian fleet", () => {
    const starts = sim.city!.flights.inspect().map(c => c.position), old = sim.city!.kites[0].body;
    ticks(sim, 2); sim.reset(); expect(sim.city!.kites[0].body).not.toBe(old);
    expect(sim.city!.flights.inspect().map(c => c.position)).toEqual(starts);
    sim.reset("arena"); expect(sim.city).toBeUndefined(); expect(sim.actors).toHaveLength(4);
    sim.reset("city"); expect(sim.city!.kites).toHaveLength(3); expect(sim.city!.carts).toHaveLength(25);
  });

  test("reusable aircraft geometry matches skids and span; the fleet stays batched", () => {
    const body = kiteBody(), pad = makeDeliveryPad(CITY_DISTRICT.pads[0]), fleet = new KiteFleet(sim.city!.kites);
    try {
      const bounds = new THREE.Box3().setFromObject(body);
      expect(bounds.min.y).toBeCloseTo(-0.4375); expect(bounds.max.y).toBeLessThan(0.27);
      expect(fleet.root.children.length).toBeLessThan(10);
      expect(fleet.root.children.every(o => o instanceof THREE.InstancedMesh)).toBe(true);
      const painted = new THREE.Box3().setFromObject(pad); expect(painted.max.y).toBeLessThan(0.06); expect(painted.min.y).toBeGreaterThan(0.033);
      ticks(sim, 1); fleet.update(0.5, 0.1); expect(new THREE.Box3().setFromObject(fleet.root).isEmpty()).toBe(false);
    } finally {
      fleet.dispose();
      for (const root of [body, pad]) root.traverse(o => { if (o instanceof THREE.Mesh) { o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose()); } });
    }
  });
});
