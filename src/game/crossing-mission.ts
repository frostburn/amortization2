import { PISTOL, STEP, distance2 } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { Mission, type MissionDefinition } from "./missions";
import { CROSSING_BRIDGE, CROSSING_GUARDS, CROSSING_PURSUERS, CROSSING_SITES } from "./crossing";
import { SingleLoadBridge } from "./bridges";
import type { Actor, Simulation } from "./simulation";

export const CROSSING_CONTRACT = {
  id: "crossing", number: "02", title: "Crossing", location: "Wharf Cooperative · Canal service walk",
  summary: "Gannet has locked the road bridge during a billing dispute. Take the maintenance footbridge and reach the cooperative's van on the other bank.",
  briefing: [
    { speaker: "morrow", message: "Same equipment. The maintenance bridge takes one chassis at a time. Three hired machines hold the other end. Leave robots covering while the first one crosses; moving orders will queue at the bridge." },
    { speaker: "vale", message: "Select your covering robots, press C, then click the bank they should watch. They'll stay planted and fire at anything hostile in that sector. Move orders release them; X orders ceasefire. The last chassis will trip the bridge's access alarm. Cover back from the far bank when the pursuers arrive." },
  ],
  objectives: ["Establish a foothold across the canal", "Cover the rest of the crossing", "Bring the surviving squad to the van"],
  releaseSeconds: 0, returnSeconds: 1,
} as const satisfies MissionDefinition;

const BANK_PROFILE: EnemyProfile = { brace: false, grenades: false, automaticBurst: 0.06,
  attackInterval: 0.6, reactionTime: 0.35, pistolRange: PISTOL.range, leash: 3 };
const PURSUIT_PROFILE: EnemyProfile = { ...BANK_PROFILE, attackInterval: 0.5, leash: 5, reactionTime: 0.5 };

/** A single crossing and finite pursuit. No weapon escalation or squad refits. */
export class CrossingMission extends Mission {
  readonly definition = CROSSING_CONTRACT;
  readonly firstPhase = "crossing";
  private guards: number[] = [];
  private pursuit: number[] = [];
  private crossed = new Set<number>();
  private pursuitSpawned = false;
  constructor(sim: Simulation) {
    super(sim);
    this.bridge = new SingleLoadBridge(sim, CROSSING_BRIDGE);
    CROSSING_GUARDS.forEach((p, i) => this.guards.push(this.addGuard(p, 0, i).id));
  }
  private addGuard(position: { x: number; z: number }, group: number, slot: number) {
    const a = this.sim.addEnemy("assault", position);
    a.hp = a.maxHp = 132;
    a.ai = { squad: group, gate: group ? "WEST BANK" : "EAST BANK", rally: { ...position },
      flank: slot % 2 ? 0.3 : -0.3, target: null, aim: { ...position, y: 1.25 },
      state: "holding", nextThink: slot * 0.04, nextRoute: 0, nextAttack: 0,
      entryUntil: 0, nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
    return a;
  }
  get enemies() { return this.sim.actors.filter(a => a.kind === "enemy" && !a.flight && !a.dead); }
  get objective() { return this.phase === "withdraw" || this.phase === "complete" ? 2 : this.crossed.size ? 1 : 0; }
  get marker() { return this.phase === "withdraw" ? { ...CROSSING_SITES.exit, kind: "return" as const } : null; }
  updateCombat() {
    this.bridge!.update();
    const living = this.sim.squad.filter(a => !a.dead);
    const bankGuards = this.enemies.filter(a => this.guards.includes(a.id));
    const alerted = this.guards.some(id => this.sim.actors.some(a => a.id === id && a.hp < a.maxHp));
    for (const guard of bankGuards) {
      const targets = living.filter(a => a.body.translation().x > -10.5 || alerted);
      updateEnemy(this.sim, guard, targets, BANK_PROFILE);
    }
    if (this.alarmAt !== undefined && !this.pursuitSpawned && this.sim.time - this.alarmAt >= 0.8) {
      this.pursuitSpawned = true;
      CROSSING_PURSUERS.forEach((p, i) => {
        const a = this.addGuard(p, 1, i);
        a.ai!.rally = { x: -11.5, z: (i - 1) * 4 };
        a.ai!.state = "entering";
        a.ai!.entryUntil = this.sim.time + 8;
        this.sim.navigate(a, a.ai!.rally);
        this.pursuit.push(a.id);
      });
    }
    for (const pursuer of this.enemies.filter(a => this.pursuit.includes(a.id)))
      updateEnemy(this.sim, pursuer, living, PURSUIT_PROFILE);
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead);
    for (const a of living) {
      const p = a.body.translation();
      if (p.y < -0.4) this.sim.damage(a, a.hp, { x: 0, y: 0, z: 0 }, p);
      else if (this.bridge!.side(p) === 1) this.crossed.add(a.id);
    }
    const survivors = living.filter(a => !a.dead);
    if (!survivors.length) { this.failureReason = "Squad lost at the canal"; this.finish("failed"); return; }
    if (this.bridge!.collapsed && survivors.some(a => this.bridge!.side(a.body.translation()) !== 1)) {
      this.failureReason = "The overloaded bridge collapsed";
      this.finish("failed"); return;
    }
    // Physical entry by the last surviving near-bank chassis, rather than a
    // queued click or the death of a teammate. Retreat never retriggers it.
    if (this.alarmAt === undefined && this.crossed.size > 0) {
      const remaining = survivors.filter(a => this.bridge!.side(a.body.translation()) !== 1);
      if (remaining.length === 1 && this.bridge!.onDeck(remaining[0].body.translation()) &&
          !this.bridge!.onDeck(remaining[0].previous) && remaining[0].body.translation().x > remaining[0].previous.x) {
        this.alarmAt = this.sim.time;
        this.sim.events.push({ type: "bridge", phase: "alarm", position: { ...CROSSING_SITES.alarm, y: 1.6 } });
        this.sim.events.push({ type: "comms", speaker: "vale", message: "Access alarm. Machines coming down the west bank. Turn your covering robots back toward the bridge." });
      }
    }
    if (this.phase === "crossing" && survivors.every(a => this.bridge!.side(a.body.translation()) === 1)) {
      this.phase = "withdraw";
      this.sim.events.push({ type: "comms", speaker: "morrow", message: "Everyone across. Cover the withdrawal and bring the squad to the van." });
    }
    if (this.phase === "withdraw") {
      const together = survivors.every(a => {
        const p = a.body.translation();
        return p.y > 0.5 && p.y < 1.4 && distance2(p, CROSSING_SITES.exit) < CROSSING_SITES.exit.radius;
      });
      this.returnProgress = together ? Math.min(1, this.returnProgress + STEP / this.definition.returnSeconds) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective,
      enemies: this.enemies.length, guards: this.guards.length, releaseProgress: 0,
      returnProgress: this.returnProgress, cargoReleased: false, marker: this.marker,
      enemyShots: this.enemyShots, deployedAt: this.deployedAt, finishedAt: this.finishedAt,
      survivors: this.sim.squad.filter(a => !a.dead).length, crossed: [...this.crossed],
      alarmAt: this.alarmAt, pursuers: this.pursuit.length, failureReason: this.failureReason,
      bridge: this.bridge!.inspect() };
  }
}
