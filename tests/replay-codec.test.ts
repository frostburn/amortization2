import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compactHumanReplay, expandHumanReplay, stringifyHumanReplay } from "../src/game/replay-codec";
import { STEP } from "../src/game/config";
import { readHumanReplay, playRecordedSession, type HumanReplay, type ReplaySession } from "../src/game/replay";
import { longReplayTest } from "./long-replay";

/** Two ticks of authored codec data; normal tests never load a run or physics. */
function legacy(): HumanReplay {
  const initial: ReplaySession["initial"] = {
    tick: 0, mission: null, arena: null, selected: [1], aim: {x: 1, y: 2, z: 3},
    trigger: false, sniping: false, shots: 0, hits: 0, throws: 0,
    actors: [1, 100].map(id => ({ id, kind: id === 1 ? "player" : "plate", model: null,
      hp: 100, position: {x: id / 8, y: .98, z: -3.125}, yaw: 0, weapon: "gun",
      ammo: 90, reload: 0, braced: false, hauling: null, firing: false, stagger: 0, goal: null, ai: null })),
    civilians: [],
  };
  const middle = structuredClone(initial); middle.tick = 1;
  middle.aim = {x: -8.12345678912345, y: .0123456789, z: -3.9876543210987};
  middle.actors[0].position.x += .125;
  const final = structuredClone(middle); final.tick = 2;
  final.shots = final.hits = 1; final.actors[0].ammo--; final.actors[1].hp = 0;
  return { format: "amortization2-human-replay", version: 1, step: STEP,
    revision: "tiny-codec-fixture", createdAt: "2026-10-12T00:00:00Z", exportedAt: "2026-10-12T00:00:01Z", stopReason: null,
    sessions: [{ range: "proving", mode: "practice", fourthModel: "sniper", seed: 1729, endTick: 2,
      initial, final, snapshots: [initial, middle, final],
      inputs: [{tick: 0, wallMs: -5, data: {type: "control", aim: middle.aim, trigger: true}},
        {tick: 1, wallMs: 16, data: {type: "move", point: {x: middle.aim.x, y: 0, z: middle.aim.z}, queued: false}}],
      events: [{tick: 2, wallMs: 33, data: {type: "down", actor: 100, position: final.actors[1].position}}],
      views: [{tick: 0, wallMs: 0, data: {camera: {zoom: 1}, scope: {visible: false}, paused: false, width: 1280, height: 720}}],
    }] };
}

describe("compact human replay files", () => {
  test("legacy and compact files preserve every observation and exact input coordinate", () => {
    const replay = readHumanReplay(legacy());
    expect(readHumanReplay(JSON.parse(JSON.stringify(replay)))).toEqual(replay);
    const compact = compactHumanReplay(replay), json = stringifyHumanReplay(replay);
    expect(compact.version).toBe(2);
    expect(readHumanReplay(JSON.parse(json))).toEqual(replay);
    expect(json.length).toBeLessThan(JSON.stringify(replay, null, 2).length * .4);
  });

  longReplayTest("a real movement capture reproduces physics after compact import", async () => {
    const { Simulation } = await import("../src/game/simulation");
    const archived = readHumanReplay(JSON.parse(readFileSync(new URL("../docs/replays/timber-rights-terrain.json", import.meta.url), "utf8")));
    const replay = readHumanReplay(JSON.parse(stringifyHumanReplay(archived)));
    const session = replay.sessions[0], sim = await Simulation.create(session.range, session.fourthModel, session.mode);
    try { expect(playRecordedSession(sim, session)).toEqual(session.final); }
    finally { sim.world.free(); }
  });

  test("array growth, removed properties, nulls, unchanged frames and independent decoded snapshots", () => {
    const replay = readHumanReplay(legacy()), s = replay.sessions[0];
    s.snapshots = [structuredClone(s.initial), structuredClone(s.final), structuredClone(s.final)];
    s.snapshots[1].actors = s.snapshots[1].actors.slice(1);
    delete (s.snapshots[1].actors[0] as unknown as Record<string, unknown>).goal;
    s.snapshots[1].actors[0].hauling = 7;
    const decoded = readHumanReplay(JSON.parse(stringifyHumanReplay(replay)));
    expect(decoded).toEqual(replay);
    decoded.sessions[0].snapshots[2].actors[0].hp = -1;
    expect(decoded.sessions[0].final.actors[0].hp).toBe(s.final.actors[0].hp);
    expect(decoded.sessions[0].initial.actors[0].hp).toBe(s.initial.actors[0].hp);
  });

  test("multi-attempt history and partial-capture metadata roundtrip", () => {
    const replay = readHumanReplay(legacy());
    replay.sessions.push(structuredClone(replay.sessions[0])); replay.stopReason = "entry limit";
    expect(readHumanReplay(JSON.parse(stringifyHumanReplay(replay)))).toEqual(replay);
  });

  test("malformed tuples, patches and deep nesting are rejected", () => {
    const change = (edit: (r: ReturnType<typeof compactHumanReplay>) => void) => {
      const compact = compactHumanReplay(legacy()); edit(compact);
      expect(() => readHumanReplay(compact)).toThrow(/compact|limits/);
    };
    change(r => { r.sessions[0].inputs[0] = [0, 0] as never; });
    change(r => { r.sessions[0].snapshots[0] = [] as never; });
    change(r => { r.sessions[0].snapshots[0] = { actors: { length: [0] } }; });
    change(r => { r.sessions[0].snapshots[0] = JSON.parse('{"__proto__":{"polluted":[true]}}'); });
    change(r => { r.sessions[0].snapshots[0] = null as never; });
    change(r => {
      let patch: unknown = [0]; for (let i = 0; i < 60; i++) patch = { x: patch };
      r.sessions[0].snapshots[0] = patch as never;
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  test("expanded observations obey a small budget without allocating a huge replay", () => {
    const compact = compactHumanReplay(legacy());
    expect(expandHumanReplay(compact, 2000)).toEqual(legacy());
    compact.sessions[0].snapshots = Array.from({length: 80}, () => ({}));
    expect(() => expandHumanReplay(compact, 2000)).toThrow(/limits/);
    expect(() => expandHumanReplay(compact, NaN)).toThrow(/limits/);
  });
});
