import { BLAST_RADIUS, MAGAZINE, PISTOL, STEP, clamp, distance2, type Vec2, type Vec3 } from "./config";
import { alertEnemies, updateEnemy, type EnemyProfile } from "./enemies";
import { Mission, type MissionDefinition } from "./missions";
import { FOREST_GROUND, FOREST_GUARDS, FOREST_RIGS, FOREST_SITES } from "./forest";
import type { Actor, Simulation } from "./simulation";
import type RAPIER from "@dimforge/rapier3d-compat";

export const TIMBER_CONTRACT = {
  id: "forest", number: "07", title: "Timber Rights", location: "Birchwater catchment · Meridian expansion plot",
  summary: "An automated logging contractor is clearing a protected buffer beside a proposed data center. The stop-work order is in force. Their security robots are enforcing a different instruction.",
  selectableSquad: true,
  briefing: [
    { speaker: "morrow", message: "The water cooperative has an enforceable stop-work order. The clearing crew ignored it. Disable both felling rigs, seal their work-order terminal, and hold the site for the inspectors. Leave the standing forest and the plot alone." },
    { speaker: "vale", message: "Two active rigs, west and east of the clearing. The data center isn't built yet: survey stakes, cooling foundations and a site office. A ridge hides our approach from the layby. The logging tracks are wide enough for the squad." },
    { speaker: "rook", message: "Two machine guns and two pistols on site. The gunners need a follow-up rifle shot. Response squads bring two guns each, with longer reach, from opposite tracks. Put covering robots on both angles. Trees and ridgelines stop bullets; a stopped rig remains solid cover." },
    { speaker: "sable", message: "Shoot the rig's engine chassis, not the trees. Once both drives stop, bring a robot to the amber terminal beside the office. Sealing that instruction calls the contractor's response squads. Hold the marked clearing until the inspectors can take possession, then recover everyone at the layby." },
  ],
  objectives: ["Disable both felling rigs", "Seal the illegal work order at the terminal", "Secure the clearing for the inspectors", "Recover the surviving squad at the layby"],
  releaseSeconds: 2, returnSeconds: 1,
} as const satisfies MissionDefinition;
export const FOREST_HOLD_SECONDS = 24;
export const FOREST_RESPONSE_DELAYS = [5, 10] as const;
const GUNNERS: EnemyProfile = { brace: true, grenades: false, automaticBurst: .28, attackInterval: 3,
  reactionTime: 1.2, noticeRange: 65, leash: 14 };
const PISTOLS: EnemyProfile = { ...GUNNERS, brace: false, automaticBurst: .06, pistolRange: 22, attackInterval: 1.9 };
const RESPONSE_GUNNERS: EnemyProfile = { ...GUNNERS, automaticBurst: .32, attackInterval: 2.6,
  reactionTime: .7, noticeRange: 80, automaticRange: 50 };
const RESPONSE_PISTOLS: EnemyProfile = { ...PISTOLS, reactionTime: .7, noticeRange: 80,
  pistolRange: PISTOL.range, attackInterval: 1.4 };
export type FellingRig = typeof FOREST_RIGS[number] & { hp: number; maxHp: number; collider: number };

/** Stop work, seize its command record, then defend the site through two finite responses. */
export class ForestMission extends Mission {
  readonly definition = TIMBER_CONTRACT;
  readonly firstPhase = "intercept";
  readonly rigs: FellingRig[];
  sealedAt?: number;
  alertedAt?: number;
  inspectionAt?: number;
  holdProgress = 0;
  responseCount = 0;
  contested = false;
  private guardIds: number[] = [];
  private responseIds: number[] = [];
  constructor(sim: Simulation) {
    super(sim);
    this.rigs = FOREST_RIGS.map(rig => {
      let collider: number | undefined;
      sim.world.forEachCollider(c => {
        const p = c.translation();
        if (Math.abs(p.x - rig.x) < .001 && Math.abs(p.z - rig.z) < .001 && Math.abs(p.y - rig.y - rig.h / 2) < .001) collider = c.handle;
      });
      if (collider === undefined) throw Error(`Felling rig ${rig.id} has no physical chassis`);
      this.breakables.add(collider);
      return { ...rig, hp: 220, maxHp: 220, collider };
    });
    for (const [i, guard] of FOREST_GUARDS.entries()) this.guard(guard, guard.gun, i, false);
  }
  private guard(p: Vec2, gun: boolean, slot: number, response: boolean) {
    const a = this.sim.addEnemy("assault", p);
    a.weapons = [gun ? "gun" : "pistol"]; a.weapon = gun ? "gun" : "pistol";
    a.ammo = gun ? MAGAZINE : 0; a.pistol.ammo = PISTOL.magazine;
    a.hp = a.maxHp = gun ? 160 : 100;
    const north = this.responseCount === 1;
    const rally = response ? this.sim.terrain!.resolve({ x: 5 + slot * 5, z: north ? -17 : 8 }) : this.sim.terrain!.resolve(p);
    a.ai = { squad: response ? this.responseCount : 0, gate: response ? "CONTRACTOR RESPONSE" : "LOGGING SECURITY",
      rally, flank: slot % 2 ? .45 : -.45, target: null, aim: { ...rally, y: rally.y + 1.3 }, state: response ? "entering" : "holding",
      nextThink: this.sim.time + slot * .06, nextRoute: 0, nextAttack: this.sim.time + (response ? .7 : 1.2),
      entryUntil: this.sim.time, nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
    (response ? this.responseIds : this.guardIds).push(a.id);
    if (response) this.sim.navigate(a, rally);
    return a;
  }
  get enemies() { return this.sim.actors.filter(a => [...this.guardIds, ...this.responseIds].includes(a.id) && !a.dead); }
  get stoppedRigs() { return this.rigs.filter(r => r.hp === 0).length; }
  get objective() { return this.phase === "return" || this.phase === "complete" ? 3 : this.sealedAt !== undefined ? 2 : this.stoppedRigs === 2 ? 1 : 0; }
  get marker() { return this.phase === "return" ? { ...FOREST_SITES.entry, kind: "return" as const }
    : this.phase === "secure" ? { ...FOREST_SITES.terminal, kind: "dispatch" as const }
    : this.phase === "hold" ? { ...FOREST_SITES.clearing, kind: "dispatch" as const } : null; }
  damageFixture(handle: number, amount: number, origin?: Vec3) {
    const rig = this.rigs.find(r => r.collider === handle);
    if (!rig) return false;
    const active = rig.hp > 0;
    rig.hp = Math.max(0, rig.hp - Math.max(0, amount));
    if (active && amount > 0) {
      this.alertedAt ??= this.sim.time;
      alertEnemies(this.sim, origin ?? { x: rig.x, y: rig.y, z: rig.z });
      if (!rig.hp) this.sim.events.push({ type: "comms", speaker: "sable", message: `${rig.id === "west" ? "West" : "East"} rig stopped. Its chassis is still cover. ${this.stoppedRigs === 2 ? "Both drives are out; seal the work order at the terminal." : "One drive remaining."}` });
    }
    return true;
  }
  blastFixtures(origin: Vec3, source?: RAPIER.RigidBody) {
    for (const rig of this.rigs) {
      const point = { x: clamp(origin.x, rig.x - rig.w / 2, rig.x + rig.w / 2),
        y: clamp(origin.y, rig.y, rig.y + rig.h), z: clamp(origin.z, rig.z - rig.d / 2, rig.z + rig.d / 2) };
      const distance = Math.hypot(point.x - origin.x, point.y - origin.y, point.z - origin.z);
      if (distance >= BLAST_RADIUS) continue;
      const hit = this.sim.ray(origin, point, source, c => c.handle !== rig.collider);
      if (!hit) this.damageFixture(rig.collider, 210 * Math.sqrt(1 - distance / BLAST_RADIUS), origin);
    }
  }
  private response() {
    this.responseCount++;
    const north = this.responseCount === 1;
    const slots = north ? [{ x: 42, z: -32 }, { x: 48, z: -25 }, { x: 39, z: -22 }, { x: 46, z: -36 }]
      : [{ x: 9, z: 36 }, { x: 16, z: 39 }, { x: 2, z: 37 }, { x: 23, z: 36 }];
    slots.forEach((p, i) => this.guard(p, i < 2, i, true));
    this.sim.events.push({ type: "security", phase: "arrival", position: { ...slots[0], y: 1 }, level: 1 });
    this.sim.events.push({ type: "comms", speaker: "vale", message: north
      ? "North-track response: two machine guns, two pistols. The south track is reporting another squad. Cover both angles and keep a robot in the clearing."
      : "Second and final squad on the southern service track. Two more machine guns. They're crossing the first squad's angle." });
  }
  updateCombat() {
    const living = this.sim.squad.filter(a => !a.dead);
    if (this.alertedAt === undefined && this.enemies.some(a => a.hp < a.maxHp || living.some(target => distance2(a.body.translation(), target.body.translation()) < 24))) this.alertedAt = this.sim.time;
    if (this.sealedAt !== undefined && this.responseCount < 2 && this.sim.time >= this.sealedAt + FOREST_RESPONSE_DELAYS[this.responseCount]) this.response();
    for (const guard of this.enemies) {
      const response = this.responseIds.includes(guard.id);
      const targets = this.alertedAt !== undefined || response ? living
        : living.filter(a => distance2(a.body.translation(), guard.body.translation()) < 24);
      const profile = response ? guard.weapon === "gun" ? RESPONSE_GUNNERS : RESPONSE_PISTOLS
        : guard.weapon === "gun" ? GUNNERS : PISTOLS;
      updateEnemy(this.sim, guard, targets, response || this.alertedAt !== undefined ? { ...profile, leash: undefined } : profile);
    }
  }
  private at(a: Actor, site: Vec2 & { radius: number }) {
    const p = this.sim.walkingPoint(a);
    return distance2(p, site) < site.radius && Math.abs(p.y - FOREST_GROUND.heightAt(site)) < 3;
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead);
    if (!living.length) { this.failureReason = "No chassis left to secure the site"; this.finish("failed"); return; }
    if (this.phase === "intercept" && this.stoppedRigs === 2) this.phase = "secure";
    if (this.phase === "secure") {
      this.contested = this.enemies.some(a => distance2(a.body.translation(), FOREST_SITES.terminal) < 10);
      this.releaseProgress = living.some(a => this.at(a, FOREST_SITES.terminal)) && !this.contested
        ? Math.min(1, this.releaseProgress + STEP / this.definition.releaseSeconds) : 0;
      if (this.releaseProgress >= 1) {
        this.sealedAt = this.sim.time; this.phase = "hold";
        this.sim.events.push({ type: "comms", speaker: "sable", message: "Work order sealed. It specifies clearing beyond the authorised boundary, under a drainage contract. The stop-work receipt went to their dispatcher too. Hold the clearing for the inspectors." });
      }
    }
    if (this.phase === "hold") {
      this.contested = this.enemies.some(a => distance2(a.body.translation(), FOREST_SITES.clearing) < 12);
      if (!this.contested && living.some(a => this.at(a, FOREST_SITES.clearing))) this.holdProgress = Math.min(1, this.holdProgress + STEP / FOREST_HOLD_SECONDS);
      if (this.holdProgress >= 1 && this.responseCount === 2 && !this.enemies.length) {
        this.inspectionAt = this.sim.time; this.phase = "return";
        this.sim.events.push({ type: "comms", speaker: "morrow", message: "The inspectors have possession. They can preserve the terminal and count the stumps. Back to the layby. We're not here to settle the data-center application with a gun." });
      }
    }
    if (this.phase === "return") {
      this.returnProgress = living.every(a => this.at(a, FOREST_SITES.entry)) ? Math.min(1, this.returnProgress + STEP) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective, enemies: this.enemies.length,
      guards: this.guardIds.length, releaseProgress: this.releaseProgress, returnProgress: this.returnProgress,
      cargoReleased: this.cargoReleased, marker: this.marker, enemyShots: this.enemyShots, deployedAt: this.deployedAt,
      finishedAt: this.finishedAt, survivors: this.sim.squad.filter(a => !a.dead).length,
      rigs: this.rigs.map(r => ({ id: r.id, hp: r.hp, maxHp: r.maxHp, position: { x: r.x, y: r.y + 1.5, z: r.z } })),
      stoppedRigs: this.stoppedRigs, holdProgress: this.holdProgress, contested: this.contested,
      alertedAt: this.alertedAt, sealedAt: this.sealedAt, inspectionAt: this.inspectionAt, responseCount: this.responseCount };
  }
}
