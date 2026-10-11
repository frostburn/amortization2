import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import { compactHumanReplay, stringifyHumanReplay } from "../src/game/replay-codec";
import { readHumanReplay, playRecordedSession, type HumanReplay } from "../src/game/replay";
import { Simulation } from "../src/game/simulation";

const legacy = () => readHumanReplay(JSON.parse(readFileSync(new URL("../docs/replays/timber-rights-terrain.json", import.meta.url), "utf8")));
describe("compact human replay files", () => {
  test("legacy and compact files preserve every observation and exact input coordinate", () => {
    const replay = readHumanReplay(legacy());
    expect(replay.version).toBe(1);
    expect(readHumanReplay(JSON.parse(JSON.stringify(replay)))).toEqual(replay);
    const compact = compactHumanReplay(replay), json = stringifyHumanReplay(replay);
    expect(compact.version).toBe(2);
    expect(readHumanReplay(JSON.parse(json))).toEqual(replay);
    expect(json.length).toBeLessThan(JSON.stringify(replay, null, 2).length * .4);
    expect(replay.sessions[0].inputs.find(e => e.data.type === "move")?.data).toEqual(
      readHumanReplay(compact).sessions[0].inputs.find(e => e.data.type === "move")?.data);
  });

  test("a real movement capture reproduces physics after compact import", async () => {
    const replay = readHumanReplay(JSON.parse(stringifyHumanReplay(readHumanReplay(legacy()))));
    const session = replay.sessions[0], sim = await Simulation.create(session.range, session.fourthModel, session.mode);
    try { expect(playRecordedSession(sim, session)).toEqual(session.final); }
    finally { sim.world.free(); }
  });

  test("array growth, removed properties, nulls, unchanged frames and independent decoded snapshots", () => {
    const replay = readHumanReplay(legacy());
    const s = replay.sessions[0];
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

  test("malformed tuples, patches, deep nesting and oversized expansions are rejected", () => {
    const replay = readHumanReplay(legacy());
    const change = (edit: (r: ReturnType<typeof compactHumanReplay>) => void) => {
      const compact = compactHumanReplay(replay); edit(compact);
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
    const small = structuredClone(replay) as HumanReplay;
    small.sessions[0].initial.civilians = Array.from({ length: 1000 }, (_, id) => ({
      id, model: "CART", hp: 1, position: {x: 0, y: 0, z: 0}, state: "idle" } as never));
    small.sessions[0].snapshots = Array(1200).fill(small.sessions[0].initial);
    expect(() => readHumanReplay(compactHumanReplay(small))).toThrow(/limits/);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});
