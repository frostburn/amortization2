import { afterEach, describe, expect, test } from "vitest";
import { STEP, distance2 } from "../src/game/config";
import { HumanReplayRecorder, playRecordedSession, readHumanReplay, replaySnapshot } from "../src/game/replay";
import { ReplayPlayback } from "../src/game/replay-playback";
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

  test("incremental playback bounds seeking, rewinds and applies final-tick commands", async () => {
    const live = await create("proving"), { recorder, advance } = capture(live);
    live.select(5); live.move({ x: -12, z: -4 }); advance(.4);
    live.setBrace(true); live.select(2); // Includes commands on the final tick.
    const session = recorder.export(live).sessions[0];
    const fresh = await create("proving"), player = new ReplayPlayback(fresh, session);
    expect(player.advanceTo(session.endTick, 3)).toBe(false);
    expect(player.tick).toBe(3);
    player.advanceTo(session.endTick);
    expect(replaySnapshot(fresh)).toEqual(session.final);
    player.advanceTo(6);
    expect(player.tick).toBe(6);
    player.advanceTo(session.endTick);
    expect(replaySnapshot(fresh)).toEqual(session.final);
    expect(replaySnapshot(live)).toEqual(session.final);
    expect(recorder.status.sessions).toBe(1);
  });

  test("covering orders, bridge admission and the last-crossing alarm resimulate exactly", async () => {
    const sim = await create("crossing"), { recorder, advance } = capture(sim);
    recorder.action(sim, { type: "deploy" }); sim.mission!.deploy();
    const walk = (timeout: number) => {
      for (let i = 0; i < timeout / STEP && !sim.active.every(a =>
        !a.dead && a.moveTarget && distance2(a.body.translation(), a.moveTarget) < .15); i++) advance(STEP);
      expect(sim.active.every(a => !a.dead && a.moveTarget && distance2(a.body.translation(), a.moveTarget) < .15)).toBe(true);
    };
    sim.selectGroup([1, 2, 3]); sim.move({ x: -12, z: -4 }); walk(8);
    sim.coverSector({ x: 15, z: 0 });
    sim.select(4); sim.move({ x: 10, z: 0 }); walk(14); sim.coverSector({ x: -15, z: 0 });
    for (const id of [3, 1, 2]) {
      sim.select(id); sim.move({ x: 10 + id, z: (id - 2) * 2.5 }); walk(12); sim.coverSector({ x: -15, z: 0 });
    }
    advance(2);
    sim.ceasefire();
    const replay = readHumanReplay(recorder.export(sim));
    expect(replay.sessions[0].events.filter(e => e.data.type === "bridge" && e.data.phase === "alarm")).toHaveLength(1);
    expect(replay.sessions[0].inputs.some(i => i.data.type === "cover")).toBe(true);
    expect(replay.sessions[0].inputs.some(i => i.data.type === "ceasefire")).toBe(true);
    const fresh = await create();
    expect(playRecordedSession(fresh, replay.sessions[0])).toEqual(replay.sessions[0].final);
    expect(fresh.squad.map(a => a.cover)).toEqual(sim.squad.map(a => a.cover));
    expect(fresh.coverHits).toBe(sim.coverHits);
  }, 20000);

  test("incremental playback rejects recorder worlds and unsafe seek times", async () => {
    const live = await create("proving"), { recorder } = capture(live);
    const session = recorder.export(live).sessions[0];
    expect(() => new ReplayPlayback(live, session)).toThrow("unrecorded simulation");
    const fresh = await create("proving"), player = new ReplayPlayback(fresh, session);
    expect(() => player.advanceTo(NaN)).toThrow("Invalid replay time");
    expect(player.advanceTo(999)).toBe(true);
    expect(player.tick).toBe(0);
  });

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

  test("current exports follow same-floor retries without consuming earlier attempts", async () => {
    const sim = await create("proving"), { recorder, advance } = capture(sim);
    const downloads = [];
    for (const id of [1, 2, 3]) {
      if (id > 1) sim.reset();
      sim.select(id); sim.move({ x: -8 + id, z: -4 }); advance(.15);
      const current = readHumanReplay(recorder.export(sim, "current"));
      expect(current.sessions).toHaveLength(1);
      expect(current.sessions[0].final.selected).toEqual([id]);
      expect(current.sessions[0].inputs.some(i => i.data.type === "select" && i.data.id === id)).toBe(true);
      downloads.push(current);
    }
    const history = readHumanReplay(recorder.export(sim, "all"));
    expect(history.sessions).toHaveLength(3);
    expect(history.sessions.map(s => s.final)).toEqual(downloads.map(r => r.sessions[0].final));
    expect(recorder.status.sessions).toBe(3);
    expect(recorder.status.currentSeconds).toBeCloseTo(sim.time);
    const fresh = await create("proving");
    for (const download of downloads)
      expect(playRecordedSession(fresh, download.sessions[0])).toEqual(download.sessions[0].final);
  });

  test("repeated current exports include continued play and leave earlier downloads unchanged", async () => {
    const sim = await create("proving"), { recorder, advance } = capture(sim);
    sim.select(1); advance(.1);
    const first = recorder.export(sim, "current"), saved = structuredClone(first);
    sim.select(2); sim.move({ x: -3, z: -7 }); advance(.2);
    const second = recorder.export(sim, "current");
    expect(first).toEqual(saved);
    expect(second.sessions).toHaveLength(1);
    expect(second.sessions[0].endTick).toBeGreaterThan(first.sessions[0].endTick);
    expect(second.sessions[0].final.selected).toEqual([2]);
    expect(recorder.status.sessions).toBe(1);
    const fresh = await create("proving");
    expect(playRecordedSession(fresh, second.sessions[0])).toEqual(second.sessions[0].final);
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
