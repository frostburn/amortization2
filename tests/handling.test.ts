import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PISTOL, STEP, distance2 } from "../src/game/config";
import { HandlingMission } from "../src/game/handling-mission";
import { HANDLING_SITES } from "../src/game/handling";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay } from "../src/game/replay";
import { Simulation } from "../src/game/simulation";
import { pointerAction } from "../src/game/interaction";

const zero = { x: 0, y: 0, z: 0 };
describe("Handling contract and squad hauling", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("handling"); sim.mission!.deploy(); });
  afterEach(() => sim.world.free());
  const mission = () => sim.mission as HandlingMission;
  const step = (shoot = false) => {
    if (shoot) {
      const target = sim.actors.filter(a => a.kind === "enemy" && !a.dead)
        .sort((a, b) => distance2(a.body.translation(), sim.primary.body.translation()) - distance2(b.body.translation(), sim.primary.body.translation()))[0];
      sim.trigger = !!target;
      if (target) sim.aim = { ...target.body.translation(), y: target.body.translation().y + (target.flight ? 0 : 0.25) };
    }
    sim.step();
  };
  const ticks = (seconds: number, shoot = false) => {
    for (let i = 0; i < Math.ceil(seconds / STEP); i++) step(shoot);
    sim.trigger = false;
  };
  const until = (check: () => boolean, seconds = 20, shoot = false) => {
    for (let i = 0; i < seconds / STEP && !check(); i++) step(shoot);
    sim.trigger = false;
    expect(check(), JSON.stringify(mission().inspect())).toBe(true);
  };
  const pickBox = () => { expect(sim.haulCargo()).toBeNull(); until(() => mission().box.state === "carried", 8); };
  const deliverBox = () => {
    pickBox(); sim.move(HANDLING_SITES.delivery);
    until(() => mission().cargoReleased, 20, true);
  };
  const clear = () => {
    for (const a of mission().enemies) sim.damage(a, a.hp, zero, a.body.translation(), "pistol");
    sim.step();
  };

  test("briefing freezes four pistol chassis, and reset restores the gate, cargo and wave timer", () => {
    sim.reset("handling", "minigunner");
    expect(sim.mission!.phase).toBe("briefing");
    expect(sim.squad.every(a => a.model === "assault" && a.weapons.length === 1 && a.weapon === "pistol")).toBe(true);
    expect(sim.chooseWeapon("minigun")).toBe(false);
    sim.haulCargo(); ticks(5);
    expect(sim.time).toBe(0); expect(mission().waves).toBe(0);
    expect(mission().box.carriers).toHaveLength(0);
    sim.mission!.deploy(); pickBox(); sim.reset();
    expect(sim.hauling!.loads.every(l => !l.carriers.length && !l.carriedOnce && !l.delivered)).toBe(true);
    expect(sim.mission!.obstacles).toHaveLength(1);
    expect(sim.security!.drones).toHaveLength(0);
  });

  test("closed gate blocks real walking and fire; an uncarried box on the pad grants no access", () => {
    const hit = sim.ray({ x: 7, y: 1.2, z: 0 }, { x: 12, y: 1.2, z: 0 });
    expect(hit).not.toBeNull();
    sim.select(1); sim.move({ x: 16, z: 0 }); ticks(12);
    expect(sim.primary.body.translation().x).toBeLessThan(9);
    expect(mission().enemyShots).toBe(0);
    mission().box.prop.body.setTranslation({ ...HANDLING_SITES.delivery, y: 0.3 }, true);
    ticks(1);
    expect(mission().phase).toBe("delivery"); expect(mission().cargoReleased).toBe(false);
  });

  test("H assigns one physical hauler; it walks to the box, lifts it, and cannot fire or cover", () => {
    const box = mission().box, original = { ...box.prop.body.translation() };
    sim.haulCargo(); expect(box.state).toBe("approaching");
    expect(box.carriers).toHaveLength(1);
    expect(distance2(box.prop.body.translation(), original)).toBe(0);
    until(() => box.state === "carried", 8);
    expect(box.joints).toHaveLength(1); expect(box.prop.body.translation().y).toBeCloseTo(0.9, 1);
    const a = box.carriers[0]; sim.select(a.id);
    const ammo = a.pistol.ammo; sim.shoot(a); sim.coverSector({ x: 0, z: -15 });
    expect(a.pistol.ammo).toBe(ammo); expect(a.cover).toBeUndefined();
    sim.trigger = true; ticks(0.5); expect(a.pistol.ammo).toBe(ammo);
    sim.move({ x: -12, z: 2.5 }); ticks(1.5);
    expect(Math.hypot(a.body.linvel().x, a.body.linvel().z)).toBeLessThan(2.5);
    expect(a.body.translation().x).toBeGreaterThan(-19);
  });

  test("a move during collection waits for the lift instead of cancelling the haul", () => {
    sim.haulCargo(); sim.move(HANDLING_SITES.delivery);
    until(() => mission().cargoReleased, 25, true);
    expect(mission().box.delivered).toBe(true); expect(sim.mission!.obstacles).toHaveLength(0);
    expect(sim.ray({ x: 7, y: 2.8, z: 0 }, { x: 12, y: 2.8, z: 0 })).toBeNull();
  });

  test("cargo clicks collect or drop the hit load; locked cargo never selects another load", () => {
    const { box, chest } = mission();
    expect(pointerAction(sim, { cargo: box.prop.id })).toEqual({ type: "haul", cargo: box.prop.id, verb: "collect" });
    expect(pointerAction(sim, { cargo: chest.prop.id }).type).toBe("blocked");
    expect(sim.haulCargo(chest.prop.id)).toMatch(/guards/);
    expect(box.state).toBe("resting");
    sim.haulCargo(box.prop.id); until(() => box.state === "carried", 8);
    expect(pointerAction(sim, { cargo: box.prop.id })).toEqual({ type: "haul", cargo: box.prop.id, verb: "drop" });
    expect(pointerAction(sim, { cargo: box.prop.id }, { forceFire: true }).type).toBe("fire");
    expect(pointerAction(sim, { cargo: box.prop.id }, { covering: true }).type).toBe("cover");
    expect(pointerAction(sim, { cargo: box.prop.id }, { selecting: true }).type).toBe("group");
    const hauler = box.carriers[0]; sim.select(sim.squad.find(a => a !== hauler)!.id);
    expect(pointerAction(sim, { cargo: box.prop.id }).type).toBe("blocked");
    sim.select(hauler.id); sim.haulCargo(box.prop.id);
    expect(box.state).toBe("resting"); expect(box.joints).toHaveLength(0);
  });

  test("pickup movement physically pushes a wreck occupying the grip", () => {
    const box = mission().box, p = box.prop.body.translation();
    const wreck = sim.addEnemy("assault", { x: p.x, z: p.z - 1 });
    sim.damage(wreck, wreck.hp, zero, wreck.body.translation(), "pistol");
    wreck.body.setRotation({ x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 }, true);
    wreck.body.setTranslation({ x: p.x, y: 0.38, z: p.z - 1 }, true);
    ticks(0.5);
    const before = { ...wreck.body.translation() };
    sim.select(4); expect(sim.haulCargo(box.prop.id)).toBeNull();
    expect(box.orientation).toBe(0);
    until(() => box.state === "carried", 15, true);
    expect(distance2(wreck.body.translation(), before)).toBeGreaterThan(0.3);
    expect(wreck.collider.isEnabled()).toBe(true);
    expect(wreck.body.isDynamic()).toBe(true);
  });

  test("putting down or taking a severe hit releases a physical box which can be collected again", () => {
    pickBox(); const box = mission().box, carrier = box.carriers[0]; sim.select(carrier.id);
    sim.haulCargo(); ticks(0.8);
    expect(box.state).toBe("resting"); expect(box.joints).toHaveLength(0);
    expect(box.prop.body.translation().y).toBeLessThan(0.4);
    sim.haulCargo(); until(() => box.state === "carried", 5);
    sim.damage(carrier, 1, { x: 60, y: 0, z: 0 }, carrier.body.translation(), "rifle"); sim.step();
    expect(box.state).toBe("resting"); expect(carrier.haul).toBeUndefined();
    ticks(1); sim.haulCargo(); until(() => box.state === "carried", 8);
    sim.damage(carrier, carrier.hp, zero, carrier.body.translation(), "pistol"); sim.step();
    expect(box.joints).toHaveLength(0); expect(box.carriers).toHaveLength(0);
  });

  test("ordinary stagger pauses a joined team without dropping its load", () => {
    pickBox(); const box = mission().box, carrier = box.carriers[0];
    sim.damage(carrier, 1, zero, carrier.body.translation(), "pistol"); sim.step();
    expect(box.state).toBe("carried"); expect(box.joints).toHaveLength(1);
    ticks(0.3); expect(sim.isDisrupted(carrier)).toBe(false);
  });

  test("support robots cannot overwrite an assigned pickup or steal a joined load", () => {
    sim.select(4); sim.haulCargo(); const box = mission().box;
    sim.selectGroup([1, 2, 3]); expect(sim.haulCargo()).toMatch(/already assigned/);
    expect(box.carriers.map(a => a.id)).toEqual([4]);
    until(() => box.state === "carried", 8);
    const joint = box.joints[0]; expect(sim.haulCargo()).toMatch(/already assigned/);
    expect(box.joints).toEqual([joint]); expect(sim.squad.filter(a => a.haul)).toHaveLength(1);
    sim.select(4); sim.haulCargo(); sim.select(1); ticks(0.8);
    expect(sim.haulCargo()).toBeNull(); until(() => box.state === "carried", 10);
    expect(box.carriers.map(a => a.id)).toEqual([1]);
  });

  test("a parcel placed by hand on the receiving pad is accepted after the carrier lets go", () => {
    pickBox(); const box = mission().box;
    sim.select(box.carriers[0].id); sim.move(HANDLING_SITES.delivery);
    until(() => mission().releaseProgress > 0, 20);
    sim.haulCargo(); until(() => mission().cargoReleased, 2);
    expect(box.delivered).toBe(true); expect(box.joints).toHaveLength(0);
  });

  test("contract drone population stays bounded and survives civilian stand-down", () => {
    pickBox();
    const original = sim.security!.update.bind(sim.security!);
    // Isolate the reinforcement schedule from casualties, while retaining flight,
    // descent, targeting and all ordinary response bookkeeping.
    sim.security!.update = () => {
      original(); for (const a of sim.security!.drones) a.ai!.fire = false;
    };
    ticks(65);
    expect(sim.security!.drones.filter(a => !a.dead && a.flight!.contract)).toHaveLength(4);
    expect(mission().waves).toBe(4);
    expect(sim.security!.pressure).toBe(0);
    expect(sim.security!.drones.every(a => a.flight!.state === "pursuing")).toBe(true);
  });

  test("delivery opens access, but only eliminating the guards unlocks the two-hand chest", () => {
    deliverBox();
    expect(mission().cargoReleased).toBe(true);
    if (mission().enemies.length) expect(mission().chest.unlocked).toBe(false);
    clear(); expect(mission().phase).toBe("haul");
    sim.select(1); expect(sim.haulCargo()).toMatch(/two robots/);
    expect(mission().chest.carriers).toHaveLength(0);
    sim.selectGroup([3, 4]); sim.haulCargo();
    until(() => mission().chest.state === "carried", 20);
    const chest = mission().chest;
    expect(chest.carriers).toHaveLength(2); expect(chest.joints).toHaveLength(2);
    sim.select(chest.carriers[0].id); sim.move({ x: 15, z: 0 }); ticks(6);
    expect(chest.carriers.every(a => a.haul === chest.prop.id)).toBe(true);
    expect(Math.abs(chest.carriers[0].body.translation().x - chest.carriers[1].body.translation().x)).toBeCloseTo(2.8, 1);
    expect(chest.prop.body.translation().x).toBeLessThan(20);
  });

  test("drone waves use real pistol combat, pause when cargo rests, and never blame civilians", () => {
    ticks(5); expect(mission().waves).toBe(0);
    pickBox(); until(() => mission().waves === 1, 4);
    const drone = sim.security!.drones[0]; expect(drone.flight!.contract).toBe(true);
    expect(drone.weapons).toEqual(["pistol"]); expect(sim.security!.pressure).toBe(0);
    sim.select(mission().box.carriers[0].id); sim.haulCargo();
    const carried = mission().carrySeconds; ticks(16);
    expect(mission().waves).toBe(1); expect(mission().carrySeconds).toBe(carried);
    expect(drone.flight!.state).toBe("pursuing");
    expect(mission().enemyShots).toBeGreaterThan(0);
    sim.damage(drone, PISTOL.damage, zero, drone.body.translation(), "pistol");
    expect(sim.security!.pressure).toBe(0);
  });

  test("all stages are playable with real movement, pistol fire and escort pacing", () => {
    deliverBox();
    sim.select(5); sim.move({ x: 15, z: 0 }); ticks(6, true);
    sim.setBrace(true); ticks(9, true); sim.release();
    expect(mission().phase).toBe("haul"); expect(mission().enemies).toHaveLength(0);
    sim.haulCargo(); until(() => mission().chest.state === "carried", 20, true);
    sim.move(HANDLING_SITES.exit);
    until(() => mission().phase === "complete", 50, true);
    expect(sim.squad.every(a => !a.dead)).toBe(true);
    expect(mission().chest.delivered).toBe(true); expect(mission().waves).toBeGreaterThanOrEqual(3);
    expect(sim.shots).toBeGreaterThan(0); expect(mission().enemyShots).toBeGreaterThan(0);
    expect(sim.hauling!.loads.every(l => !l.joints.length)).toBe(true);
  }, 15000);

  test("a dead hand drops the chest; fewer than two survivors fails and clears assignments", () => {
    deliverBox(); clear(); sim.select(5); sim.haulCargo();
    until(() => mission().chest.state === "carried", 25);
    const hand = mission().chest.carriers[0]; sim.damage(hand, hand.hp, zero, hand.body.translation(), "pistol"); sim.step();
    expect(mission().chest.state).toBe("resting"); expect(mission().chest.joints).toHaveLength(0);
    sim.select(5); expect(sim.haulCargo()).toBeNull();
    until(() => mission().chest.state === "carried", 20);
    expect(mission().chest.carriers.every(a => !a.dead)).toBe(true);
    for (const a of sim.squad.filter(a => !a.dead).slice(0, 2)) sim.damage(a, a.hp, zero, a.body.translation(), "pistol");
    sim.step(); expect(mission().phase).toBe("failed"); expect(mission().failureReason).toMatch(/Not enough chassis/);
  });

  test("human export and playback reproduce pickup, a queued haul, physical cargo and drone arrivals", async () => {
    sim.reset(); const recorder = new HumanReplayRecorder("handling-test"); recorder.begin(sim);
    sim.onInput = action => recorder.action(sim, action);
    // Native deployment is recorded by main, like every existing contract.
    recorder.action(sim, { type: "deploy" }); sim.mission!.deploy(); sim.haulCargo(mission().box.prop.id);
    sim.move({ x: -13, z: 2.5 }); sim.move({ x: -9, z: 0 }, true);
    for (let i = 0; i < 10 / STEP; i++) { recorder.beforeStep(sim); sim.step(); recorder.afterStep(sim); }
    const replay = readHumanReplay(recorder.export(sim));
    expect(replay.sessions[0].inputs.some(i => i.data.type === "haul" && i.data.cargo === mission().box.prop.id)).toBe(true);
    expect(mission().waves).toBe(1);
    const fresh = await Simulation.create("handling");
    try { expect(playRecordedSession(fresh, replay.sessions[0])).toEqual(replay.sessions[0].final); }
    finally { fresh.world.free(); }
  });
});
