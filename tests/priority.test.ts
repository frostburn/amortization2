import { afterEach, describe, expect, test } from "vitest";
import { PISTOL, STEP, ROBOT_MODELS, distance2, type Vec2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";
import { PriorityMission } from "../src/game/priority-mission";
import { PRIORITY_RESPONSE, PRIORITY_SITES } from "../src/game/priority";
import { NEXT_CONTRACT } from "../src/game/missions";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay } from "../src/game/replay";

describe("Priority Access", () => {
  let sim: Simulation;
  afterEach(() => sim?.world.free());
  const mission = () => sim.mission as PriorityMission;
  const ticks = (seconds: number) => { for (let i = 0; i < seconds / STEP; i++) sim.step(); };
  const until = (condition: () => boolean, seconds = 50) => {
    for (let i = 0; i < seconds / STEP && !condition(); i++) sim.step();
    expect(condition(), JSON.stringify(mission().inspect())).toBe(true);
  };
  const disable = (actors: Simulation["actors"]) => {
    for (const a of actors) sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, a.body.translation(), "gun");
  };
  const place = (a: Simulation["actors"][number], p: Vec2) => {
    a.body.setTranslation({ x: p.x, y: (p.y ?? 0) + (a.kind === "human" ? .85 : .93), z: p.z }, true);
    a.body.setLinvel({ x: 0, y: 0, z: 0 }, true); a.path = []; a.moveTarget = undefined;
  };
  const open = async (model: "sniper" | "minigunner" | "assault" = "sniper") => {
    sim = await Simulation.create("priority", model); sim.mission!.deploy(); disable(mission().guards);
    place(sim.squad[0], { x: PRIORITY_SITES.loading.x, z: PRIORITY_SITES.loading.z - 4 }); ticks(1.1);
    place(sim.squad[0], PRIORITY_SITES.dispatch); ticks(1.6);
    expect(mission().phase).toBe("restore");
  };

  // The first creation initializes Rapier and warms the district's layered
  // navigation cache; shared CI runners need more than the default five seconds.
  test.each(["sniper", "minigunner", "assault"] as const)("deploys the chosen %s configuration and freezes it in briefing", async model => {
    sim = await Simulation.create("priority", model);
    expect(mission().definition.selectableSquad).toBe(true);
    expect(NEXT_CONTRACT.escort).toBe("priority");
    expect(sim.pistolsOnly).toBe(false);
    expect(sim.squad[3].model).toBe(model);
    expect(sim.squad[3].weapons).toEqual(ROBOT_MODELS[model].weapons);
    expect(sim.squad[1].model).toBe(model === "minigunner" ? "minigunner" : "assault");
    expect(sim.squad[0].weapon).toBe("gun"); expect(sim.squad[2].weapon).toBe("gun");
    sim.trigger = true; ticks(3); expect(sim.time).toBe(0); expect(sim.shots).toBe(0);
    expect(sim.city!.porters.every(p => !!p.grip && !p.transfers)).toBe(true);
    sim.reset("receiving", model);
    expect(sim.pistolsOnly).toBe(true);
    expect(sim.squad.every(a => a.weapon === "pistol" && a.model === "assault")).toBe(true);
  }, 15_000);

  test.each(["sniper", "minigunner", "assault"] as const)("%s deployment stays safe while the player orients", async model => {
    sim = await Simulation.create("priority", model); sim.mission!.deploy();
    // The pickup van and deployed squad must leave both traffic lanes clear.
    for (const z of [25.6, 30.4]) expect(sim.ray({ x: -52, y: .35, z }, { x: -38, y: .35, z })).toBeNull();
    ticks(20);
    expect(mission().enemyShots).toBe(0);
    expect(sim.squad.every(a => a.hp === a.maxHp)).toBe(true);
    expect(mission().guards.every(a => a.ai!.target === null && a.ai!.state === "holding")).toBe(true);
  });

  test("pistol defenders engage an advancing squad without an opening burst or grenade", async () => {
    sim = await Simulation.create("priority", "assault"); sim.mission!.deploy();
    expect(mission().guards.every(a => a.weapon === "pistol" && a.weapons.length === 1 &&
      a.pistol.ammo === PISTOL.magazine && a.ammo === 0)).toBe(true);
    sim.select(5); sim.move({ x: -16, z: 25 }); ticks(9);
    const shots = sim.events.filter(e => e.type === "shot" && mission().guards.some(a => a.id === e.actor));
    expect(shots.length).toBeGreaterThan(0);
    expect(shots.every(e => e.type === "shot" && e.weapon === "pistol")).toBe(true);
    expect(sim.squad.some(a => a.hp < a.maxHp)).toBe(true);
    expect(sim.squad.every(a => !a.dead)).toBe(true);
    expect(sim.grenades).toHaveLength(0);
  });

  test("all four ramps are connected and a street order stays below the concourse", async () => {
    sim = await Simulation.create("priority"); sim.mission!.deploy(); disable(mission().guards);
    sim.select(1);
    sim.move({ x: -42, z: -10, y: 4.8 });
    until(() => !sim.primary.path.length && Math.abs(sim.walkingPoint(sim.primary).y - 4.8) < .15, 30);
    sim.move({ x: 42, z: -10, y: 4.8 });
    until(() => !sim.primary.path.length && distance2(sim.primary.body.translation(), { x: 42, z: -10 }) < .2, 40);
    sim.move({ x: 42, z: -43, y: 0 });
    until(() => !sim.primary.path.length && Math.abs(sim.walkingPoint(sim.primary).y) < .15, 25);
    sim.move({ x: 10, z: -10, y: 0 });
    until(() => !sim.primary.path.length && distance2(sim.primary.body.translation(), { x: 10, z: -10 }) < .2, 35);
    expect(sim.primary.body.translation().y).toBeCloseTo(.93, 1);
    // A ground robot under the objective's X/Z must never operate an upper pad.
    place(sim.primary, { ...PRIORITY_SITES.loading, y: 4.8 }); ticks(.4);
    expect(mission().removal).not.toBe("secured");
  });

  test("equipment stays in the loading bay through a long approach and leaves the service lane usable", async () => {
    sim = await Simulation.create("priority"); sim.mission!.deploy(); disable(mission().guards);
    ticks(85);
    expect(mission().finished).toBe(false); expect(mission().phase).toBe("seizure");
    expect(mission().removal).toBe("held");
    expect(distance2(mission().recovery.body.translation(), PRIORITY_SITES.loading)).toBeLessThan(.1);
    expect(mission().recovery.parked).toBe(true); expect(mission().recovery.arrival).toBeUndefined();
    expect(mission().gateOpen).toBe(false);
    place(sim.squad[0], { x: mission().equipmentSite.x, z: mission().equipmentSite.z - 4 }); ticks(1.1);
    expect(mission().removal).toBe("secured"); expect(mission().phase).toBe("dispatch");
    place(sim.squad[0], PRIORITY_SITES.dispatch); ticks(1.6);
    for (let i = 0; i < 90 / STEP && mission().phase !== "return"; i++) {
      disable(mission().response); sim.step();
    }
    expect(distance2(mission().service.body.translation(), PRIORITY_SITES.serviceStop)).toBeLessThan(2);
    expect(mission().service.parked).toBe(true);
    expect(mission().inspect().serviceBlockedSeconds).toBe(0);
    expect(mission().repairing).toHaveLength(2);
    expect(mission().phase, JSON.stringify(mission().inspect())).toBe("return");
  });

  test("technicians still disembark and finish on foot if another vehicle blocks their driveway", async () => {
    await open();
    sim.city!.traffic.park("CAB", 0x687f87, { x: 46, z: 0 }, -Math.PI / 2);
    for (let i = 0; i < 90 / STEP && mission().phase !== "return"; i++) {
      disable(mission().response); sim.step();
    }
    expect(mission().service.body.translation().x).toBeGreaterThan(PRIORITY_SITES.serviceStop.x + 8);
    expect(mission().repairing).toHaveLength(2);
    expect(mission().phase, JSON.stringify(mission().inspect())).toBe("return");
  });

  test("a loading-bay visit does not open access through a live perimeter", async () => {
    sim = await Simulation.create("priority"); sim.mission!.deploy();
    place(sim.squad[0], { x: PRIORITY_SITES.loading.x, z: PRIORITY_SITES.loading.z - 4 }); ticks(1.1);
    expect(mission().removal).toBe("secured"); expect(mission().phase).toBe("yard");
    place(sim.squad[0], PRIORITY_SITES.dispatch); ticks(2);
    expect(mission().gateOpen).toBe(false); expect(mission().responseAt).toBeUndefined();
  });

  test("street and concourse reinforcements arrive once, physically below their access ramp", async () => {
    await open();
    const at = mission().responseAt!;
    ticks(6); expect(mission().response).toHaveLength(0);
    ticks(1.2); expect(mission().response).toHaveLength(4);
    expect(mission().response.every(a => a.weapon === "pistol" && a.weapons.length === 1 &&
      a.pistol.ammo === PISTOL.magazine && a.ammo === 0 && a.ai!.nextGrenade === Infinity)).toBe(true);
    disable(mission().response); ticks(9.1);
    expect(mission().response).toHaveLength(2);
    expect(mission().response.every(a => a.spawn.y < 1.1 && a.ai!.rally.y === 4.8)).toBe(true);
    expect(mission().response.every(a => a.weapon === "pistol" && a.weapons.length === 1 && a.ai!.nextGrenade === Infinity)).toBe(true);
    expect(sim.time - at).toBeGreaterThanOrEqual(PRIORITY_RESPONSE[1].delay);
    disable(mission().response); ticks(8);
    expect(sim.actors.filter(a => a.kind === "enemy")).toHaveLength(12);
    expect(mission().inspect().responseGroups).toBe(2);
  });

  test("a street attacker commits to its flank around a filled ramp instead of oscillating", async () => {
    await open("assault"); ticks(17);
    const attacker = mission().response.find(a => a.ai!.gate === "STREET RESPONSE" && a.ai!.flank > 0)!;
    disable(mission().response.filter(a => a !== attacker));
    place(attacker, { x: 48, z: 14 });
    // Isolate the intended target; access no longer leaves a van masking the
    // service-door robot from this attacker.
    sim.squad.slice(0, 3).forEach((a, i) => place(a, { ...PRIORITY_SITES.exit, x: PRIORITY_SITES.exit.x + i * 2 }));
    place(sim.squad[3], { x: 20.5, z: 4.6 });
    Object.assign(attacker.ai!, { state: "advancing", target: null, visible: false,
      entryUntil: 0, nextThink: 0, nextRoute: 0, nextAttack: Infinity });
    until(() => attacker.ai!.visible, 12);
    expect(attacker.ai!.target).toBe(4);
    expect(Math.abs(sim.walkingPoint(attacker).y)).toBeLessThan(.1);
  });

  test("a robot beside the ramp railing routes around its foot instead of catching on the corner", async () => {
    sim = await Simulation.create("priority"); sim.mission!.deploy(); disable(mission().guards);
    sim.select(1); place(sim.primary, { x: 46.37, z: 21.005 });
    const goal = { x: 42.78, z: 22.72, y: 0 };
    sim.move(goal);
    until(() => !sim.primary.path.length && distance2(sim.primary.body.translation(), goal) < .2, 8);
    expect(Math.abs(sim.walkingPoint(sim.primary).y)).toBeLessThan(.1);
  });

  test.each(["sniper", "minigunner", "assault"] as const)("%s contract can restart service with real vehicle/crew navigation, then recover the whole squad", async model => {
    sim = await Simulation.create("priority", model); sim.mission!.deploy(); disable(mission().guards);
    sim.select(1); sim.move({ x: PRIORITY_SITES.loading.x, z: PRIORITY_SITES.loading.z - 4 });
    until(() => mission().removal === "secured", 45);
    sim.move(PRIORITY_SITES.dispatch); until(() => mission().phase === "restore", 25);
    // Resolve the finite combat encounters to isolate access, crew routing and
    // completion. Combat itself is exercised separately with actual bullets.
    for (let i = 0; i < 90 / STEP && mission().phase !== "return"; i++) {
      disable(mission().response); sim.step();
    }
    expect(mission().phase, JSON.stringify(mission().inspect())).toBe("return");
    expect(mission().technicians).toHaveLength(2);
    expect(mission().repairing).toHaveLength(2);
    expect(mission().repairProgress).toBe(1);
    expect(mission().cargoReleased).toBe(true);
    ticks(2);
    expect(sim.city!.porters.some(p => p.transfers > 0 || p.distance > 0)).toBe(true);
    expect(sim.city!.vehicles.filter(c => !c.commanded && c.model === "VAN").every(c => !c.parked)).toBe(true);
    expect(mission().obstacles).toHaveLength(0);
    sim.select(5); sim.move(PRIORITY_SITES.exit);
    until(() => mission().phase === "complete", 55);
    expect(mission().inspect().survivors).toBe(4);
  });

  test("contesting the service door pauses repair, retaining completed work", async () => {
    await open(); ticks(17);
    const defender = mission().response[0];
    disable(mission().response.filter(a => a !== defender));
    mission().technicians.forEach((a, i) => place(a, PRIORITY_SITES.technicians[i]));
    // Wait for the actual crew to enter, rather than fabricate human actors.
    until(() => mission().technicians.length > 0, 30);
    mission().technicians.forEach((a, i) => place(a, PRIORITY_SITES.technicians[i]));
    mission().repairProgress = .4;
    place(defender, { x: 11, z: -12, y: 4.8 });
    expect(mission().contested).toBe(true);
    const before = mission().repairProgress;
    mission().updateObjectives();
    expect(mission().repairProgress).toBe(before);
    disable([defender]); mission().updateObjectives();
    expect(mission().repairProgress).toBeGreaterThan(before);
  });

  test("losing the service crew fails the contract instead of leaving a stuck progress bar", async () => {
    await open();
    until(() => mission().technicians.length > 0, 30);
    disable(mission().technicians); sim.step();
    expect(mission().phase).toBe("failed"); expect(mission().failureReason).toBe("The service crew was killed");
  });

  test("the selected loadout, armed fire and mission stage survive replay export/import", async () => {
    sim = await Simulation.create("priority", "minigunner");
    const recorder = new HumanReplayRecorder("priority-test"); recorder.begin(sim);
    recorder.action(sim, { type: "deploy" }); sim.mission!.deploy();
    recorder.action(sim, { type: "select", id: 2, additive: false }); sim.select(2);
    sim.aim = { x: -17, y: 1.65, z: 18 }; sim.trigger = true;
    for (let i = 0; i < 100; i++) { recorder.beforeStep(sim); sim.step(); recorder.afterStep(sim); }
    expect(sim.shots).toBeGreaterThan(10);
    const replay = readHumanReplay(recorder.export(sim));
    const session = replay.sessions[0], played = playRecordedSession(sim, session);
    expect(sim.fourthModel).toBe("minigunner");
    expect(played.shots).toBe(session.final.shots);
    expect(played.mission?.phase).toBe(session.final.mission?.phase);
    expect(sim.squad.map(a => a.model)).toEqual(["assault", "minigunner", "assault", "minigunner"]);
  });
});
