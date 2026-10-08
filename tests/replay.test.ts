import { afterEach, describe, expect, test } from "vitest";
import { STEP } from "../src/game/config";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay, replaySnapshot } from "../src/game/replay";
import { Simulation } from "../src/game/simulation";

const view = { camera: { zoom: 1 }, scope: { visible: false }, paused: false, width: 1440, height: 900 };
describe("development human replays", () => {
  const worlds: Simulation[] = [];
  afterEach(() => { for (const sim of worlds.splice(0)) sim.world.free(); });
  const create = async (range: Simulation["range"] = "receiving") => {
    const sim = await Simulation.create(range); worlds.push(sim); return sim;
  };
  const capture = (sim: Simulation, limit?: number) => {
    const recorder = new HumanReplayRecorder("test-revision", limit);
    recorder.begin(sim);
    sim.onInput = action => recorder.action(sim, action);
    sim.onReset = phase => phase === "before" ? recorder.finish(sim) : recorder.begin(sim);
    const advance = (seconds: number) => {
      for (let i = 0; i < Math.ceil(seconds / STEP); i++) {
        recorder.beforeStep(sim); sim.step(); recorder.afterStep(sim);
        recorder.frame(sim, view); sim.events.length = 0;
      }
    };
    return { recorder, advance };
  };

  test("exported mission intentions reproduce real pistol damage, reload and formation movement", async () => {
    const sim = await create();
    const { recorder, advance } = capture(sim);
    recorder.action(sim, { type: "deploy" }); sim.mission!.deploy();
    sim.selectGroup([1, 2, 3, 4]); sim.setBrace(true);
    sim.aim = { ...sim.mission!.enemies[0].body.translation(), y: 1.25 };
    sim.trigger = true; advance(.75); sim.release();
    sim.reloadSelected(); sim.move({ x: -15, z: 10 }); advance(2);
    const data = readHumanReplay(JSON.parse(JSON.stringify(recorder.export(sim))));
    expect(data.sessions).toHaveLength(1);
    expect(data.sessions[0].events.filter(e => e.data.type === "shot").length).toBeGreaterThanOrEqual(8);
    expect(data.sessions[0].final.actors.find(a => a.id === 100)!.hp).toBe(0);
    expect(data.sessions[0].inputs.some(i => i.data.type === "control" && i.data.trigger)).toBe(true);
    const fresh = await create();
    expect(JSON.parse(JSON.stringify(playRecordedSession(fresh, data.sessions[0])))).toEqual(data.sessions[0].final);
  });

  test("retries retain sealed attempts; debug grenade rotation and scope commands replay on their own floor", async () => {
    const sim = await create(); const { recorder, advance } = capture(sim);
    recorder.action(sim, { type: "deploy" }); sim.mission!.deploy(); advance(.2);
    const first = replaySnapshot(sim);
    sim.reset("proving"); sim.select(5); sim.chooseWeapon("grenade");
    expect(sim.throwGrenade({ x: 10, z: 5 })).toBe(true);
    expect(sim.throwGrenade({ x: 12, z: 5 })).toBe(true);
    advance(.25); sim.release();
    sim.reset("long"); sim.select(4); sim.chooseWeapon("rifle"); sim.toggleSniping();
    sim.aim = { x: 57.7, y: 3.9, z: 0 }; sim.trigger = true; advance(1.3); sim.endSniping();
    const data = recorder.export(sim);
    expect(data.sessions.map(s => s.range)).toEqual(["receiving", "proving", "long"]);
    expect(data.sessions[0].final).toEqual(first);
    expect(data.sessions[1].inputs.filter(i => i.data.type === "grenade").map(i => i.data.type === "grenade" && i.data.actor)).toEqual([1, 2]);
    const fresh = await create();
    for (const session of data.sessions) expect(playRecordedSession(fresh, session)).toEqual(session.final);
  });

  test("pause/export do not advance ticks or duplicate presentation events; limits seal a partial capture", async () => {
    const sim = await create("proving"); const { recorder, advance } = capture(sim, 5);
    advance(.05);
    const before = recorder.export(sim);
    recorder.frame(sim, view); sim.events.length = 0;
    const after = recorder.export(sim);
    expect(after.sessions[0].endTick).toBe(before.sessions[0].endTick);
    expect(after.sessions[0].events).toEqual(before.sessions[0].events);
    sim.select(1); sim.select(2); sim.select(3);
    expect(recorder.status.stopReason).toBe("entry limit");
    const capped = recorder.export(sim); advance(.1); sim.reset("long");
    expect(recorder.export(sim).sessions).toEqual(capped.sessions);
    expect(recorder.status.entries).toBe(5);
    readHumanReplay(capped);
  });

  test("export captures aim and trigger changes made between fixed ticks", async () => {
    const sim = await create(); const { recorder } = capture(sim);
    sim.aim = { x: 12, y: 3, z: 5 }; sim.trigger = true;
    const data = recorder.export(sim);
    const fresh = await create();
    expect(playRecordedSession(fresh, data.sessions[0])).toEqual(data.sessions[0].final);
    expect(data.sessions[0].endTick).toBe(0);
  });

  test("unsupported versions, prototype floor names, malformed commands and unordered ticks fail before simulation", async () => {
    const sim = await create(); const { recorder } = capture(sim);
    const data = recorder.export(sim);
    expect(() => readHumanReplay({ ...data, version: 2 })).toThrow(/version/);
    const session = data.sessions[0];
    expect(() => playRecordedSession(sim, { ...session, range: "toString" as Simulation["range"] })).toThrow(/session/);
    const input = { tick: 0, wallMs: 0, data: { type: "control" as const, aim: { x: Infinity, y: 0, z: 0 }, trigger: true } };
    expect(() => playRecordedSession(sim, { ...session, inputs: [input] })).toThrow(/valid ordered/);
    expect(() => playRecordedSession(sim, { ...session, endTick: 2, inputs: [{ ...input, data: { type: "release" }, tick: 2 }, { ...input, data: { type: "release" }, tick: 1 }] })).toThrow(/valid ordered/);
    expect(sim.time).toBe(0); expect(sim.mission!.phase).toBe("briefing");
  });
});
