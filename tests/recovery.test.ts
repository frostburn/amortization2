import { afterEach, describe, expect, test } from "vitest";
import { STEP, distance2, type Vec2 } from "../src/game/config";
import { Simulation, type Actor } from "../src/game/simulation";
import { RECOVERY_PATROL_DELAY, RecoveryMission } from "../src/game/recovery-mission";
import { RECOVERY_DRIVE_HP, RECOVERY_ROLL_DELAY, RECOVERY_SITES } from "../src/game/recovery";
import { VEHICLES, vehicleFootprint } from "../src/game/traffic";
import { NEXT_CONTRACT } from "../src/game/missions";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay } from "../src/game/replay";

describe("Recovery Fee", () => {
  let sim: Simulation;
  afterEach(() => sim?.world.free());
  const mission = () => sim.mission as RecoveryMission;
  const ticks = (seconds: number, clearEvents = false) => {
    for (let i = 0; i < seconds / STEP; i++) { sim.step(); if (clearEvents) sim.events.length = 0; }
  };
  const place = (a: Actor, p: Vec2) => {
    a.body.setTranslation({ x: p.x, y: (p.y ?? 0) + .93, z: p.z }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true); a.path = []; a.moveTarget = undefined;
  };
  const hit = (amount: number, low = false) => {
    const m = mission(), p = m.truck.body.translation();
    sim.city!.damage(m.truck, amount, { x: 0, y: 0, z: 0 }, { ...p, y: low ? .5 : 1.6 }, "player",
      { x: -28, y: 1.5, z: -10 });
  };
  const killGuards = () => mission().enemies.forEach(a => sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun"));
  const collectCase = () => {
    const load = mission().case, p = load.prop.body.translation(), a = sim.squad.find(a => !a.dead && !sim.isDisrupted(a))!;
    place(a, { x: p.x, z: p.z - 1 }); sim.selectGroup([a.id]);
    expect(sim.haulCargo(load.prop.id)).toBeNull();
    for (let i = 0; i < 6 / STEP && load.state !== "carried"; i++) sim.step();
    sim.step(); // Mission observes the first lift on the following combat tick.
    expect(load.state).toBe("carried");
    return load;
  };

  test.each(["sniper", "minigunner", "assault"] as const)("%s config starts safely and briefing holds the convoy", async model => {
    sim = await Simulation.create("recovery", model);
    expect(NEXT_CONTRACT.priority).toBe("recovery");
    expect(sim.squad[3].model).toBe(model);
    expect(sim.pistolsOnly).toBe(false);
    expect(mission().definition.selectableSquad).toBe(true);
    const initial = { ...mission().truck.body.translation() };
    ticks(15); expect(mission().truck.body.translation()).toEqual(initial); expect(sim.time).toBe(0);
    sim.mission!.deploy(); ticks(RECOVERY_ROLL_DELAY - 1);
    expect(mission().rolling).toBe(false); expect(mission().enemies).toHaveLength(0);
    ticks(5);
    expect(mission().rolling).toBe(true);
    expect(mission().truck.body.translation().x).toBeGreaterThan(initial.x + 2);
    expect(mission().enemyShots).toBe(0);
    expect(sim.squad.every(a => a.hp === a.maxHp)).toBe(true);
  }, 15000);

  test("unopposed convoy follows both bends and escapes instead of looping or stalling", async () => {
    sim = await Simulation.create("recovery"); sim.mission!.deploy();
    let underBridge = false, southTurn = false;
    for (let i = 0; i < 170 / STEP && !mission().finished; i++) {
      sim.step(); const p = mission().truck.body.translation();
      if (Math.abs(p.x + 5) < 2) underBridge = true;
      if (p.z > 5) southTurn = true;
      const road = sim.layout.city!.streets.some(s => s.axis === "x"
        ? Math.abs(p.z - s.at) < s.width / 2 && Math.abs(p.x - s.center) < s.length / 2
        : Math.abs(p.x - s.at) < s.width / 2 && Math.abs(p.z - s.center) < s.length / 2);
      expect(road).toBe(true);
      const s = VEHICLES.TRUCK, yaw = mission().truck.yaw;
      for (const across of [-1, 1]) for (const along of [-1, 1]) {
        const corner = { x: p.x + Math.sin(yaw) * along * s.length / 2 + Math.cos(yaw) * across * s.width / 2,
          z: p.z + Math.cos(yaw) * along * s.length / 2 - Math.sin(yaw) * across * s.width / 2 };
        expect(sim.layout.city!.streets.some(r => r.axis === "x"
          ? Math.abs(corner.z - r.at) <= r.width / 2 + .05 && Math.abs(corner.x - r.center) <= r.length / 2
          : Math.abs(corner.x - r.at) <= r.width / 2 + .05 && Math.abs(corner.z - r.center) <= r.length / 2),
        `truck leaves the asphalt at ${JSON.stringify(corner)}`).toBe(true);
      }
    }
    expect(underBridge).toBe(true); expect(southTurn).toBe(true);
    expect(mission().phase, JSON.stringify(mission().inspect())).toBe("failed");
    expect(mission().escaped).toBe(true);
    expect(mission().failureReason).toBe("The cargo truck left the district");
    expect(mission().truck.laps).toBe(0);
    expect(mission().enemies).toHaveLength(0);
  }, 15000);

  test("drive damage stops a healthy truck and persists after settling or a new route", async () => {
    sim = await Simulation.create("recovery"); sim.mission!.deploy(); ticks(20);
    hit(RECOVERY_DRIVE_HP); sim.step();
    const m = mission(), p = { ...m.truck.body.translation() };
    expect(m.truck.hp).toBe(780); expect(m.truck.driveHp).toBe(0);
    expect(m.phase).toBe("secure"); expect(m.loadCondition).toBe("intact");
    sim.city!.traffic.go(m.truck, { x: 80, z: 20 });
    ticks(8);
    expect(m.truck.state).toBe("disabled");
    expect(distance2(p, m.truck.body.translation())).toBeLessThan(1);
    expect(m.enemies).toHaveLength(5);
    expect(m.enemies.filter(a => a.weapon === "gun")).toHaveLength(2);
    expect(m.enemies.filter(a => a.weapon === "pistol")).toHaveLength(3);
    expect(sim.security!.pressure).toBe(0);
    // A ground order across the stopped truck must route around its body.
    const actor = sim.squad[0], body = vehicleFootprint(m.truck);
    place(actor, { x: body.x, z: body.z + 8 });
    sim.navigate(actor, { x: body.x, z: body.z - 8 });
    expect(actor.path.length).toBeGreaterThan(1);
    expect(actor.path.some(p => Math.abs(p.x - body.x) > body.w / 2 + .5)).toBe(true);
  });

  test("low drive shots need less damage than payload shots", async () => {
    sim = await Simulation.create("recovery"); sim.mission!.deploy();
    hit(30, true); expect(mission().truck.driveHp).toBe(60);
    hit(30, true); expect(mission().truck.driveHp).toBe(0); expect(mission().truck.hp).toBe(840);
  });

  test("contact deploys only one finite detail, even if the security van is destroyed", async () => {
    sim = await Simulation.create("recovery"); sim.mission!.deploy();
    const m = mission(), van = m.securityVan;
    sim.city!.damage(van, van.hp, { x: 0, y: 0, z: 0 }, van.body.translation(), "player");
    sim.step(); expect(m.enemies).toHaveLength(5);
    expect(m.truck.driveHp).toBe(RECOVERY_DRIVE_HP);
    killGuards(); ticks(25);
    expect(m.enemies).toHaveLength(0); expect(m.inspect().guards).toBe(5);
    expect(m.phase).toBe("intercept"); expect(m.truck.body.translation().x).toBeGreaterThan(-76);
    expect(sim.security!.pressure).toBe(0);
    const civilian = sim.city!.vehicles.find(c => !c.team && c !== m.recoveryVan)!;
    sim.city!.damage(civilian, 6, { x: 0, y: 0, z: 0 }, civilian.body.translation(), "player");
    expect(sim.security!.pressure).toBe(1);
  });

  test.each([2, 30])("engagement at %s seconds does not park the scout across the operational truck's route", async seconds => {
    sim = await Simulation.create("recovery"); sim.mission!.deploy(); ticks(seconds);
    const m = mission(), p = m.scout.body.translation();
    sim.city!.damage(m.scout, 1, { x: 0, y: 0, z: 0 }, p, "player"); sim.step();
    expect(m.engagedAt).toBeDefined();
    // Keep combat out of this vehicle-controller check.
    killGuards(); ticks(25);
    const before = { ...m.truck.body.translation() };
    ticks(15);
    expect(distance2(m.truck.body.translation(), before)).toBeGreaterThan(15);
    expect(m.scout.parked).toBe(false);
  });

  test("machinegunners brace and fire bursts, while pistol escorts approach without grenades", async () => {
    sim = await Simulation.create("recovery", "assault"); sim.mission!.deploy(); hit(6); sim.step();
    const m = mission();
    sim.squad.forEach((a, i) => place(a, { x: -41 + i * 2, z: -24 }));
    ticks(20);
    const shots = sim.events.filter(e => e.type === "shot" && m.enemies.some(a => a.id === e.actor));
    expect(shots.some(e => e.type === "shot" && e.weapon === "gun")).toBe(true);
    expect(shots.some(e => e.type === "shot" && e.weapon === "pistol")).toBe(true);
    expect(m.enemies.some(a => a.weapon === "gun" && a.braced)).toBe(true);
    expect(m.enemyShots).toBeGreaterThan(12);
    expect(sim.squad.some(a => a.hp < a.maxHp)).toBe(true);
    expect(sim.grenades).toHaveLength(0);
    expect(m.truck.hp).toBe(894);
  });

  test.each([60, 80])("late interception at %s seconds deploys onto clear ground", async seconds => {
    sim = await Simulation.create("recovery", "assault"); sim.mission!.deploy(); ticks(seconds);
    hit(RECOVERY_DRIVE_HP); sim.step();
    expect(mission().enemies).toHaveLength(5);
    for (const a of mission().enemies) {
      const p = sim.walkingPoint(a);
      expect(sim.terrain!.canStand({ ...p, y: 0 })).toBe(true);
      expect(sim.city!.vehicles.every(c => {
        const b = vehicleFootprint(c);
        return Math.abs(p.x - b.x) >= b.w / 2 + .5 || Math.abs(p.z - b.z) >= b.d / 2 + .5;
      })).toBe(true);
    }
  });

  test("raised overwatch is reached by a ramp, while ground orders stay below its deck", async () => {
    sim = await Simulation.create("recovery", "sniper"); sim.mission!.deploy();
    const a = sim.squad[3]; sim.navigate(a, { x: -5, z: -24, y: 4.8 });
    ticks(25);
    expect(sim.walkingPoint(a).y).toBeCloseTo(4.8, 1);
    expect(distance2(a.body.translation(), { x: -5, z: -24 })).toBeLessThan(.5);
    const b = sim.squad[0]; place(b, { x: -15, z: -24 });
    sim.navigate(b, { x: 3, z: -24, y: 0 }); ticks(7);
    expect(sim.walkingPoint(b).y).toBeCloseTo(0, 1);
    expect(distance2(b.body.translation(), { x: 3, z: -24 })).toBeLessThan(.5);
  });

  test.each([false, true])("secures %s-destroyed cargo then recovers every survivor", async destroyed => {
    sim = await Simulation.create("recovery", "assault"); sim.mission!.deploy();
    hit(destroyed ? 1000 : RECOVERY_DRIVE_HP); sim.step(); killGuards();
    expect(mission().phase).toBe("secure");
    place(sim.squad[0], { x: -76, z: -19 }); sim.step();
    expect(mission().phase).toBe("return"); expect(mission().cargoReleased).toBe(true);
    expect(mission().loadCondition).toBe(destroyed ? "salvage" : "intact");
    ticks(2); expect(mission().phase).toBe("return");
    const load = collectCase(); sim.hauling!.drop(load);
    sim.squad.forEach((a, i) => place(a, { x: RECOVERY_SITES.exit.x + (i % 2) * 2 - 1, z: RECOVERY_SITES.exit.z + Math.floor(i / 2) * 2 - 1 }));
    ticks(1.1); expect(mission().phase).toBe("return"); // Squad alone is insufficient.
    load.prop.body.setTranslation({ ...RECOVERY_SITES.exit, y: load.prop.h / 2 + .02 }, true);
    ticks(1.1); expect(mission().phase).toBe("complete");
    expect(load.delivered).toBe(true);
    expect(mission().recoveryVan.distance).toBeGreaterThan(0);
  });

  test("first lift starts one finite pursuit; dropping and collecting the case cannot reset it", async () => {
    sim = await Simulation.create("recovery", "assault"); sim.mission!.deploy();
    expect(mission().case.prop.body.isEnabled()).toBe(false);
    hit(RECOVERY_DRIVE_HP); sim.step(); killGuards(); place(sim.squad[0], { x: -76, z: -19 }); sim.step();
    const m = mission(); expect(m.case.unlocked).toBe(true); expect(m.case.prop.body.isEnabled()).toBe(true);
    ticks(10); expect(m.patrolAt).toBeUndefined();
    const load = collectCase(), due = m.pursuitDue!;
    expect(due).toBeGreaterThan(sim.time); sim.hauling!.drop(load);
    ticks(1); collectCase(); expect(m.pursuitDue).toBe(due);
    ticks(RECOVERY_PATROL_DELAY + 1); expect(m.patrolAt).toBeDefined(); expect(m.inspect().patrol).toBe(3);
    expect(m.enemies.filter(a => a.weapon === "gun")).toHaveLength(1);
    expect(m.enemies.filter(a => a.weapon === "pistol")).toHaveLength(2);
    expect(m.enemies.every(a => sim.terrain!.canStand({ ...sim.walkingPoint(a), y: 0 }))).toBe(true);
    ticks(10); expect(m.inspect().patrol).toBe(3); expect(m.enemyShots).toBeGreaterThan(0);
    // Extraction is an escape, not another kill-all objective.
    sim.hauling!.drop(load); load.prop.body.setTranslation({ ...RECOVERY_SITES.exit, y: .295 }, true);
    sim.squad.filter(a => !a.dead).forEach((a, i) => place(a, { x: -43 + i % 2 * 2, z: 30 + Math.floor(i / 2) * 2 }));
    ticks(1.1); expect(m.phase).toBe("complete"); expect(m.enemies.length).toBeGreaterThan(0);
  });

  test("pickup van blocks bullets and the west service entrance admits ground movement", async () => {
    sim = await Simulation.create("recovery"); sim.mission!.deploy();
    const hit = sim.ray({ x: -51, y: 1, z: 24 }, { x: -51, y: 1, z: 38 });
    expect(hit).not.toBeNull();
    const a = sim.squad[0]; place(a, { x: -59, z: 20 }); sim.navigate(a, { x: -48, z: 20 }); ticks(5);
    expect(distance2(a.body.translation(), { x: -48, z: 20 })).toBeLessThan(.5);
  });

  test("normal fire and convoy response replay even when the renderer drains events", async () => {
    sim = await Simulation.create("recovery", "sniper");
    const r = new HumanReplayRecorder("recovery-test"); r.begin(sim);
    sim.onInput = action => r.action(sim, action);
    r.action(sim, { type: "deploy" }); sim.mission!.deploy();
    sim.selectGroup([1, 2, 3]); sim.move({ x: -17, z: -13 });
    for (let i = 0; i < 35 / STEP; i++) {
      if (sim.time > 8) { const p = mission().truck.body.translation(); sim.aim = { x: p.x, y: 1.6, z: p.z }; sim.trigger = true; }
      r.beforeStep(sim); sim.step(); r.afterStep(sim); sim.events.length = 0;
    }
    sim.release();
    const replay = readHumanReplay(r.export(sim));
    expect(replay.sessions[0].final.shots).toBeGreaterThan(0);
    expect(replay.sessions[0].final.mission?.engagedAt).toBeDefined();
    const fresh = await Simulation.create("recovery");
    try { expect(playRecordedSession(fresh, replay.sessions[0])).toEqual(replay.sessions[0].final); }
    finally { fresh.world.free(); }
  }, 15000);
});
