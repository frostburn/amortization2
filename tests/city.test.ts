import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Simulation } from "../src/game/simulation";
import { BUILDING_KIT, CITY_DISTRICT, buildingSolid } from "../src/game/city";
import { CART, CityLife } from "../src/game/civilians";
import { STEP, distance2 } from "../src/game/config";
import { segmentClear } from "../src/game/navigation";

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
      expect(segmentClear(point, route.points[(i + 1) % route.points.length], sim.layout.barriers, 0.65)).toBe(true);
      if (point.building) expect(CITY_DISTRICT.buildings.some(b => b.id === point.building)).toBe(true);
    }
    expect(sim.city!.carts).toHaveLength(16);
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
      expect(c.hp).toBe(CART.hp);
      expect(c.distance).toBeGreaterThan(25);
      expect(p.y).toBeGreaterThan(0.25);
      expect(p.y).toBeLessThan(0.36);
      expect(sim.layout.barriers.some(b => Math.abs(p.x - b.x) < b.w / 2 && Math.abs(p.z - b.z) < b.d / 2)).toBe(false);
    }
    expect(sim.city!.carts.reduce((sum, c) => sum + c.deliveries, 0)).toBeGreaterThan(10);
    expect(sim.events.some(e => e.type === "drill" || e.type === "wave")).toBe(false);
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
  });

  test("reset and floor changes remove old civilian bodies and rebuild deterministic activity", () => {
    const starts = sim.city!.inspect().carts.map(c => c.position);
    ticks(sim, 2); sim.reset();
    expect(sim.city!.inspect().carts.map(c => c.position)).toEqual(starts);
    sim.reset("arena"); expect(sim.city).toBeUndefined();
    expect(sim.actors).toHaveLength(4);
    sim.reset("city", "minigunner"); expect(sim.city!.carts).toHaveLength(16);
    expect(sim.squad[1].model).toBe("minigunner");
  });
});
