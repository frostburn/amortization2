import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { PISTOL, STEP, distance2, type Vec2 } from "../src/game/config";
import { ESCORT_SITES } from "../src/game/escort";
import { EscortMission } from "../src/game/escort-mission";
import { pointerAction } from "../src/game/interaction";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay } from "../src/game/replay";
import { Simulation, type Actor } from "../src/game/simulation";

const zero = { x: 0, y: 0, z: 0 };
describe("Release contract and human escort", () => {
  let sim: Simulation;
  beforeEach(async () => { sim = await Simulation.create("escort"); sim.mission!.deploy(); });
  afterEach(() => sim.world.free());
  const mission = () => sim.mission as EscortMission;
  const ticks = (seconds: number) => { for (let i = 0; i < Math.ceil(seconds / STEP); i++) sim.step(); };
  const place = (a: Actor, p: Vec2) => {
    a.body.setTranslation({ ...p, y: a.kind === "human" ? .85 : .98 }, true);
    a.body.setLinvel(zero, true); a.path = []; a.moveTarget = undefined;
  };
  const clear = (actors: Actor[]) => actors.forEach(a => sim.damage(a, a.hp, zero, a.body.translation(), "pistol"));
  const open = () => { mission().damageFixture([...mission().breakables][0], mission().doorMaxHp); };
  const rescue = () => {
    open(); clear(mission().guards);
    place(sim.squad[2], { x: 29.3, z: -7 }); sim.step();
    expect(mission().phase).toBe("escort");
  };

  test("briefing freezes the encounter; every saved squad gets four pistols and a separate unarmed person", () => {
    for (const model of ["sniper", "minigunner", "assault"] as const) {
      sim.reset("escort", model); ticks(4);
      expect(sim.time).toBe(0); expect(mission().phase).toBe("briefing");
      expect(sim.squad).toHaveLength(4);
      expect(sim.squad.every(a => a.model === "assault" && a.weapons.length === 1 && a.weapon === "pistol")).toBe(true);
      expect(sim.chooseWeapon("rifle")).toBe(false); expect(sim.chooseWeapon("grenade")).toBe(false);
      expect(sim.escort!.human.weapons).toEqual([]); expect(sim.escort!.human.hp).toBe(88);
      expect(mission().guards).toHaveLength(3); expect(mission().reinforcements).toHaveLength(0);
      const selected = [...sim.selected]; sim.select(sim.escort!.human.id); expect([...sim.selected]).toEqual(selected);
    }
    sim.reset("proving"); expect(sim.mission).toBeUndefined(); expect(sim.escort).toBeUndefined();
    expect(sim.actors.some(a => a.kind === "human")).toBe(false);
  });

  test("seven real pistol hits force the shutter; locked access blocks walking and guard fire", () => {
    sim.select(1); sim.move({ x: 18, z: -2 }); ticks(12);
    expect(sim.primary.body.translation().x).toBeLessThan(10);
    expect(mission().enemyShots).toBe(0);
    const a = sim.primary; place(a, { x: 3, z: -2 }); sim.world.step();
    sim.setBrace(true); sim.aim = { x: 10, y: 1.4, z: -2 };
    const handle = [...mission().breakables][0];
    for (let i = 0; i < 7; i++) {
      a.pistol.shotWait = 0; sim.shoot(a);
      expect(mission().doorHp).toBe(Math.max(0, 154 - PISTOL.damage * (i + 1)));
      if (i < 6) expect(mission().phase).toBe("breach");
    }
    expect(sim.shots).toBe(7); expect(a.pistol.ammo).toBe(5);
    expect(mission().phase).toBe("rescue"); expect(mission().obstacles).toHaveLength(0);
    expect(sim.world.getCollider(handle)).toBeNull();
    sim.world.step();
    expect(sim.ray({ x: 8, y: 1.2, z: -2 }, { x: 12, y: 1.2, z: -2 })).toBeNull();
    expect(sim.events.filter(e => e.type === "shot").every(e => e.type === "shot" && e.material === "metal")).toBe(true);
  });

  test("full-height office walls and the roof remain solid when the camera cuts away", () => {
    const roof = mission().roofs[0], a = sim.squad[0];
    place(a, { x: 3, z: -2 }); sim.world.step();
    expect(mission().cutawayRoofs).toEqual([roof]);
    expect(roof.walls).toHaveLength(5);
    const p = { x: 31, y: 1.1, z: -7 };
    expect(sim.ray({ x: 31, y: 10, z: -7 }, p)?.collider.handle).toBe(roof.collider);
    expect(roof.walls).toContain(sim.ray({ x: 39, y: 1.1, z: -7 }, p)?.collider.handle);
    expect(sim.ray({ x: 31, y: 10, z: -7 }, p, undefined, c => !mission().cutawayColliders.has(c.handle))?.collider.handle).toBe(sim.escort!.human.collider.handle);
  });

  test("rescue requires the open entrance, cleared guards and actual access to Quill", () => {
    const a = sim.squad[0], human = sim.escort!.human;
    place(a, { x: 29, z: -7 }); ticks(.2);
    expect(sim.escort!.state).toBe("captive");
    open(); ticks(.2); expect(sim.escort!.state).toBe("captive");
    clear(mission().guards); place(human, { x: 32.5, z: -7 }); place(a, { x: 35.4, z: -7 }); ticks(.2);
    expect(mission().objective).toBe(2); expect(sim.escort!.state).toBe("captive");
    a.body.setTranslation({ x: 31, y: 5, z: -7 }, true); sim.step();
    expect(sim.escort!.state).toBe("captive");
    place(a, { x: 30.3, z: -7 }); sim.step();
    expect(sim.escort!.state).toBe("following"); expect(sim.escort!.guide).toBe(a.id);
    expect(mission().reinforcementAt! - sim.time).toBeCloseTo(5);
  });

  test("Quill clicks and H wait, resume and transfer guides without consuming pistol ammunition", () => {
    rescue(); sim.select(3);
    const escort = sim.escort!, a = sim.primary, ammo = a.pistol.ammo;
    expect(pointerAction(sim, { actor: escort.human.id })).toEqual({ type: "escort" });
    expect(pointerAction(sim, { actor: escort.human.id }, { selecting: true }).type).toBe("group");
    expect(pointerAction(sim, { actor: escort.human.id }, { covering: true }).type).toBe("cover");
    expect(pointerAction(sim, { actor: escort.human.id }, { forceFire: true }).type).toBe("fire");
    sim.escortHuman(); sim.move({ x: 15, z: -2 }); ticks(1);
    expect(escort.state).toBe("waiting"); expect(escort.crouching).toBe(true); expect(escort.human.path).toHaveLength(0);
    expect(escort.human.body.mass()).toBeCloseTo(74);
    const waiting = { ...escort.human.body.translation() };
    sim.escortHuman(); ticks(1);
    expect(escort.state).toBe("following"); expect(escort.guide).toBe(3);
    expect(distance2(escort.human.body.translation(), waiting)).toBeGreaterThan(.3);
    expect(a.pistol.ammo).toBe(ammo);
    sim.select(4); sim.escortHuman(); expect(escort.guide).toBe(4);
    expect(escort.human.weapons).toEqual([]); expect(escort.human.firing).toBe(false);
  });

  test("a lost guide leaves Quill waiting and another living robot can take over", () => {
    rescue(); const guide = sim.escort!.leader!;
    sim.damage(guide, guide.hp, zero, guide.body.translation(), "pistol"); sim.step();
    expect(sim.escort!.state).toBe("waiting"); expect(sim.escort!.guide).toBeUndefined();
    expect(sim.escort!.human.dead).toBe(false);
    sim.select(4); sim.escortHuman(); expect(sim.escort!.guide).toBe(4);
    expect(sim.escort!.state).toBe("following");
  });

  test("one hostile pistol squad arrives only after rescue, and never refits or repeats", () => {
    open(); clear(mission().guards); ticks(25);
    expect(mission().reinforcements).toHaveLength(0); expect(mission().arrivedAt).toBeUndefined();
    place(sim.squad[2], { x: 29.3, z: -7 }); sim.step(); ticks(4.5);
    expect(mission().reinforcements).toHaveLength(0); ticks(.6);
    const squad = mission().reinforcements;
    expect(squad).toHaveLength(4);
    expect(squad.every(a => a.weapons.length === 1 && a.weapon === "pistol" && !a.braced && !a.flight)).toBe(true);
    const arrival = mission().arrivedAt; clear(squad); ticks(30);
    expect(mission().reinforcements).toHaveLength(0); expect(mission().arrivedAt).toBe(arrival);
    expect(sim.actors.filter(a => a.kind === "enemy")).toHaveLength(7);
    expect(sim.security!.pressure).toBe(0);
  });

  test("enemy pistols can kill Quill, while player pistols retain their friendly-fire policy", () => {
    const human = sim.escort!.human, shooter = sim.squad[0];
    clear(mission().guards); place(shooter, { x: 28, z: -7 }); sim.select(1); sim.setBrace(true);
    const enemy = sim.addEnemy("assault", { x: 33, z: -7 }); sim.step();
    sim.aim = { ...enemy.body.translation(), y: 1.15 };
    expect(sim.fireRay(shooter, sim.muzzle(shooter), sim.aim)?.collider.handle).toBe(enemy.collider.handle);
    sim.shoot(shooter); expect(enemy.hp).toBe(enemy.maxHp - PISTOL.damage); expect(human.hp).toBe(human.maxHp);
    enemy.braced = true; ticks(.3); sim.aim = { ...human.body.translation(), y: 1.08 };
    sim.shoot(enemy); expect(human.hp).toBe(human.maxHp - PISTOL.damage);
    expect(sim.events.some(e => e.type === "shot" && e.actor === enemy.id && e.material === "soft")).toBe(true);
    expect(sim.security!.pressure).toBe(0);
    sim.damage(human, human.hp, zero, human.body.translation(), "pistol", "enemy"); sim.step();
    expect(mission().phase).toBe("failed"); expect(mission().failureReason).toMatch(/Quill was killed/);
    expect(pointerAction(sim, { actor: human.id }).type).toBe("blocked");
  });

  test("extraction needs Quill and every survivor for an uninterrupted second", () => {
    rescue(); sim.select(3); sim.escortHuman();
    const site = ESCORT_SITES.exit, human = sim.escort!.human;
    sim.squad.forEach((a, i) => place(a, { x: site.x + (i < 2 ? -1.1 : 1.1), z: site.z + (i % 2 ? -1.1 : 1.1) }));
    ticks(1.1); expect(mission().returnProgress).toBe(0); expect(mission().phase).toBe("escort");
    place(human, { x: site.x + 3, z: site.z }); ticks(.5); expect(mission().returnProgress).toBeGreaterThan(.4);
    place(sim.squad[0], { x: site.x + 8, z: site.z }); sim.step(); expect(mission().returnProgress).toBe(0);
    sim.damage(sim.squad[0], sim.squad[0].hp, zero, sim.squad[0].body.translation(), "pistol");
    ticks(1.1); expect(mission().phase).toBe("complete"); expect(mission().inspect().survivors).toBe(3);
    const time = sim.time, position = { ...human.body.translation() }; ticks(2);
    expect(sim.time).toBe(time); expect(human.body.translation()).toEqual(position);
    sim.reset(); expect(mission().phase).toBe("briefing"); expect(mission().doorHp).toBe(154);
    expect(sim.escort!.state).toBe("captive"); expect(sim.escort!.rescuedAt).toBeUndefined();
  });

  test("losing the squad fails even if Quill has reached the van", () => {
    rescue(); place(sim.escort!.human, ESCORT_SITES.exit); clear(sim.squad); sim.step();
    expect(mission().phase).toBe("failed"); expect(mission().failureReason).toMatch(/No chassis/);
  });

  test("real movement, pistol combat, covering orders and the escort replay through the entire contract", async () => {
    sim.reset(); const recorder = new HumanReplayRecorder("escort-test"); recorder.begin(sim);
    sim.onInput = action => recorder.action(sim, action);
    recorder.action(sim, { type: "deploy" }); mission().deploy();
    const advance = (shoot = false) => {
      if (shoot) {
        const p = sim.primary.body.translation(), target = mission().enemies.slice().sort((a, b) =>
          distance2(a.body.translation(), p) - distance2(b.body.translation(), p))[0];
        sim.trigger = !!target;
        if (target) sim.aim = { ...target.body.translation(), y: target.body.translation().y + .25 };
      }
      recorder.beforeStep(sim); sim.step(); recorder.afterStep(sim); sim.events.length = 0;
    };
    const until = (check: () => boolean, seconds = 20, shoot = false) => {
      for (let i = 0; i < seconds / STEP && !check() && !mission().finished; i++) advance(shoot);
      sim.trigger = false; expect(check(), JSON.stringify(mission().inspect())).toBe(true);
    };
    sim.select(5); sim.move({ x: 3, z: -2 }); until(() => sim.squad.every(a => !a.path.length), 15);
    sim.setBrace(true); sim.aim = { x: 10, y: 1.4, z: -2 }; sim.trigger = true;
    until(() => mission().cargoReleased, 5);
    sim.release(); sim.move({ x: 16, z: -2 }); until(() => !mission().guards.length, 16, true);
    sim.release(); sim.move({ x: 3, z: -2 }); until(() => sim.squad.every(a => !a.path.length), 12);
    sim.reloadSelected(); sim.selectGroup([1, 2, 4]); sim.coverSector({ x: -8, z: 24 }); sim.select(3);
    sim.move({ x: 29.5, z: -7 }); until(() => sim.escort!.rescuedAt !== undefined, 15);
    sim.escortHuman(); for (let i = 0; i < 30; i++) advance(); sim.escortHuman();
    sim.move({ x: 3, z: -4 }); until(() => mission().arrivedAt !== undefined && !mission().reinforcements.length, 25, true);
    until(() => sim.escort!.human.body.translation().x < 8, 28);
    sim.select(5); sim.move(ESCORT_SITES.exit); until(() => mission().phase === "complete", 55, true);
    expect(sim.escort!.human.dead).toBe(false); expect(mission().enemyShots).toBeGreaterThan(2);
    expect(sim.coverHits).toBeGreaterThan(10); expect(sim.shots).toBeGreaterThan(20);
    expect(sim.squad.filter(a => !a.dead).length).toBeGreaterThanOrEqual(3);
    const replay = readHumanReplay(recorder.export(sim)), fresh = await Simulation.create("escort");
    expect(replay.sessions[0].inputs.filter(i => i.data.type === "escort")).toHaveLength(2);
    try { expect(playRecordedSession(fresh, replay.sessions[0])).toEqual(replay.sessions[0].final); }
    finally { fresh.world.free(); }
  }, 15000);
});
