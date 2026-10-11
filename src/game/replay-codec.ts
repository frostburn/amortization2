import type { HumanReplay, ReplaySession } from "./replay";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
/** [value] replaces a subtree; an object patches existing keys/array indices. */
type Patch = [Json] | { [key: string]: Patch };
type Row = [number, number, Json];
type CompactSession = Omit<ReplaySession, "final" | "snapshots" | "inputs" | "events" | "views"> & {
  final: Patch; snapshots: Patch[]; inputs: Row[]; events: Row[]; views: Row[];
};
export type CompactReplay = Omit<HumanReplay, "version" | "sessions"> & { version: 2; sessions: CompactSession[] };
const object = (value: Json): value is Json[] | { [key: string]: Json } => value !== null && typeof value === "object";

function difference(before: Json, after: Json): Patch | undefined {
  if (before === after) return;
  if (!object(before) || !object(after) || Array.isArray(before) !== Array.isArray(after)) return [after];
  const keys = Object.keys(after), previous = Object.keys(before);
  if (keys.length !== previous.length || keys.some(key => !Object.hasOwn(before, key))) return [after];
  const changes: { [key: string]: Patch } = {};
  for (const key of keys) {
    const patch = difference((before as Record<string, Json>)[key], (after as Record<string, Json>)[key]);
    if (patch !== undefined) Object.defineProperty(changes, key, { value: patch, enumerable: true });
  }
  return Object.keys(changes).length ? changes : undefined;
}

/** Lossless JSON encoding: no rounding, resampling or dropped observations. */
export function compactHumanReplay(replay: HumanReplay): CompactReplay {
  // Match the established JSON boundary (omit optional undefined properties).
  const clean: HumanReplay = JSON.parse(JSON.stringify(replay));
  return { ...clean, version: 2, sessions: clean.sessions.map(session => {
    let previous = session.initial as unknown as Json;
    const snapshots = session.snapshots.map(snapshot => {
      const next = snapshot as unknown as Json, patch = difference(previous, next) ?? {};
      previous = next;
      return patch;
    });
    const rows = (entries: { tick: number; wallMs: number; data: unknown }[]): Row[] =>
      entries.map(e => [e.tick, e.wallMs, e.data as Json]);
    return { ...session, snapshots, final: difference(previous, session.final as unknown as Json) ?? {},
      inputs: rows(session.inputs), events: rows(session.events), views: rows(session.views) };
  }) };
}
export const stringifyHumanReplay = (replay: HumanReplay) => JSON.stringify(compactHumanReplay(replay));

/** Guard both nesting and expanded snapshot size before allocating full copies. */
export function expandHumanReplay(value: unknown): HumanReplay {
  const fail = (): never => { throw new Error("Invalid compact replay or expansion exceeds capture limits"); };
  let nodes = 0;
  const measure = (data: unknown, depth = 0): number => {
    if (depth > 48 || ++nodes > 8_000_000) return fail();
    if (data === null || typeof data === "string" || typeof data === "boolean") return 1;
    if (typeof data === "number") return Number.isFinite(data) ? 1 : fail();
    if (!data || typeof data !== "object") return fail();
    let size = 1;
    for (const child of Object.values(data)) size += measure(child, depth + 1);
    return size;
  };
  measure(value);
  const replay = value as CompactReplay;
  if (replay?.format !== "amortization2-human-replay" || replay.version !== 2 ||
      !Array.isArray(replay.sessions) || replay.sessions.length > 32) return fail();
  let entries = 0;
  for (const session of replay.sessions) {
    if (!session || ![session.snapshots, session.inputs, session.events, session.views].every(Array.isArray)) return fail();
    entries += session.snapshots.length + session.inputs.length + session.events.length + session.views.length;
  }
  if (entries > 60100) return fail();
  const apply = (before: Json, patch: Patch, depth = 0): Json => {
    if (depth > 48 || !patch || typeof patch !== "object") return fail();
    if (Array.isArray(patch)) return patch.length === 1 ? patch[0] : fail();
    if (!object(before)) return fail();
    const result = Array.isArray(before) ? [...before] : { ...before };
    for (const [key, child] of Object.entries(patch)) {
      if (!Object.hasOwn(before, key) || Array.isArray(before) && !/^(0|[1-9]\d*)$/.test(key)) return fail();
      const updated = apply((before as Record<string, Json>)[key], child, depth + 1);
      Object.defineProperty(result, key, { value: updated, enumerable: true, configurable: true, writable: true });
    }
    return result;
  };
  const rows = (data: Row[]) => data.map(row => {
    if (!Array.isArray(row) || row.length !== 3 || !Number.isInteger(row[0]) || row[0] < 0 ||
        !Number.isFinite(row[1])) return fail();
    return { tick: row[0], wallMs: row[1], data: row[2] };
  });
  return { ...replay, version: 1, sessions: replay.sessions.map(session => {
    let previous = session.initial as unknown as Json;
    const copy = (patch: Patch) => {
      previous = apply(previous, patch);
      measure(previous); // Count expanded observations, including reused branches.
      return structuredClone(previous);
    };
    const snapshots = session.snapshots.map(copy), final = copy(session.final);
    return { ...session, snapshots, final, inputs: rows(session.inputs), events: rows(session.events), views: rows(session.views) } as unknown as ReplaySession;
  }) };
}
