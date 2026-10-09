import { PISTOL, STEP, distance2, type BoxSpec } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { RECEIVING_GUARDS, RECEIVING_SITES } from "./receiving";
import type { Simulation } from "./simulation";
import type { SingleLoadBridge } from "./bridges";

export type Contact = "morrow" | "vale" | "rook";
export type MissionPhase = "briefing" | "yard" | "dispatch" | "return" | "crossing" | "withdraw" | "delivery" | "facility" | "haul" | "complete" | "failed";
export type MissionDefinition = {
  id: string; number: string; title: string; location: string; summary: string;
  briefing: readonly { speaker: Contact; message: string }[];
  objectives: readonly string[]; releaseSeconds: number; returnSeconds: number;
};
export const RECEIVING_CONTRACT = {
  id: "receiving",
  number: "01",
  title: "Receiving",
  location: "Wharf Cooperative · Pickup yard",
  summary: "A disputed storage charge has put a small freight yard on hold. The cooperative wants its parts released before the afternoon pickups.",
  briefing: [
    { speaker: "morrow", message: "Door motors and kettle elements. That's the shipment. Gannet has put four hired machines on the yard. Clear them, release the hold at dispatch, and come back to the van. Pistols will do." },
    { speaker: "vale", message: "Two pairs: the containers and dispatch. They cover each other, so bring the squad. The loaders are still holding yesterday's work. The cooperative's dispatcher will resume their jobs once you reach the yellow pad." },
  ] as const,
  objectives: ["Clear the pickup yard", "Release the cargo at dispatch", "Return the surviving squad to the van"],
  releaseSeconds: 2,
  returnSeconds: 1,
} as const;

const GUARD_PROFILE: EnemyProfile = {
  brace: false, grenades: false, automaticBurst: 0.06,
  attackInterval: 0.85, reactionTime: 0.45, pistolRange: PISTOL.range, leash: 14,
};

/** Shared contract lifecycle; authored encounters own their tactics and stages. */
export abstract class Mission {
  abstract readonly definition: MissionDefinition;
  abstract readonly firstPhase: MissionPhase;
  bridge?: SingleLoadBridge;
  alarmAt?: number;
  failureReason?: string;
  /** Runtime solids such as a locked entrance; never mutate shared range data. */
  obstacles: BoxSpec[] = [];
  phase: MissionPhase = "briefing";
  releaseProgress = 0;
  returnProgress = 0;
  enemyShots = 0;
  deployedAt = 0;
  finishedAt?: number;
  constructor(protected sim: Simulation) {}
  abstract get enemies(): Simulation["actors"];
  abstract get objective(): number;
  abstract get marker(): { x: number; z: number; radius: number; kind: "dispatch" | "return" } | null;
  abstract updateCombat(): void;
  abstract updateObjectives(): void;
  abstract inspect(): { id: string; phase: MissionPhase; objective: number; enemies: number; guards: number;
    releaseProgress: number; returnProgress: number; cargoReleased: boolean; marker: Mission["marker"];
    enemyShots: number; deployedAt: number; finishedAt?: number; survivors: number; [key: string]: unknown };
  get finished() { return this.phase === "complete" || this.phase === "failed"; }
  get stopped() { return this.phase === "briefing" || this.finished; }
  get cargoReleased() { return this.releaseProgress >= 1; }
  deploy() {
    if (this.phase !== "briefing") return;
    this.phase = this.firstPhase;
    this.deployedAt = this.sim.time;
  }
  protected finish(phase: "complete" | "failed") {
    this.phase = phase;
    this.finishedAt = this.sim.time;
    this.sim.release();
    for (const a of this.sim.actors) {
      a.firing = false;
      a.cover = undefined;
      if (a.ai) a.ai.fire = false;
      a.path = [];
      a.moveTarget = undefined;
    }
  }
}

/** A finite authored encounter. No wave refits, reinforcement loop or timed failure. */
export class ReceivingMission extends Mission {
  readonly definition = RECEIVING_CONTRACT;
  readonly firstPhase = "yard";
  private alertedPairs = new Set<number>();

  constructor(sim: Simulation) {
    super(sim);
    for (const [i, position] of RECEIVING_GUARDS.entries()) {
      const guard = sim.addEnemy("assault", position);
      guard.weapons = ["pistol"];
      guard.weapon = "pistol";
      guard.ammo = 0;
      guard.pistol.ammo = PISTOL.magazine;
      guard.hp = guard.maxHp = 132;
      guard.ai = {
        squad: Math.floor(i / 2), gate: "PICKUP YARD", rally: { ...position },
        flank: i % 2 ? 0.45 : -0.45, target: null,
        aim: { ...position, y: 1.25 }, state: "holding",
        nextThink: i * 0.04, nextRoute: 0, nextAttack: 0,
        entryUntil: 0, nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false,
      };
    }
    for (const porter of sim.city!.porters) sim.city!.workers.hold(porter.route.id);
  }

  get enemies() { return this.sim.actors.filter(a => a.kind === "enemy" && !a.flight && !a.dead); }
  get objective() {
    return this.cargoReleased ? 2 : !this.enemies.length ? 1 : 0;
  }
  get marker() {
    return this.phase === "dispatch" ? { ...RECEIVING_SITES.dispatch, kind: "dispatch" as const }
      : this.phase === "return" ? { ...RECEIVING_SITES.return, kind: "return" as const } : null;
  }
  updateCombat() {
    const living = this.sim.squad.filter(a => !a.dead);
    if (!living.length) return;
    for (const squad of [0, 1]) {
      const pair = this.enemies.filter(a => a.ai!.squad === squad);
      if (pair.some(a => a.hp < a.maxHp || living.some(target =>
        distance2(a.body.translation(), target.body.translation()) < 20)))
        this.alertedPairs.add(squad);
      // A shot or nearby intruder warns both posts, without granting knowledge
      // of distant robots. The unhurt partner can fire while the other staggers.
      const radius = this.alertedPairs.has(squad) ? PISTOL.range + 2 : 20;
      const targets = living.filter(target => pair.some(a =>
        distance2(a.body.translation(), target.body.translation()) < radius));
      for (const guard of pair) updateEnemy(this.sim, guard, targets, GUARD_PROFILE);
    }
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead);
    if (!living.length) { this.finish("failed"); return; }
    if (this.phase === "yard" && !this.enemies.length) {
      this.phase = "dispatch";
      this.sim.events.push({ type: "comms", speaker: "vale", message: "Yard's clear. Dispatch is on the yellow pad." });
    }
    const inside = (actor: typeof living[number], site: { x: number; z: number; radius: number }) => {
      const p = actor.body.translation();
      return p.y > 0.5 && p.y < 1.4 && distance2(p, site) < site.radius;
    };
    if (this.phase === "dispatch") {
      const present = living.some(a => inside(a, RECEIVING_SITES.dispatch));
      this.releaseProgress = present ? Math.min(1, this.releaseProgress + STEP / this.definition.releaseSeconds) : 0;
      if (this.releaseProgress >= 1) {
        this.phase = "return";
        for (const porter of this.sim.city!.porters) this.sim.city!.workers.resume(porter.route.id);
        this.sim.events.push({ type: "comms", speaker: "vale", message: "Release accepted. The dispatcher has the loaders moving again. I'll meet you at the van." });
      }
    }
    if (this.phase === "return") {
      const together = living.every(a => inside(a, RECEIVING_SITES.return));
      this.returnProgress = together ? Math.min(1, this.returnProgress + STEP / this.definition.returnSeconds) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return {
      id: this.definition.id, phase: this.phase, objective: this.objective,
      enemies: this.enemies.length, guards: RECEIVING_GUARDS.length,
      releaseProgress: this.releaseProgress, returnProgress: this.returnProgress,
      cargoReleased: this.cargoReleased, marker: this.marker,
      enemyShots: this.enemyShots, deployedAt: this.deployedAt, finishedAt: this.finishedAt,
      survivors: this.sim.squad.filter(a => !a.dead).length,
    };
  }
}
