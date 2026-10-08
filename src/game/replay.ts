import { STEP, type Vec2, type Vec3, type Weapon } from "./config";
import { RANGES, type RangeId } from "./ranges";
import type { GameEvent, Simulation } from "./simulation";

export type ReplayAction =
  | { type: "select"; id: number; additive: boolean }
  | { type: "group"; ids: number[] }
  | { type: "move"; point: Vec2; queued: boolean }
  | { type: "weapon"; weapon: Weapon }
  | { type: "brace"; enabled: boolean }
  | { type: "scope"; enabled: boolean }
  | { type: "grenade"; point: Vec2; actor: number }
  | { type: "reload" | "release" | "deploy" }
  | { type: "control"; aim: Vec3; trigger: boolean };
type Timed<T> = { tick: number; wallMs: number; data: T };
export type ReplayView = { camera: object; scope: object; paused: boolean; width: number; height: number };
const tick = (sim: Simulation) => Math.round(sim.time / STEP);
const rounded = (n: number) => Math.round(n * 1000) / 1000;
const position = (p: Vec3) => ({ x: rounded(p.x), y: rounded(p.y), z: rounded(p.z) });
export function replaySnapshot(sim: Simulation) {
  return {
    tick: tick(sim), mission: sim.mission?.inspect() ?? null, arena: sim.arena?.inspect() ?? null,
    selected: [...sim.selected], aim: { ...sim.aim }, trigger: sim.trigger, sniping: sim.sniping,
    shots: sim.shots, hits: sim.hits, throws: sim.throws,
    actors: sim.actors.map(a => ({ id: a.id, kind: a.kind, model: a.model, hp: a.hp,
      position: position(a.body.translation()), yaw: rounded(a.yaw), weapon: a.weapon,
      ammo: sim.ammunition(a).ammo, reload: rounded(sim.ammunition(a).reload),
      braced: a.braced, firing: a.firing, stagger: rounded(a.stagger),
      goal: a.moveTarget ? { ...a.moveTarget } : null,
      ai: a.ai ? { state: a.ai.state, target: a.ai.target } : null })),
    civilians: sim.city ? [...sim.city.carts, ...sim.city.kites, ...sim.city.porters, ...sim.city.vehicles]
      .map(a => ({ id: a.id, model: a.model, hp: a.hp, position: position(a.body.translation()), state: a.state })) : [],
  };
}
export type ReplaySession = {
  range: RangeId; fourthModel: Simulation["fourthModel"]; seed: number;
  endTick: number; initial: ReturnType<typeof replaySnapshot>; final: ReturnType<typeof replaySnapshot>;
  inputs: Timed<ReplayAction>[]; events: Timed<GameEvent>[];
  snapshots: ReturnType<typeof replaySnapshot>[]; views: Timed<ReplayView>[];
};
export type HumanReplay = {
  format: "amortization2-human-replay"; version: 1; step: number; revision: string;
  createdAt: string; exportedAt: string; stopReason: string | null; sessions: ReplaySession[];
};

/** Development capture of resolved player intentions and observed combat, not
 * video or a save file. Physics uses the original fixed ticks and seeded RNG. */
export class HumanReplayRecorder {
  private sessions: ReplaySession[] = [];
  private controls = "";
  private view = "";
  private observedEvents = 0;
  private entries = 0;
  private totalTicks = 0;
  private stepping = false;
  private finishCappedStep = false;
  private createdAt = new Date().toISOString();
  private started = performance.now();
  stopReason: string | null = null;
  constructor(private revision: string, private limit = 60000) {}
  private reserve(sim: Simulation) {
    if (this.stopReason) return false;
    if (this.entries >= this.limit) {
      const session = this.sessions.at(-1);
      if (session) { session.final = replaySnapshot(sim); session.endTick = tick(sim); }
      this.stopReason = "entry limit";
      this.finishCappedStep = this.stepping;
      return false;
    }
    this.entries++; return true;
  }
  begin(sim: Simulation) {
    if (this.stopReason) return;
    if (this.sessions.length >= 32) { this.stopReason = "session limit"; return; }
    const initial = replaySnapshot(sim);
    this.sessions.push({ range: sim.range, fourthModel: sim.fourthModel, seed: 1729,
      endTick: tick(sim), initial, final: initial, inputs: [], events: [], snapshots: [initial], views: [] });
    this.controls = this.view = ""; this.observedEvents = 0;
  }
  finish(sim: Simulation) {
    this.syncControls(sim);
    this.events(sim);
    const session = this.sessions.at(-1);
    if (session && !this.stopReason) { session.final = replaySnapshot(sim); session.endTick = tick(sim); }
  }
  action(sim: Simulation, data: ReplayAction) {
    if (data.type !== "control") this.syncControls(sim);
    const session = this.sessions.at(-1);
    if (session && this.reserve(sim)) session.inputs.push({ tick: tick(sim), wallMs: Math.round(performance.now() - this.started), data: structuredClone(data) });
  }
  beforeStep(sim: Simulation) {
    if (this.stopReason) return;
    this.syncControls(sim);
    this.events(sim);
    this.stepping = !this.stopReason;
  }
  private syncControls(sim: Simulation) {
    if (this.stopReason) return;
    const control = { type: "control" as const, aim: { ...sim.aim }, trigger: sim.trigger };
    const key = JSON.stringify(control);
    if (key !== this.controls) { this.action(sim, control); this.controls = key; }
  }
  afterStep(sim: Simulation) {
    const session = this.sessions.at(-1);
    this.stepping = false;
    if (!session) return;
    if (this.finishCappedStep) {
      session.final = replaySnapshot(sim); session.endTick = tick(sim); this.finishCappedStep = false;
    }
    if (this.stopReason) return;
    this.events(sim);
    if (this.stopReason) return;
    if (session.endTick === tick(sim)) return;
    this.totalTicks++;
    session.endTick = tick(sim);
    if (tick(sim) % 30 === 0 || sim.mission?.phase !== session.final.mission?.phase ||
        sim.arena?.phase !== session.final.arena?.phase) {
      session.final = replaySnapshot(sim);
      if (this.reserve(sim)) session.snapshots.push(session.final);
    }
    if (this.totalTicks >= 20 * 60 / STEP) this.stopReason = "20 minute limit";
  }
  private events(sim: Simulation) {
    const session = this.sessions.at(-1);
    if (!session || this.stopReason) return;
    for (const data of sim.events.slice(this.observedEvents)) {
      if (!this.reserve(sim)) break;
      session.events.push({ tick: tick(sim), wallMs: Math.round(performance.now() - this.started), data: structuredClone(data) });
    }
    this.observedEvents = sim.events.length;
  }
  frame(sim: Simulation, view: ReplayView) {
    this.events(sim);
    // The caller drains the simulation's presentation events immediately after this.
    this.observedEvents = 0;
    const session = this.sessions.at(-1), key = JSON.stringify(view);
    if (session && key !== this.view && this.reserve(sim)) {
      session.views.push({ tick: tick(sim), wallMs: Math.round(performance.now() - this.started), data: structuredClone(view) }); this.view = key;
    }
  }
  export(sim: Simulation): HumanReplay {
    this.finish(sim);
    return structuredClone({ format: "amortization2-human-replay", version: 1, step: STEP,
      revision: this.revision, createdAt: this.createdAt, exportedAt: new Date().toISOString(),
      stopReason: this.stopReason, sessions: this.sessions });
  }
  get status() { return { sessions: this.sessions.length, entries: this.entries, seconds: this.totalTicks * STEP, stopReason: this.stopReason }; }
}

export function applyReplayAction(sim: Simulation, input: ReplayAction) {
  switch (input.type) {
    case "select": sim.select(input.id, input.additive); break;
    case "group": sim.selectGroup(input.ids); break;
    case "move": sim.move(input.point, input.queued); break;
    case "weapon": sim.chooseWeapon(input.weapon); break;
    case "brace": sim.setBrace(input.enabled); break;
    case "scope": if (sim.sniping !== input.enabled) sim.toggleSniping(); break;
    case "grenade": sim.throwGrenade(input.point, sim.actors.find(a => a.id === input.actor)); break;
    case "reload": sim.reloadSelected(); break;
    case "release": sim.release(); break;
    case "deploy": sim.mission?.deploy(); break;
    case "control": sim.aim = { ...input.aim }; sim.trigger = input.trigger; break;
  }
}

function validAction(value: unknown): value is ReplayAction {
  if (!value || typeof value !== "object") return false;
  const a = value as Record<string, unknown>;
  const point = (p: unknown, keys: string[]) => !!p && typeof p === "object" &&
    keys.every(key => typeof (p as Record<string, unknown>)[key] === "number" &&
      Number.isFinite((p as Record<string, number>)[key]) && Math.abs((p as Record<string, number>)[key]) <= 10000);
  const id = (n: unknown) => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5;
  switch (a.type) {
    case "select": return id(a.id) && typeof a.additive === "boolean";
    case "group": return Array.isArray(a.ids) && a.ids.length <= 4 && a.ids.every(n => id(n) && n !== 5);
    case "move": return point(a.point, ["x", "z"]) && typeof a.queued === "boolean";
    case "weapon": return ["gun", "pistol", "minigun", "rifle", "grenade"].includes(a.weapon as string);
    case "brace": case "scope": return typeof a.enabled === "boolean";
    case "grenade": return id(a.actor) && a.actor !== 5 && point(a.point, ["x", "z"]);
    case "control": return point(a.aim, ["x", "y", "z"]) && typeof a.trigger === "boolean";
    case "reload": case "release": case "deploy": return true;
    default: return false;
  }
}

export function readHumanReplay(value: unknown): HumanReplay {
  const replay = value as HumanReplay | null;
  if (!replay || replay.format !== "amortization2-human-replay" || replay.version !== 1 ||
      replay.step !== STEP || !Array.isArray(replay.sessions) || replay.sessions.length > 32)
    throw new Error("Unsupported human replay format, version or timestep");
  let entries = 0, ticks = 0;
  for (const session of replay.sessions) {
    validateSession(session);
    if (!Array.isArray(session.events) || !Array.isArray(session.snapshots) || !Array.isArray(session.views) ||
        !session.final || !Array.isArray(session.final.actors)) throw new Error("Incomplete replay observations");
    entries += session.inputs.length + session.events.length + session.snapshots.length + session.views.length;
    ticks += session.endTick;
  }
  if (entries > 60100 || ticks > 20 * 60 / STEP) throw new Error("Replay exceeds capture limits");
  return replay;
}

export function validateSession(session: ReplaySession) {
  if (!session || !Object.hasOwn(RANGES, session.range) || !["sniper", "minigunner", "assault"].includes(session.fourthModel) ||
      session.seed !== 1729 || !Number.isInteger(session.endTick) || session.endTick < 0 || session.endTick > 20 * 60 / STEP)
    throw new Error("Unsupported replay session");
  if (session.initial?.tick !== 0 || !Array.isArray(session.inputs) || session.inputs.length > 60000 || session.inputs.some((input, i) =>
    !input || !Number.isInteger(input.tick) || input.tick < 0 || input.tick > session.endTick ||
    (i > 0 && input.tick < session.inputs[i - 1].tick) || !validAction(input.data)))
    throw new Error("Replay requires valid ordered inputs from a fresh simulation");
}

/** Re-simulate one exported attempt against the current game for inspection.
 * Camera/UI timing is observational; gameplay intentions retain their tick/order. */
export function playRecordedSession(sim: Simulation, session: ReplaySession) {
  validateSession(session);
  const onInput = sim.onInput, onReset = sim.onReset;
  sim.onInput = sim.onReset = undefined;
  try {
    sim.reset(session.range, session.fourthModel);
    let cursor = 0;
    for (let at = 0; at <= session.endTick; at++) {
      while (cursor < session.inputs.length && session.inputs[cursor].tick === at)
        applyReplayAction(sim, session.inputs[cursor++].data);
      if (at < session.endTick) {
        sim.step();
        if (tick(sim) !== at + 1) throw new Error(`Replay stopped unexpectedly at tick ${at}`);
        sim.events.length = 0;
      }
    }
    return replaySnapshot(sim);
  } finally { sim.onInput = onInput; sim.onReset = onReset; }
}
