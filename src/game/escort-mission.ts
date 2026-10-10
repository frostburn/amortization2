import RAPIER from "@dimforge/rapier3d-compat";
import { STEP, distance2 } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { ESCORT_DOOR, ESCORT_GUARDS, ESCORT_OFFICE, ESCORT_REINFORCEMENTS, ESCORT_ROOF, ESCORT_SHELTERS, ESCORT_SITES } from "./escort";
import { serviceHallWalls } from "./handling";
import { HumanEscort } from "./human-escort";
import { Mission, type MissionDefinition } from "./missions";
import { segmentClear } from "./navigation";
import type { Actor, Simulation } from "./simulation";

export const ESCORT_CONTRACT = {
  id: "escort", number: "04", title: "Release", location: "Wharf Cooperative · Gannet records office",
  summary: "Ren Quill went to inspect the cooperative's agreements. Gannet has locked him in for account reconciliation. Bring him home. Again.",
  briefing: [
    { speaker: "morrow", message: "Ren found something in Gannet's operating-rights files. They want his signature before he leaves. Break the entrance, clear the hired machines, and get him back to our van. Four pistols; we're bringing a person out of an office." },
    { speaker: "vale", message: "Three guards inside. Shoot the shutter to force entry, then reach Ren in the back room. He'll follow the first robot to reach him. H, or a click on Ren, tells him to wait or follow the selected robot. The guide slows to his pace; leave the others covering. Gannet has another squad on this street." },
  ],
  objectives: ["Break the office entrance", "Clear the office guards", "Reach Ren Quill", "Escort Quill and the surviving squad to the van"],
  releaseSeconds: 0, returnSeconds: 1,
} as const satisfies MissionDefinition;
const GUARDS: EnemyProfile = { brace: false, grenades: false, automaticBurst: .06,
  attackInterval: 1, reactionTime: .6, pistolRange: 23, leash: 7 };
const PURSUERS: EnemyProfile = { ...GUARDS, attackInterval: 1.15, reactionTime: .65, pistolRange: 28, leash: undefined, noticeRange: 42 };

export class EscortMission extends Mission {
  readonly definition = ESCORT_CONTRACT;
  readonly firstPhase = "breach";
  readonly escort: HumanEscort;
  doorHp = 154;
  readonly doorMaxHp = 154;
  private door: RAPIER.RigidBody;
  private guardIds: number[] = [];
  private squadIds: number[] = [];
  reinforcementAt?: number;
  arrivedAt?: number;
  private officeCleared = false;
  constructor(sim: Simulation) {
    super(sim);
    const b = ESCORT_DOOR;
    this.obstacles = [{ ...b }];
    this.door = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.h / 2, b.z));
    const collider = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2), this.door);
    this.breakables.add(collider.handle);
    const r = ESCORT_ROOF;
    const roof = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(r.w / 2, r.h / 2, r.d / 2)
      .setTranslation(r.x, r.y! + r.h / 2, r.z));
    const walls: number[] = [], specs = serviceHallWalls(ESCORT_OFFICE);
    sim.world.forEachCollider(c => {
      const p = c.translation();
      if (specs.some(w => Math.abs(p.x - w.x) < .001 && Math.abs(p.z - w.z) < .001 && Math.abs(p.y - w.h / 2) < .001)) walls.push(c.handle);
    });
    this.roofs.push({ area: ESCORT_SHELTERS[0], collider: roof.handle, walls, revealDistance: 12 });
    ESCORT_GUARDS.forEach((p, i) => this.guardIds.push(this.spawn(p, p, i, 0).id));
    this.escort = sim.escort = new HumanEscort(sim, sim.addHuman(ESCORT_SITES.quill));
  }
  private spawn(position: { x: number; z: number }, rally: { x: number; z: number }, i: number, squad: number): Actor {
    const a = this.sim.addEnemy("assault", position);
    a.hp = a.maxHp = 110;
    a.ai = { squad, gate: squad ? "RECORDS RESPONSE" : "RECORDS OFFICE", rally: { ...rally },
      flank: i % 2 ? .4 : -.4, target: null, aim: { ...rally, y: 1.25 },
      state: squad ? "advancing" : "holding", nextThink: this.sim.time + i * .04, nextRoute: 0,
      nextAttack: this.sim.time + .8, entryUntil: this.sim.time + 8, nextGrenade: Infinity,
      burstUntil: 0, visible: false, fire: false };
    if (squad) this.sim.navigate(a, rally);
    return a;
  }
  get guards() { return this.sim.actors.filter(a => this.guardIds.includes(a.id) && !a.dead); }
  get reinforcements() { return this.sim.actors.filter(a => this.squadIds.includes(a.id) && !a.dead); }
  get enemies() { return [...this.guards, ...this.reinforcements]; }
  get objective() { return !this.cargoReleased ? 0 : this.guards.length ? 1 : this.escort.rescuedAt === undefined ? 2 : 3; }
  get marker() {
    return this.phase === "rescue" && !this.guards.length ? { ...ESCORT_SITES.quill, kind: "dispatch" as const }
      : this.phase === "escort" ? { ...ESCORT_SITES.exit, kind: "return" as const } : null;
  }
  override damageFixture(handle: number, amount: number) {
    if (!this.breakables.has(handle) || this.stopped) return false;
    this.doorHp = Math.max(0, this.doorHp - amount);
    if (!this.doorHp) {
      this.breakables.clear(); this.sim.world.removeRigidBody(this.door); this.obstacles = [];
      this.releaseProgress = 1; this.phase = "rescue";
      this.sim.events.push({ type: "comms", speaker: "vale", message: "Entrance open. Three hired machines between you and Ren." });
    }
    return true;
  }
  updateCombat() {
    const living = this.sim.squad.filter(a => !a.dead);
    for (const guard of this.guards) updateEnemy(this.sim, guard, this.cargoReleased ? living : [], GUARDS);
    if (this.reinforcementAt !== undefined && this.arrivedAt === undefined && this.sim.time >= this.reinforcementAt) {
      this.arrivedAt = this.sim.time;
      ESCORT_REINFORCEMENTS.forEach(({ entry, rally }, i) => this.squadIds.push(this.spawn(entry, rally, i, 1).id));
      this.sim.events.push({ type: "security", phase: "arrival", position: { x: -8, y: 1, z: 24 }, level: 1 });
      this.sim.events.push({ type: "comms", speaker: "vale", message: "Four response machines from the south street. Keep Ren behind your pistols. The van is still clear." });
    }
    const targets = this.escort.rescuedAt !== undefined && !this.escort.human.dead ? [...living, this.escort.human] : living;
    for (const enemy of this.reinforcements) updateEnemy(this.sim, enemy, targets, PURSUERS);
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead), human = this.escort.human;
    if (!living.length || human.dead) {
      this.failureReason = human.dead ? "Ren Quill was killed" : "No chassis left to escort Quill";
      this.finish("failed"); return;
    }
    if (this.phase === "rescue" && !this.guards.length) {
      if (!this.officeCleared) {
        this.officeCleared = true;
        this.sim.events.push({ type: "comms", speaker: "vale", message: "Office clear. Ren is in the back room. Get a robot to him." });
      }
      const nearby = living.filter(a => Math.abs(a.body.translation().y - human.body.translation().y) < .8 &&
        distance2(a.body.translation(), human.body.translation()) < ESCORT_SITES.quill.radius &&
        segmentClear(a.body.translation(), human.body.translation(), this.sim.layout.barriers, .05))
        .sort((a, b) => distance2(a.body.translation(), human.body.translation()) - distance2(b.body.translation(), human.body.translation()));
      if (nearby.length) {
        this.escort.rescue(nearby[0]); this.phase = "escort";
        this.reinforcementAt = this.sim.time + 5;
        this.sim.events.push({ type: "comms", speaker: "quill", message: "They called it a voluntary reconciliation. I asked why the door was locked. Let's go." });
      }
    }
    if (this.phase === "escort") {
      const site = ESCORT_SITES.exit, inside = (a: Actor) => a.body.translation().y > .3 && a.body.translation().y < 1.3 && distance2(a.body.translation(), site) < site.radius;
      const together = inside(human) && living.every(inside);
      this.returnProgress = together ? Math.min(1, this.returnProgress + STEP / this.definition.returnSeconds) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective, enemies: this.enemies.length,
      guards: this.guardIds.length, releaseProgress: this.releaseProgress, returnProgress: this.returnProgress,
      cargoReleased: this.cargoReleased, marker: this.marker, enemyShots: this.enemyShots,
      deployedAt: this.deployedAt, finishedAt: this.finishedAt, survivors: this.sim.squad.filter(a => !a.dead).length,
      doorHp: this.doorHp, doorMaxHp: this.doorMaxHp, guardsRemaining: this.guards.length,
      reinforcementAt: this.reinforcementAt, arrivedAt: this.arrivedAt, reinforcements: this.reinforcements.length,
      escort: this.escort.inspect(), failureReason: this.failureReason };
  }
}
