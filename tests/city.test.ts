import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { BUILDING_KIT, CITY_DISTRICT, buildingSolid, inWater } from "../src/game/city";
import { CART, CRATE, CIVILIAN_CHASSIS, CityLife } from "../src/game/civilians";
import { STEP, distance2 } from "../src/game/config";
import { findPath, segmentClear } from "../src/game/navigation";

const ticks = (sim: Simulation, seconds: number) => {
  for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step();
};
describe("city district", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("city"); });
  afterEach(() => sim.world.free());

  test("prefab transforms and all delivery segments have physical clearance", () => {
    const turned = buildingSolid({ ...CITY_DISTRICT.buildings[0], turn: 1 });
    expect(turned.w).toBe(BUILDING_KIT.shop.d);
    expect(turned.d).toBe(BUILDING_KIT.shop.w);
    for (const route of CITY_DISTRICT.routes) for (const [i, point] of route.points.entries()) {
      expect(segmentClear(point, route.points[(i + 1) % route.points.length], sim.layout.barriers,
        CIVILIAN_CHASSIS[route.model ?? "CART"].clearance), route.id).toBe(true);
      if (point.building) expect(CITY_DISTRICT.buildings.some(b => b.id === point.building)).toBe(true);
    }
    expect(sim.city!.carts.filter(c => c.model === "CART")).toHaveLength(20);
    expect(sim.city!.carts.filter(c => c.model === "CRATE")).toHaveLength(5);
    expect(sim.arena).toBeUndefined();
    expect([...sim.selected]).toEqual([1, 2, 3, 4]);
  });

  test("rotated storefronts react using their transformed footprints", () => {
    const district = { ...CITY_DISTRICT, routes: [], buildings: [{ ...CITY_DISTRICT.buildings[0], id: "turned", x: 0, z: 0, turn: 1 as const }] };
    const life = new CityLife(sim, district);
    life.disturb({ x: 0, y: 1, z: 28 });
    expect(life.inspect().closedShops).toEqual(["turned"]);
  });

  test("the fleet makes deliveries and stays on clear routes over a full minute", () => {
    ticks(sim, 60);
    for (const c of sim.city!.carts) {
      const p = c.body.translation();
      const chassis = CIVILIAN_CHASSIS[c.model];
      expect(c.hp, `${c.model} ${c.id}`).toBe(chassis.hp);
      expect(c.distance).toBeGreaterThan(25);
      expect(p.y).toBeGreaterThan(chassis.height / 2 - 0.06);
      expect(p.y).toBeLessThan(chassis.height / 2 + 0.06);
      expect(sim.layout.barriers.some(b => Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2)).toBe(false);
    }
    expect(sim.city!.carts.reduce((sum, c) => sum + c.deliveries, 0)).toBeGreaterThan(10);
    expect(sim.events.some(e => e.type === "drill" || e.type === "wave")).toBe(false);
  });

  test("CRATE visits separate compartments and withdraws slowly after gunfire", () => {
    const c = sim.city!.carts.find(c => c.model === "CRATE" && c.route.id === "canal-parcels")!;
    expect(c.body.mass()).toBeCloseTo(CRATE.mass);
    const initial = c.compartment;
    for (const index of [0, 1]) {
      const point = c.route.points[index];
      c.body.setTranslation({ x: point.x, y: CRATE.height / 2 + 0.01, z: point.z }, true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      c.next = index; c.wait = 0; sim.world.step(); ticks(sim, 0.1);
      expect(c.state).toBe("delivery");
      expect(c.compartment).toBe((initial + index + 1) % 3);
    }
    sim.city!.disturb(c.body.translation());
    expect(c.wait).toBe(0); expect(c.state).toBe("alert");
    ticks(sim, 2);
    expect(c.hp).toBe(CRATE.hp);
    expect(Math.hypot(c.body.linvel().x, c.body.linvel().z)).toBeLessThan(CRATE.retreatSpeed + 0.05);
    expect(c.state).toBe("alert");
    ticks(sim, 8);
    expect(c.state).not.toBe("alert");
  });

  test("CRATE takes less displacement than CART under the same bullet pressure", () => {
    const cart = sim.city!.carts[0], crate = sim.city!.carts.find(c => c.model === "CRATE")!;
    for (const [c, x] of [[cart, -3], [crate, 3]] as const) {
      const chassis = CIVILIAN_CHASSIS[c.model];
      c.body.setTranslation({ x, y: chassis.height / 2 + 0.01, z: 15 }, true);
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      sim.city!.damage(c, 6, { x: 0, y: 100, z: 180 }, c.body.translation());
    }
    expect(crate.hp).toBe(CRATE.hp - 6);
    expect(crate.body.linvel().z).toBeLessThan(cart.body.linvel().z / 2);
    ticks(sim, 0.25);
    expect(crate.state).toBe("tumbling"); expect(crate.body.translation().z).toBeGreaterThan(15.2);
    expect(crate.body.translation().z).toBeLessThan(cart.body.translation().z);
    expect(sim.hits).toBe(0); expect(sim.grenadeHits).toBe(0);
  });

  test("the canal blocks ground orders but its crossings connect both banks", () => {
    const water = CITY_DISTRICT.water[0], start = { x: 62, z: 24 }, goal = { x: 90, z: 24 };
    expect(segmentClear(start, goal, sim.layout.barriers)).toBe(false);
    const path = findPath(start, goal, sim.layout.barriers, 0.7, sim.layout.bounds);
    expect(path.length).toBeGreaterThan(1);
    for (const [i, p] of path.entries()) {
      expect(segmentClear(i ? path[i - 1] : start, p, sim.layout.barriers, 0.7)).toBe(true);
      expect(inWater(p, water)).toBe(false);
    }
    expect(path.at(-1)).toEqual(goal);
    sim.squad[0].body.setTranslation({ ...start, y: 0.98 }, true);
    sim.world.step(); sim.select(1); sim.move(goal);
    for (let i = 0; i < 20 / STEP; i++) {
      sim.step(); expect(inWater(sim.squad[0].body.translation(), water)).toBe(false);
    }
    expect(distance2(sim.squad[0].body.translation(), goal)).toBeLessThan(1);
  });

  test("impacts can cross the canal, wet neutral hulls strand and bridges remain dry", () => {
    const [wet, dry] = sim.city!.carts;
    wet.body.setTranslation({ x: 76, y: 2, z: 24 }, true);
    dry.body.setTranslation({ x: 76, y: CART.height / 2 + 0.01, z: -9 }, true);
    dry.route = CITY_DISTRICT.routes.find(r => r.id === "canal-parcels")!;
    dry.next = 5; dry.yaw = Math.PI / 2;
    sim.world.step(); ticks(sim, 0.1);
    expect(wet.hp).toBe(CART.hp); expect(dry.hp).toBe(CART.hp);
    ticks(sim, 2);
    expect(wet.hp).toBe(CART.hp); expect(wet.state).toBe("stranded");
    expect(dry.hp).toBe(CART.hp); expect(dry.body.translation().x).toBeGreaterThan(77);
    expect(sim.hits).toBe(0); expect(sim.grenadeHits).toBe(0);
    expect(sim.events.filter(e => e.type === "down")).toHaveLength(0);
    expect(sim.city!.inspect().closedShops).toHaveLength(0);
  });

  test("nearby shots cause local retreat and shop closure, then quiet restores service", () => {
    const nearby = sim.city!.carts[0], far = sim.city!.carts.find(c => distance2(c.body.translation(), nearby.body.translation()) > 40)!;
    sim.city!.disturb({ ...nearby.body.translation() });
    expect(nearby.state).toBe("alert");
    expect(far.alertUntil).toBe(0);
    expect(sim.city!.inspect().closedShops.length).toBeGreaterThan(0);
    ticks(sim, 12);
    expect(nearby.state).not.toBe("alert");
    expect(sim.city!.inspect().closedShops).toHaveLength(0);
    expect(nearby.distance).toBeGreaterThan(5);
  });

  test("CART yields to a squad hull and can reverse away from a persistent obstruction", () => {
    const c = sim.city!.carts[0], p = c.body.translation(), next = c.route.points[c.next];
    const d = distance2(p, next), forward = { x: (next.x - p.x) / d, z: (next.z - p.z) / d };
    sim.squad[0].body.setTranslation({ x: p.x + forward.x * 1.1, y: 0.98, z: p.z + forward.z * 1.1 }, true);
    sim.world.step(); ticks(sim, 0.15);
    expect(c.state).toBe("yield");
    expect(Math.hypot(c.body.linvel().x, c.body.linvel().z)).toBeLessThan(0.15);
    ticks(sim, 4);
    expect(c.direction).toBe(-1);
    expect(distance2(c.body.translation(), sim.squad[0].body.translation())).toBeGreaterThan(1.5);
  });

  test("cross-town deliveries stop for a red crossing and resume on green", () => {
    const c = sim.city!.carts.find(c => c.route.id === "cross-town")!;
    c.body.setTranslation({ x: -7.6, y: 0.32, z: -9 }, true);
    c.next = 2; c.yaw = Math.PI / 2; sim.time = 15;
    sim.world.step(); ticks(sim, 1);
    expect(c.state).toBe("yield"); expect(c.body.translation().x).toBeCloseTo(-7.6, 1);
    sim.time = 20; ticks(sim, 1.5);
    expect(c.state).toBe("travel"); expect(c.body.translation().x).toBeGreaterThan(-6.1);
  });

  test.each(["gun", "pistol", "minigun"] as const)("%s shots stop at neutral hulls without accuracy credit", weapon => {
    if (weapon === "minigun") sim.reset("city", "minigunner");
    const id = weapon === "pistol" ? 4 : weapon === "minigun" ? 2 : 1;
    sim.select(id); sim.chooseWeapon(weapon);
    const a = sim.actors.find(a => a.id === id)!, c = sim.city!.carts[0];
    a.body.setTranslation({ x: 0, y: 0.98, z: 0 }, true);
    c.body.setTranslation({ x: 0, y: 0.32, z: 5 }, true); c.wait = 3;
    if (weapon === "minigun") a.spin = 1;
    sim.world.step(); sim.aim = { x: 0, y: 0.35, z: 5 }; sim.shoot(a);
    expect(c.hp).toBeLessThan(CART.hp); expect(sim.shots).toBe(1); expect(sim.hits).toBe(0);
    if (weapon !== "pistol") {
      expect(c.state).toBe("tumbling");
      ticks(sim, 0.25);
      expect(c.body.translation().y).toBeGreaterThan(0.5);
      expect(c.body.translation().z).toBeGreaterThan(6);
      expect(Math.hypot(c.body.rotation().x, c.body.rotation().z)).toBeGreaterThan(0.2);
      expect(c.hp).toBeGreaterThan(0);
    }
  });

  test("manual rifle hits neutral hulls without hostile accuracy credit", () => {
    const c = sim.city!.carts[0];
    sim.select(4); sim.chooseWeapon("rifle");
    const a = sim.squad[3];
    a.body.setTranslation({ x: 0, y: 0.98, z: 0 }, true);
    c.body.setTranslation({ x: 0, y: CART.height / 2, z: 5 }, true); c.wait = 3;
    sim.world.step(); sim.aim = { x: 0, y: 0.35, z: 5 };
    sim.setBrace(true); ticks(sim, 0.7); sim.shoot(a);
    expect(c.hp).toBe(0); expect(c.state).toBe("disabled");
    expect(sim.shots).toBe(1); expect(sim.hits).toBe(0); expect(sim.coverHits).toBe(0);
    expect(sim.events.some(e => e.type === "shot" && !e.hit && e.material === "metal")).toBe(true);
    ticks(sim, 0.25);
    expect(c.body.translation().y).toBeGreaterThan(0.9);
    expect(c.body.translation().z).toBeGreaterThan(6.5);
  });

  test("neutral blast damage respects cover and never increments hostile hits", () => {
    const [exposed, protectedCart] = sim.city!.carts;
    exposed.body.setTranslation({ x: -43.5, y: 0.32, z: -21 }, true);
    protectedCart.body.setTranslation({ x: -38.8, y: 0.32, z: -21 }, true);
    sim.world.step();
    sim.select(1); sim.chooseWeapon("grenade"); sim.throwGrenade({ x: -42, z: -21 });
    const grenade = sim.grenades[0]; grenade.body.setTranslation({ x: -42, y: 0.18, z: -21 }, true);
    sim.world.step(); sim.explode(grenade);
    expect(exposed.hp).toBe(0); expect(protectedCart.hp).toBe(CART.hp);
    expect(sim.grenadeHits).toBe(0);
    expect(protectedCart.alertUntil).toBeCloseTo(sim.time + 12);
    expect(sim.city!.closedUntil.get("grocer")).toBeCloseTo(sim.time + 14);
    sim.city!.disturb(exposed.body.translation());
    expect(protectedCart.alertUntil).toBeCloseTo(sim.time + 12);
    expect(sim.city!.closedUntil.get("grocer")).toBeCloseTo(sim.time + 14);
    ticks(sim, 0.35);
    expect(exposed.body.translation().y).toBeGreaterThan(1.7);
    expect(exposed.body.translation().x).toBeLessThan(-46);
    expect(Math.hypot(exposed.body.rotation().x, exposed.body.rotation().z)).toBeGreaterThan(0.2);
    expect(protectedCart.body.translation().y).toBeLessThan(0.4);
  });

  test("later shots and blasts can launch a disabled hull again without another down event", () => {
    const c = sim.city!.carts[0], a = sim.squad[0];
    sim.city!.damage(c, CART.hp, { x: 0, y: 0, z: 0 }, c.body.translation());
    const downEvents = sim.events.filter(e => e.type === "down").length;
    c.body.setTranslation({ x: 0, y: 0.32, z: 5 }, true);
    a.body.setTranslation({ x: 0, y: 0.98, z: 0 }, true);
    sim.world.step(); sim.select(1); sim.aim = { x: 0, y: 0.35, z: 5 }; sim.shoot(a);
    expect(c.hp).toBe(0); expect(c.body.linvel().z).toBeGreaterThan(4);
    ticks(sim, 0.25);
    expect(c.body.translation().y).toBeGreaterThan(0.5);
    const p = c.body.translation();
    sim.city!.blast({ x: p.x - 1.5, y: p.y, z: p.z });
    expect(c.body.linvel().x).toBeGreaterThan(8);
    ticks(sim, 0.25);
    expect(c.body.translation().y).toBeGreaterThan(1.5);
    expect(sim.events.filter(e => e.type === "down")).toHaveLength(downEvents);
  });

  test("a wall stops a launched CART and its drive cannot right it in midair", () => {
    const c = sim.city!.carts[0], a = sim.squad[0];
    c.body.setTranslation({ x: -27, y: 0.32, z: -12 }, true);
    a.body.setTranslation({ x: -27, y: 0.98, z: -6 }, true);
    sim.world.step(); sim.select(1); sim.aim = { x: -27, y: 0.35, z: -12 }; sim.shoot(a);
    ticks(sim, 0.3);
    expect(c.state).toBe("tumbling");
    expect(Math.hypot(c.body.rotation().x, c.body.rotation().z)).toBeGreaterThan(0.2);
    ticks(sim, 3);
    expect(c.body.translation().z).toBeGreaterThan(-13.7);
    expect(c.body.translation().y).toBeLessThan(0.8);
    expect(c.hp).toBeGreaterThan(0);
  });

  test("upright survivors resume service after settling; tipped survivors stay stranded", () => {
    const [upright, tipped] = sim.city!.carts;
    for (const c of [upright, tipped]) {
      sim.city!.damage(c, 1, { x: 0, y: 0, z: 0 }, c.body.translation());
      c.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      c.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    }
    tipped.body.setRotation({ x: 0, y: 0, z: Math.SQRT1_2, w: Math.SQRT1_2 }, true);
    ticks(sim, 5);
    expect(upright.impactUntil).toBe(0); expect(upright.distance).toBeGreaterThan(2);
    expect(tipped.state).toBe("stranded"); expect(tipped.hp).toBeGreaterThan(0);
    expect(Math.hypot(tipped.body.linvel().x, tipped.body.linvel().z)).toBeLessThan(0.2);
  });

  test("reset and floor changes remove old civilian bodies and rebuild deterministic activity", () => {
    const starts = sim.city!.inspect().carts.map(c => c.position);
    ticks(sim, 2); sim.reset();
    expect(sim.city!.inspect().carts.map(c => c.position)).toEqual(starts);
    sim.reset("arena"); expect(sim.city).toBeUndefined();
    expect(sim.actors).toHaveLength(4);
    sim.reset("city", "minigunner"); expect(sim.city!.carts).toHaveLength(25);
    expect(sim.squad[1].model).toBe("minigunner");
  });
});
