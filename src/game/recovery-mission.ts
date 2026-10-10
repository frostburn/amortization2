import { MAGAZINE, PISTOL, STEP, distance2, type Vec2, type Vec3 } from "./config";
import { alertEnemies, updateEnemy, type EnemyProfile } from "./enemies";
import { Mission, type MissionDefinition } from "./missions";
import { SquadHauling, type SquadLoad } from "./hauling";
import { RECOVERY_DRIVE_HP, RECOVERY_ROLL_DELAY, RECOVERY_ROUTE, RECOVERY_SITES, RECOVERY_SPEED } from "./recovery";
import type { Actor, Simulation } from "./simulation";
import { VEHICLES, vehicleFootprint, type CivilianVehicle } from "./traffic";

export const RECOVERY_CONTRACT = {
  id: "recovery", number: "06", title: "Recovery Fee", location: "Wharf industrial district · Junction 14",
  summary: "Gannet is moving the cooperative's seized charging racks and drive assemblies out of the district. Intercept the convoy, secure the load and recover the squad.",
  selectableSquad: true,
  briefing: [
    { speaker: "morrow", message: "Stop the cargo truck before it leaves by the east road. Break its drive, defeat security and bring its dispatch case back to our van. The cooperative will collect the bulk equipment. Keep firing into a stopped truck and you'll destroy what we came for." },
    { speaker: "vale", message: "Scout car, sand-coloured box truck, red security van. They're coming from the west, then turning south and east. Twelve seconds before they move, then about a minute and a half to the exit. The walkway crosses their route. You can reach it by either ramp, or fight from the workshop lane." },
    { speaker: "rook", message: "Two machinegunners and three pistol robots in that van. Expect bursts and braced firing positions. Push one off its corner while the other pair changes angle. The truck's lower drive housing is vulnerable; a rifle hit or sustained automatic fire will stop it." },
    { speaker: "sable", message: "One robot can carry the dispatch case; its hands will be full. Click the case or press H to lift it. The inventory tag wakes when moved, so expect a patrol. Bring it through the west service entrance with the rest covering." },
  ],
  objectives: ["Disable the cargo truck before it escapes", "Defeat security and collect the dispatch case", "Carry the case and surviving squad to the van"],
  releaseSeconds: 0, returnSeconds: 1,
} as const satisfies MissionDefinition;

const MACHINEGUN: EnemyProfile = { brace: true, grenades: false, automaticBurst: .42,
  attackInterval: 2.4, reactionTime: 1.1, noticeRange: 70 };
const PISTOLS: EnemyProfile = { brace: false, grenades: false, automaticBurst: .06,
  attackInterval: 1.8, reactionTime: 1, noticeRange: 65, pistolRange: 22 };
const PURSUIT_GUN: EnemyProfile = { ...MACHINEGUN, automaticBurst: .3, attackInterval: 2.8, noticeRange: 90 };
const PURSUIT_PISTOL: EnemyProfile = { ...PISTOLS, noticeRange: 90 };
export const RECOVERY_PATROL_DELAY = 6;

/** A finite interception. Cargo keeps moving under attack until physically disabled. */
export class RecoveryMission extends Mission {
  readonly definition = RECOVERY_CONTRACT;
  readonly firstPhase = "intercept";
  readonly scout: CivilianVehicle;
  readonly truck: CivilianVehicle;
  readonly securityVan: CivilianVehicle;
  readonly recoveryVan: CivilianVehicle;
  readonly case: SquadLoad;
  private guardIds: number[] = [];
  private patrolIds: number[] = [];
  pursuitDue?: number;
  patrolAt?: number;
  deliveredAt?: number;
  private initialHp = new Map<number, number>();
  private reportedBend = false;
  private reportedExit = false;
  rolling = false;
  engagedAt?: number;
  disabledAt?: number;
  securedAt?: number;
  escaped = false;

  constructor(sim: Simulation) {
    super(sim);
    const traffic = sim.city!.traffic;
    const convoy = (model: CivilianVehicle["model"], color: number, position: Vec2) => {
      const c = traffic.park(model, color, position, Math.PI / 2);
      c.team = "enemy"; c.speedLimit = RECOVERY_SPEED;
      this.initialHp.set(c.id, c.hp);
      return c;
    };
    this.scout = convoy("CAB", 0x81483f, RECOVERY_SITES.scout);
    this.truck = convoy("TRUCK", 0xb7a679, RECOVERY_SITES.truck);
    this.truck.driveHp = RECOVERY_DRIVE_HP;
    this.securityVan = convoy("VAN", 0x81483f, RECOVERY_SITES.security);
    this.recoveryVan = traffic.park("VAN", 0x728c82, { x: -85, z: 40 }, Math.PI / 2);
    // Unrelated vehicles are parked in actual workshop bays, away from the convoy.
    traffic.park("CAB", 0x7a9291, { x: 48, z: 7 }, 0);
    traffic.park("CAB", 0xb7bab0, { x: -72, z: 29 }, 0);
    sim.hauling = new SquadHauling(sim);
    // Created before scene construction, but stays inside the truck until secured.
    this.case = sim.hauling.add(6000, { x: -120, z: -90 }, 1, false);
    this.case.prop.body.setEnabled(false);
  }
  get convoy() { return [this.scout, this.truck, this.securityVan]; }
  get enemies() { return this.sim.actors.filter(a => (this.guardIds.includes(a.id) || this.patrolIds.includes(a.id)) && !a.dead); }
  get objective() { return this.phase === "return" || this.phase === "complete" ? 2 : this.disabledAt !== undefined ? 1 : 0; }
  get loadCondition() { return this.truck.hp > 0 ? "intact" : "salvage"; }
  get marker() {
    return this.phase === "return" ? { ...RECOVERY_SITES.exit, kind: "return" as const }
      : this.disabledAt !== undefined && !this.enemies.length && !this.finished
        ? { ...this.truck.body.translation(), radius: 6, kind: "dispatch" as const } : null;
  }
  private clearGround(p: Vec2) {
    return !!this.sim.terrain?.canStand({ ...p, y: 0 }) &&
      !this.sim.city!.vehicles.some(c => {
        const b = vehicleFootprint(c);
        return Math.abs(p.x - b.x) < b.w / 2 + .9 && Math.abs(p.z - b.z) < b.d / 2 + .9;
      });
  }
  private deployGuard(position: Vec2, rally: Vec2, gunner: boolean, slot: number, pursuit = false) {
    const a = this.sim.addEnemy("assault", position);
    a.weapons = [gunner ? "gun" : "pistol"];
    a.weapon = gunner ? "gun" : "pistol";
    a.ammo = gunner ? MAGAZINE : 0;
    a.pistol.ammo = PISTOL.magazine;
    if (pursuit) a.hp = a.maxHp = gunner ? 120 : 100;
    a.ai = { squad: pursuit ? 2 : 1, gate: pursuit ? "RECOVERY PATROL" : "CONVOY SECURITY", rally: { ...rally }, flank: slot % 2 ? .6 : -.6,
      target: null, aim: { ...rally, y: 1.5 }, state: "entering", nextThink: this.sim.time + slot * .06,
      nextRoute: 0, nextAttack: this.sim.time + 1.5, entryUntil: this.sim.time + (pursuit ? 1 : 5),
      nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
    (pursuit ? this.patrolIds : this.guardIds).push(a.id);
    this.sim.navigate(a, rally);
    return a;
  }
  private engage(firingPosition?: Vec3) {
    if (this.engagedAt !== undefined) return;
    this.engagedAt = this.sim.time;
    // The scout keeps going: parking it in this lane would halt the cargo truck.
    this.securityVan.parked = true; this.securityVan.waypoints = undefined; this.securityVan.arrival = undefined;
    const van = this.securityVan.body.translation(), truck = this.truck.body.translation();
    const yaw = this.securityVan.yaw, forward = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const side = { x: forward.z, z: -forward.x };
    const clear = (p: Vec2) => this.clearGround(p);
    // Doors may face a ramp or a wall. Resolve disembarkation on the street at
    // a bounded cost, never inside a vehicle or a solid structure.
    const slots: Vec2[] = [];
    for (const along of [0, -5, 5, -8, 8]) for (const across of [-8, 8, -11, 11]) {
      const p = { x: van.x + forward.x * along + side.x * across,
        z: van.z + forward.z * along + side.z * across };
      if (clear(p) && slots.every(q => distance2(p, q) > 1.8)) slots.push(p);
    }
    // A blast can tip the van into roadside cover. Search a small, bounded
    // neighbourhood for the nearest usable disembarkation points in that case.
    for (const radius of [9, 13, 17]) {
      if (slots.length >= 5) break;
      for (let angle = 0; angle < 24; angle++) {
        const p = { x: van.x + Math.sin(angle * Math.PI / 12) * radius,
          z: van.z + Math.cos(angle * Math.PI / 12) * radius };
        if (clear(p) && slots.every(q => distance2(p, q) > 1.8)) slots.push(p);
      }
    }
    const roles = [true, true, false, false, false];
    for (const [i, gunner] of roles.entries()) {
      const p = slots[i];
      // The road has enough width for five slots even if the van is wrecked.
      if (!p) throw new Error("Convoy disembarkation has no clear street slot");
      const proposed = gunner ? { x: truck.x + (i ? 9 : -9), z: truck.z + (i ? -10 : 10) }
        : { x: (firingPosition?.x ?? truck.x - 8) + (i - 3) * 4,
          z: (firingPosition?.z ?? truck.z) + (i % 2 ? -11 : 11) };
      this.deployGuard(p, clear(proposed) ? proposed : p, gunner, i);
    }
    if (firingPosition) alertEnemies(this.sim, firingPosition);
    this.sim.events.push({ type: "security", phase: "arrival", position: { ...van, y: 1 }, level: 1 });
    this.sim.events.push({ type: "comms", speaker: "rook", message: "Security is out. Two machine guns. They need that truck; let them come back for it." });
  }
  private releaseCase() {
    const truck = this.truck.body.translation(), yaw = this.truck.yaw;
    const forward = { x: Math.sin(yaw), z: Math.cos(yaw) }, side = { x: forward.z, z: -forward.x };
    const slots: Vec2[] = [];
    for (const along of [0, -4, 4, -8, 8]) for (const across of [-5, 5, -8, 8]) {
      const p = { x: truck.x + forward.x * along + side.x * across, z: truck.z + forward.z * along + side.z * across };
      if (this.clearGround(p)) slots.push(p);
    }
    const p = slots.sort((a, b) => distance2(a, RECOVERY_SITES.exit) - distance2(b, RECOVERY_SITES.exit))[0];
    if (!p) return false; // Retry after a displaced vehicle settles; never spawn in a wall.
    const prop = this.case.prop;
    prop.body.setTranslation({ ...p, y: prop.h / 2 + .02 }, true);
    prop.previous = { ...prop.body.translation() };
    prop.body.setEnabled(true); this.case.unlocked = true;
    return true;
  }
  private deployPatrol() {
    const load = this.case.prop.body.translation(), truck = this.truck.body.translation();
    const living = this.sim.squad.filter(a => !a.dead), slots: Vec2[] = [];
    // Street entries behind the load, with a safe separation even after a late interception.
    const yaw = this.truck.yaw, preferred = { x: truck.x - Math.sin(yaw) * 22, z: truck.z - Math.cos(yaw) * 22 };
    const candidates: Vec2[] = [];
    for (const road of this.sim.layout.city!.streets) for (let d = -road.length / 2 + 4; d < road.length / 2 - 4; d += 4)
      for (const offset of [-3, 3]) candidates.push(road.axis === "x"
        ? { x: road.center + d, z: road.at + offset } : { x: road.at + offset, z: road.center + d });
    for (const p of candidates.sort((a, b) => distance2(a, preferred) - distance2(b, preferred))) {
      if (this.clearGround(p) && distance2(p, load) > 12 && living.every(a => distance2(p, a.body.translation()) > 18) &&
          slots.every(q => distance2(p, q) > 3)) slots.push(p);
      if (slots.length === 3) break;
    }
    if (slots.length < 3) return;
    slots.forEach((p, i) => this.deployGuard(p, load, i === 0, i, true));
    this.patrolAt = this.sim.time;
    for (const a of this.enemies) if (a.ai) a.ai.alertPosition = { ...load };
    this.sim.events.push({ type: "security", phase: "arrival", position: { ...slots[0], y: 1 }, level: 1 });
    this.sim.events.push({ type: "comms", speaker: "vale", message: "A patrol is following the case's inventory signal. One machine gun, two pistols. Keep the carrier moving; the west service entrance is open." });
  }
  updateCombat() {
    const traffic = this.sim.city!.traffic;
    if (!this.rolling && this.sim.time >= this.deployedAt + RECOVERY_ROLL_DELAY) {
      this.rolling = true;
      for (const c of this.engagedAt === undefined ? this.convoy : [this.scout, this.truck]) traffic.follow(c, RECOVERY_ROUTE);
      this.sim.events.push({ type: "comms", speaker: "vale", message: "The convoy is moving east from the parts depot. Box truck in the middle. The raised walkway is ahead of it." });
    }
    const living = this.sim.squad.filter(a => !a.dead);
    if (this.engagedAt === undefined) {
      const damaged = this.convoy.find(c => c.hp < this.initialHp.get(c.id)!);
      const source = damaged?.attackPosition;
      const spotted = living.find(a => this.convoy.some(c => {
        const p = c.body.translation(), q = a.body.translation();
        return distance2(p, q) < 22 && this.sim.ray(p, q, c.body)?.collider.handle === a.collider.handle;
      }));
      if (damaged || spotted) this.engage(source ?? (spotted ? this.sim.walkingPoint(spotted) : undefined));
    }
    if (this.case.carriedOnce && this.pursuitDue === undefined) {
      this.pursuitDue = this.sim.time + RECOVERY_PATROL_DELAY;
      this.sim.events.push({ type: "comms", speaker: "sable", message: "The inventory tag is transmitting. Get that case to the van. You can put it down with H if the carrier needs to fight." });
    }
    if (this.pursuitDue !== undefined && this.sim.time >= this.pursuitDue && this.patrolAt === undefined) this.deployPatrol();
    for (const a of this.enemies) updateEnemy(this.sim, a, living, this.patrolIds.includes(a.id)
      ? a.weapon === "gun" ? PURSUIT_GUN : PURSUIT_PISTOL : a.weapon === "gun" ? MACHINEGUN : PISTOLS);
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead), truck = this.truck.body.translation();
    if (!living.length) { this.sim.hauling!.drop(this.case); this.failureReason = "No chassis left to secure the load"; this.finish("failed"); return; }
    if (this.truck.driveHp !== 0 && this.truck.hp > 0 && truck.x >= 91 && truck.z > 10) {
      this.escaped = true; this.failureReason = "The cargo truck left the district"; this.finish("failed"); return;
    }
    if ((this.truck.driveHp === 0 || !this.truck.hp) && this.disabledAt === undefined) {
      this.disabledAt = this.sim.time; this.phase = "secure";
      this.sim.events.push({ type: "comms", speaker: "sable", message: this.truck.hp > 0
        ? "Truck drive is out. Load is intact. Cease fire on the truck; clear its security detail."
        : "Truck destroyed. Some assemblies can be salvaged. Clear the security detail and secure what's left." });
    }
    if (!this.reportedBend && truck.x > 10 && this.disabledAt === undefined) {
      this.reportedBend = true;
      this.sim.events.push({ type: "comms", speaker: "vale", message: "The truck is at the first bend. It's turning south toward the workshop junction." });
    }
    if (!this.reportedExit && truck.z > 13 && this.disabledAt === undefined) {
      this.reportedExit = true;
      this.sim.events.push({ type: "comms", speaker: "vale", message: "It's making the final turn. The east road is its way out." });
    }
    if (this.phase === "secure" && this.engagedAt !== undefined && !this.enemies.length &&
        living.some(a => distance2(a.body.translation(), truck) < 6 && Math.abs(this.sim.walkingPoint(a).y) < .2) && this.releaseCase()) {
      this.releaseProgress = 1; this.securedAt = this.sim.time; this.phase = "return";
      // Collection approaches through the workshop yard, not the blocked convoy road.
      this.sim.city!.traffic.go(this.recoveryVan, { x: -62, z: 40 });
      this.sim.events.push({ type: "comms", speaker: "morrow", message: this.loadCondition === "intact"
        ? "Security clear. The cooperative will collect the bulk load. Take the dispatch case beside the truck back to our van; one carrier, the rest covering."
        : "Security clear. The cooperative will salvage the assemblies. Recover the dispatch case beside the wreck; one carrier, the rest covering." });
    }
    if (this.phase === "return") {
      const p = this.case.prop.body.translation();
      if (!this.case.delivered && this.case.carriedOnce && p.y > .2 && p.y < 1.3 && distance2(p, RECOVERY_SITES.exit) < RECOVERY_SITES.exit.radius) {
        this.sim.hauling!.drop(this.case); this.case.delivered = true; this.deliveredAt = this.sim.time;
        this.sim.events.push({ type: "cargo", phase: "accept", position: { ...p }, heavy: false });
        this.sim.events.push({ type: "comms", speaker: "rook", message: "Case aboard. Bring every surviving chassis into the bay; we can leave the patrol behind." });
      }
      this.returnProgress = this.case.delivered && living.every(a => distance2(a.body.translation(), RECOVERY_SITES.exit) < RECOVERY_SITES.exit.radius &&
        Math.abs(this.sim.walkingPoint(a).y) < .2) ? Math.min(1, this.returnProgress + STEP / this.definition.returnSeconds) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective, enemies: this.enemies.length,
      guards: this.guardIds.length, releaseProgress: this.releaseProgress, returnProgress: this.returnProgress,
      cargoReleased: this.cargoReleased, marker: this.marker, enemyShots: this.enemyShots,
      deployedAt: this.deployedAt, finishedAt: this.finishedAt, survivors: this.sim.squad.filter(a => !a.dead).length,
      failureReason: this.failureReason, rolling: this.rolling, engagedAt: this.engagedAt, disabledAt: this.disabledAt,
      securedAt: this.securedAt, escaped: this.escaped, loadCondition: this.loadCondition,
      loads: this.sim.hauling!.inspect(), pursuitDue: this.pursuitDue, patrolAt: this.patrolAt,
      patrol: this.patrolIds.length, deliveredAt: this.deliveredAt,
      truck: { id: this.truck.id, hp: this.truck.hp, maxHp: VEHICLES.TRUCK.hp,
        driveHp: this.truck.driveHp, maxDriveHp: RECOVERY_DRIVE_HP, position: { ...this.truck.body.translation() } },
      convoy: this.convoy.map(c => ({ id: c.id, model: c.model, hp: c.hp, state: c.state,
        position: { ...c.body.translation() } })),
    };
  }
}
