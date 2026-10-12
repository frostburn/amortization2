import { MAGAZINE, PISTOL, STEP, clamp, distance2, type Vec2 } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { Mission, type MissionDefinition } from "./missions";
import { NIGHT_SITES, NIGHT_CONVOY_START, NIGHT_CONVOY_END, NIGHT_GROUND_WAVES, NIGHT_DRONE_WAVES, NIGHT_ROLL_DELAY, NIGHT_FOOTHOLD_SECONDS, forestPoint } from "./night-forest";
import type { Actor, Simulation } from "./simulation";
import type { CivilianVehicle } from "./traffic";

export const NIGHT_CONTRACT = {
  id: "nightforest", number: "08", title: "Night Shift", location: "Birchwater catchment · Inspection night watch",
  summary: "The inspectors are coming to preserve the seized logging site. Pistol drones are harassing their supply convoy while the contractor moves robots back into the clearing. Keep both fronts open.",
  selectableSquad: true,
  briefing: [
    { speaker: "morrow", message: "The injunction survived the evening hearing. The contractor is trying to make it irrelevant before morning. Keep their robots out of the clearing and get the inspectors' two supply vehicles into the receiving bay. Both vehicles must survive." },
    { speaker: "vale", message: "The convoy comes from the west along the southern forestry road. Twelve seconds before it rolls. The clearing is north of the fork. Send one robot to meet the vehicles and three into the clearing; you can see both approaches from here." },
    { speaker: "rook", message: "The road attackers are small pistol drones. One machine gun and a covering order should handle a pair. Stay beside the road, ahead of the convoy; don't stand in its lane. The clearing gets machine guns and pistols from two tracks. Keep three chassis for that fight." },
    { speaker: "sable", message: "Work lights sweep the clearing; headlights move with the convoy. Your squad shares optical contacts, but the overhead camera doesn't see through darkness. Gunfire gives positions away briefly. Hold the clearing while the convoy arrives, defeat the last response, then assemble at the receiving bay." },
  ],
  objectives: ["Protect the convoy and prevent a foothold in the clearing", "Defeat the remaining contractor robots", "Assemble the surviving squad at the receiving bay"],
  releaseSeconds: 0, returnSeconds: 1,
} as const satisfies MissionDefinition;
const GUN: EnemyProfile = { brace: true, grenades: false, automaticBurst: .26, attackInterval: 2.6, reactionTime: .9, noticeRange: 45, automaticRange: 38, leash: 16 };
const PISTOLS: EnemyProfile = { ...GUN, brace: false, attackInterval: 1.5, pistolRange: 23 };

export class NightForestMission extends Mission {
  readonly definition = NIGHT_CONTRACT;
  readonly firstPhase = "hold";
  readonly convoy: CivilianVehicle[];
  groundWaves = 0;
  droneWaves = 0;
  occupation = 0;
  arrivedAt?: number;
  rolling = false;
  contested = false;
  private groundIds: number[] = [];
  private droneIds: number[] = [];
  constructor(sim: Simulation) {
    super(sim);
    this.convoy = NIGHT_CONVOY_START.map((p, i) => {
      const c = sim.city!.traffic.park(i ? "TRUCK" : "VAN", i ? 0x879e8c : 0x71988c, p, Math.PI / 2);
      c.hp = i ? 620 : 320; c.speedLimit = 1.85;
      return c;
    });
    [{ x: 22, z: -7 }, { x: 16, z: -18 }, { x: 28, z: 0 }].forEach((p, i) => this.guard(p, i === 0, 0, i));
  }
  get groundEnemies() { return this.sim.actors.filter(a => this.groundIds.includes(a.id) && !a.dead); }
  get drones() { return this.sim.actors.filter(a => this.droneIds.includes(a.id) && !a.dead); }
  get enemies() { return [...this.groundEnemies, ...this.drones]; }
  get arrived() { return this.convoy.every((c, i) => c.hp > 0 && distance2(c.body.translation(), NIGHT_CONVOY_END[i]) < 2); }
  get objective() { return this.phase === "return" || this.phase === "complete" ? 2 : this.arrivedAt === undefined ? 0 : 1; }
  get marker() { if (this.stopped) return null; return this.phase === "return" ? { ...NIGHT_SITES.receiving, kind: "return" as const } : { ...NIGHT_SITES.clearing, kind: "dispatch" as const }; }
  private guard(position: Vec2, gun: boolean, wave: number, slot: number) {
    const a = this.sim.addEnemy("assault", position);
    a.weapons = [gun ? "gun" : "pistol"]; a.weapon = gun ? "gun" : "pistol";
    a.ammo = gun ? MAGAZINE : 0; a.pistol.ammo = PISTOL.magazine;
    a.hp = a.maxHp = gun ? 150 : 100;
    const rally = forestPoint({ x: 9 + slot * 5, z: -8 + (wave % 2 ? 4 : -4) });
    a.ai = { squad: wave, gate: "NIGHT REOCCUPATION", rally, flank: slot % 2 ? .5 : -.5,
      target: null, aim: { ...rally, y: rally.y + 1.4 }, state: "entering", nextThink: this.sim.time + slot * .05,
      nextRoute: 0, nextAttack: this.sim.time + 1, entryUntil: this.sim.time + 12,
      nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
    this.groundIds.push(a.id); this.sim.navigate(a, rally);
  }
  private groundWave() {
    const wave = ++this.groundWaves;
    const positions = wave % 2 ? [{ x: 37, z: -33 }, { x: 44, z: -28 }, { x: 38, z: -21 }]
      : [{ x: 12, z: 29 }, { x: 16, z: 31 }, { x: 9, z: 33 }];
    positions.forEach((p, i) => this.guard(p, i === 0, wave, i));
    this.sim.events.push({ type: "comms", speaker: "vale", message: wave % 2 ? "Contractor squad on the north track. Machine gun with two pistols." : "Southern track: another ground squad. Keep the clearing covered." });
  }
  private droneWave() {
    const vehicles = this.convoy.filter((c, i) => c.hp > 0 && distance2(c.body.translation(), NIGHT_CONVOY_END[i]) > 2);
    if (!vehicles.length) { this.droneWaves = NIGHT_DRONE_WAVES.length; return; }
    const lead = vehicles[0].body.translation();
    let launched = 0;
    for (const side of [-1, 1]) {
      const p = { x: clamp(lead.x + 8, -70, 65), z: 37 + side * 3 };
      const a = this.sim.security!.launch(forestPoint(p, 9), this.droneWaves * 2 + launched, true);
      if (!a) continue;
      a.flight!.hover = forestPoint(p, 4.5).y; a.flight!.goal.y = a.flight!.hover;
      a.hp = a.maxHp = 24; a.ai!.gate = "CONVOY HARASSMENT";
      this.droneIds.push(a.id); launched++;
    }
    this.droneWaves++;
    this.sim.events.push({ type: "comms", speaker: "rook", message: "Pistol drones approaching the convoy. Road cover, keep them off the vehicles." });
  }
  updateCombat() {
    const elapsed = this.sim.time - this.deployedAt;
    if (!this.rolling && elapsed >= NIGHT_ROLL_DELAY) {
      this.rolling = true;
      this.convoy.forEach((c, i) => this.sim.city!.traffic.go(c, NIGHT_CONVOY_END[i]));
      this.sim.events.push({ type: "comms", speaker: "vale", message: "Convoy rolling. Its lights are on the southern road." });
    }
    if (this.groundWaves < NIGHT_GROUND_WAVES.length && elapsed >= NIGHT_GROUND_WAVES[this.groundWaves]) this.groundWave();
    if (this.droneWaves < NIGHT_DRONE_WAVES.length && elapsed >= NIGHT_DRONE_WAVES[this.droneWaves]) this.droneWave();
    const living = this.sim.squad.filter(a => !a.dead);
    for (const a of this.groundEnemies) updateEnemy(this.sim, a, living, a.weapon === "gun" ? GUN : PISTOLS);
  }
  managesDrone(actor: Actor) { return this.droneIds.includes(actor.id); }
  /** Overrides the civilian-security target policy; flight and ballistics stay shared. */
  updateAirCombat() {
    for (const a of this.drones) {
      const f = a.flight!, b = a.ai!, p = a.body.translation();
      b.fire = false;
      if (p.y > f.hover + 1 || this.sim.isDisrupted(a)) continue;
      f.state = "pursuing";
      if (this.sim.time >= b.nextThink) {
        b.nextThink = this.sim.time + .2;
        const protector = this.sim.squad.filter(target => !target.dead && distance2(p, target.body.translation()) < 14 && this.sim.canSee(a, target))
          .sort((first, second) => distance2(p, first.body.translation()) - distance2(p, second.body.translation()))[0];
        const vehicle = this.convoy.filter(c => c.hp > 0).sort((first, second) => distance2(p, first.body.translation()) - distance2(p, second.body.translation()))[0];
        const target = protector ?? vehicle;
        if (!target) continue;
        if (b.target !== target.id) b.nextAttack = Math.max(b.nextAttack, this.sim.time + .8);
        const q = target.body.translation(); b.target = target.id;
        b.aim = { ...q, y: q.y + (protector ? .25 : .3) };
        const hit = this.sim.fireRay(a, this.sim.muzzle(a, b.aim), b.aim);
        b.visible = distance2(p, q) < 26 && !!hit && (protector ? hit.collider.handle === protector.collider.handle : vehicle!.colliders.some(c => c.handle === hit.collider.handle));
        b.state = b.visible ? "aiming" : "advancing";
        f.goal = { x: q.x + 12 + (f.slot % 2 ? 2 : 0), y: f.hover, z: clamp(q.z + (f.slot % 2 ? -5 : 5), 33, 41) };
      }
      if (b.visible && this.sim.time >= b.nextAttack && !a.pistol.reload) {
        b.burstUntil = this.sim.time + .06; b.nextAttack = this.sim.time + 2.4;
      }
      b.fire = b.visible && this.sim.time < b.burstUntil;
      if (!a.pistol.ammo) this.sim.reloadActor(a);
    }
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead);
    if (!living.length || this.convoy.some(c => c.hp <= 0)) {
      this.failureReason = !living.length ? "No squad chassis left" : "An inspection supply vehicle was destroyed";
      this.finish("failed"); return;
    }
    const near = (a: Actor) => distance2(a.body.translation(), NIGHT_SITES.clearing) < NIGHT_SITES.clearing.radius;
    const hostile = this.groundEnemies.some(near), friendly = living.some(near);
    this.contested = hostile && friendly;
    this.occupation = clamp(this.occupation + (hostile && !friendly ? STEP / NIGHT_FOOTHOLD_SECONDS : !hostile && friendly ? -STEP / 25 : 0), 0, 1);
    if (this.occupation >= 1) { this.failureReason = "The contractor established a foothold in the clearing"; this.finish("failed"); return; }
    if (this.arrived && this.arrivedAt === undefined) {
      this.arrivedAt = this.sim.time;
      this.sim.events.push({ type: "comms", speaker: "morrow", message: "Both supply vehicles are in. Finish clearing the contractor's response; the inspectors will take over." });
    }
    if (this.arrivedAt !== undefined && this.groundWaves === NIGHT_GROUND_WAVES.length && this.droneWaves === NIGHT_DRONE_WAVES.length && !this.enemies.length && this.phase !== "return") {
      this.phase = "return";
      this.sim.events.push({ type: "comms", speaker: "sable", message: "Site secure. Assemble everyone at the receiving bay beside the convoy." });
    }
    if (this.phase === "return") {
      this.returnProgress = living.every(a => distance2(a.body.translation(), NIGHT_SITES.receiving) < NIGHT_SITES.receiving.radius)
        ? Math.min(1, this.returnProgress + STEP) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective, enemies: this.enemies.length,
      guards: this.groundIds.length, enemyShots: this.enemyShots, deployedAt: this.deployedAt, finishedAt: this.finishedAt,
      survivors: this.sim.squad.filter(a => !a.dead).length, releaseProgress: this.releaseProgress, returnProgress: this.returnProgress,
      cargoReleased: this.cargoReleased, marker: this.marker, occupation: this.occupation, contested: this.contested,
      groundWaves: this.groundWaves, droneWaves: this.droneWaves, arrivedAt: this.arrivedAt, rolling: this.rolling,
      convoy: this.convoy.map((c, i) => ({ id: c.id, hp: c.hp, maxHp: i ? 620 : 320, position: { ...c.body.translation() }, arrived: distance2(c.body.translation(), NIGHT_CONVOY_END[i]) < 2 })) };
  }
}
