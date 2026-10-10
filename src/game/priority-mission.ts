import RAPIER from "@dimforge/rapier3d-compat";
import { STEP, distance2, type Vec2 } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { Mission, type MissionDefinition } from "./missions";
import { PRIORITY_GATE, PRIORITY_GUARDS, PRIORITY_RESPONSE, PRIORITY_SITES } from "./priority";
import type { Actor, Simulation } from "./simulation";
import type { CivilianVehicle } from "./traffic";

export const PRIORITY_CONTRACT = {
  id: "priority", number: "05", title: "Priority Access", location: "Wharf neighbourhood · Independent exchange",
  summary: "Gannet's recovery contractor is removing the neighbourhood's dispatch equipment. Keep it here and get the owners' technicians back inside. Military weapons authorised; choose your squad before deployment.",
  selectableSquad: true,
  briefing: [
    { speaker: "rook", message: "NEEDLE gives you reach. The two heavies turn back an advance. Four machinegunners give you two useful pairs. Q for automatic fire, E for the rifle, G for grenades. Rifle shots and grenades can hit our own team." },
    { speaker: "morrow", message: "Quill established who owns the equipment. Gannet is taking it anyway. Clear their six machines, stop the loading van, and open access for the technicians. Keep the equipment here. Get their people back inside." },
    { speaker: "vale", message: "The patrol moves; the yard and concourse posts brace. Four ramps reach the upper route; a lane runs underneath. Get a robot beside the loading van to stop removal. If loading finishes, it waits at the east gate. Their response can use the east street and concourse ramp." },
  ],
  objectives: ["Break the yard perimeter", "Stop the equipment removal", "Open access at the service door", "Protect the restart and defeat the response", "Recover the surviving squad"],
  releaseSeconds: 1.5, returnSeconds: 1,
} as const satisfies MissionDefinition;

const DEFENDERS: EnemyProfile = { brace: true, grenades: false, automaticBurst: .21,
  attackInterval: 1.4, reactionTime: .65, noticeRange: 46 };
const RESPONSE: EnemyProfile = { brace: false, grenades: true, automaticBurst: .29,
  attackInterval: 1.35, reactionTime: .75, noticeRange: 60 };
const REPAIR_SECONDS = 20;
const LOADING_SECONDS = 65;

/** Finite combat contract: seize equipment, reopen a gate, defend a physical restart. */
export class PriorityMission extends Mission {
  readonly definition = PRIORITY_CONTRACT;
  readonly firstPhase = "yard";
  readonly recovery: CivilianVehicle;
  readonly service: CivilianVehicle;
  readonly technicians: Actor[] = [];
  private gate: RAPIER.RigidBody;
  private guardIds: number[] = [];
  private responseIds: number[] = [];
  private responseGroups = new Set<number>();
  private profiles = new Map<number, EnemyProfile>();
  private heldTraffic: CivilianVehicle[];
  private repairNotice = false;
  loadingProgress = 0;
  removal: "loading" | "departing" | "gate" | "secured" = "loading";
  accessProgress = 0;
  stopProgress = 0;
  gateOpen = false;
  repairProgress = 0;
  responseAt?: number;
  restoredAt?: number;
  crewArrivedAt?: number;

  constructor(sim: Simulation) {
    super(sim);
    const traffic = sim.city!.traffic;
    this.heldTraffic = traffic.cars.filter(c => c.model === "VAN");
    this.heldTraffic.forEach(c => { c.parked = true; });
    this.recovery = traffic.park("VAN", 0xad9062, PRIORITY_SITES.loading, Math.PI / 2);
    this.service = traffic.park("VAN", 0x728c82, PRIORITY_SITES.serviceVan, -Math.PI / 2);
    const b = PRIORITY_GATE;
    this.obstacles = [{ ...b }];
    this.gate = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.h / 2, b.z));
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2), this.gate);
    PRIORITY_GUARDS.forEach(({ position, brace, leash }, i) => {
      const a = this.spawn(position, position, i, 0, "EXCHANGE PERIMETER");
      this.guardIds.push(a.id);
      this.profiles.set(a.id, { ...DEFENDERS, brace, leash });
    });
    for (const p of sim.city!.porters) sim.city!.workers.hold(p.route.id);
  }

  private spawn(position: Vec2, rally: Vec2, i: number, squad: number, gate: string): Actor {
    const a = this.sim.addEnemy("assault", position);
    a.ai = { squad, gate, rally: { ...rally }, flank: i % 2 ? .55 : -.55, target: null,
      aim: { x: rally.x, y: (rally.y ?? 0) + 1.65, z: rally.z }, state: squad ? "entering" : "holding",
      nextThink: this.sim.time + i * .04, nextRoute: 0, nextAttack: this.sim.time + 1,
      entryUntil: this.sim.time + 14, nextGrenade: squad === 1 ? this.sim.time + 9 : Infinity,
      burstUntil: 0, visible: false, fire: false };
    if (squad) this.sim.navigate(a, rally);
    return a;
  }
  get guards() { return this.sim.actors.filter(a => this.guardIds.includes(a.id) && !a.dead); }
  get response() { return this.sim.actors.filter(a => this.responseIds.includes(a.id) && !a.dead); }
  get enemies() { return [...this.guards, ...this.response]; }
  get objective() {
    return this.phase === "return" || this.phase === "complete" ? 4 : this.phase === "restore" ? 3
      : this.guards.length ? 0 : this.removal !== "secured" ? 1 : 2;
  }
  get equipmentSite() {
    const p = this.recovery.body.translation();
    return { x: p.x, z: p.z, radius: PRIORITY_SITES.loading.radius };
  }
  get marker() {
    return this.phase === "seizure" ? { ...this.equipmentSite, kind: "dispatch" as const }
      : this.phase === "dispatch" || this.phase === "restore" ? { ...PRIORITY_SITES.dispatch, kind: "dispatch" as const }
      : this.phase === "return" ? { ...PRIORITY_SITES.exit, kind: "return" as const } : null;
  }
  get contested() {
    return this.enemies.some(a => distance2(a.body.translation(), PRIORITY_SITES.dispatch) < 14);
  }
  get repairing() {
    return this.technicians.filter(a => !a.dead && distance2(a.body.translation(), PRIORITY_SITES.dispatch) < 4.5 &&
      Math.abs(this.sim.walkingPoint(a).y) < .2);
  }
  private inside(a: Actor, site: { x: number; z: number; radius: number }) {
    return distance2(a.body.translation(), site) < site.radius && Math.abs(this.sim.walkingPoint(a).y) < .2;
  }
  updateCombat() {
    const living = this.sim.squad.filter(a => !a.dead);
    for (const guard of this.guards) updateEnemy(this.sim, guard, living, this.profiles.get(guard.id)!);
    if (this.responseAt !== undefined) for (const [i, group] of PRIORITY_RESPONSE.entries()) {
      if (this.responseGroups.has(i) || this.sim.time < this.responseAt + group.delay) continue;
      this.responseGroups.add(i);
      group.positions.forEach((p, n) => {
        // Separate entry slots prevent the column fighting its own hulls.
        const rally = { ...group.rally, x: group.rally.x + n % 2 * 3, z: group.rally.z + Math.floor(n / 2) * 3 };
        const a = this.spawn(p, rally, n, i + 1, group.name);
        this.responseIds.push(a.id);
        this.profiles.set(a.id, { ...RESPONSE, brace: group.brace, grenades: i === 0 });
      });
      const p = group.positions[0];
      this.sim.events.push({ type: "security", phase: "arrival", position: { ...p, y: 1 }, level: 1 });
      this.sim.events.push({ type: "comms", speaker: "vale", message: i === 0
        ? "The workshop can see four response machines coming west along the street. They have grenades."
        : "Two more at the north end of the east ramp. They're taking the concourse above the service lane." });
    }
    // Technicians stay behind the exchange frontage. Response squads contest
    // the working area; they do not acquire a magical view of a distant crew.
    for (const a of this.response) updateEnemy(this.sim, a, living, this.profiles.get(a.id)!);
  }
  private openAccess() {
    this.phase = "restore";
    this.gateOpen = true;
    this.sim.world.removeRigidBody(this.gate);
    this.obstacles = [];
    this.responseAt = this.sim.time;
    this.sim.city!.traffic.go(this.service, PRIORITY_SITES.serviceStop);
    this.sim.events.push({ type: "comms", speaker: "vale", message: "East gate released. The owners' service van is coming in. Keep the yard and the concourse approaches covered while their crew restores dispatch." });
  }
  private bringCrew() {
    if (this.crewArrivedAt !== undefined) return;
    const p = this.service.body.translation();
    this.crewArrivedAt = this.sim.time;
    PRIORITY_SITES.technicians.forEach((goal, i) => {
      const a = this.sim.addHuman({ x: p.x - i * 1.2, z: p.z - 2.5 }, {
        name: `Technician ${i + 1}`, coat: i ? 0x687e81 : 0x8b8468, trim: 0xc7b574, hair: i ? 0x3e3732 : 0x64615c,
      });
      this.technicians.push(a);
      this.sim.navigate(a, goal);
    });
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead);
    if (!living.length || this.technicians.length > 0 && this.technicians.every(a => a.dead)) {
      this.failureReason = !living.length ? "No chassis left to hold access" : "The service crew was killed";
      this.finish("failed"); return;
    }
    if (this.removal !== "secured") {
      this.loadingProgress = Math.min(1, this.loadingProgress + STEP / LOADING_SECONDS);
      if (living.some(a => this.inside(a, this.equipmentSite))) this.stopProgress = Math.min(1, this.stopProgress + STEP);
      else this.stopProgress = 0;
      if (this.stopProgress >= 1) {
        this.removal = "secured"; this.recovery.parked = true; this.recovery.arrival = undefined;
        this.sim.events.push({ type: "comms", speaker: "vale", message: this.recovery.hp > 0
          ? "The recovery operator has relinquished the load. The equipment stays. Access control is at the exchange's service door."
          : "The van is wrecked. The equipment can be recovered here; get access open for the service crew." });
      } else if (this.removal === "loading" && this.loadingProgress >= 1) {
        this.removal = "departing";
        this.sim.city!.traffic.go(this.recovery, PRIORITY_SITES.outerGate);
        this.sim.events.push({ type: "comms", speaker: "vale", message: "Loading finished. The van is moving to the closed east gate. Stop the removal there." });
      } else if (this.removal === "departing" && (this.recovery.parked || this.recovery.hp <= 0)) this.removal = "gate";
    }
    if (this.phase === "yard" && !this.guards.length) {
      this.phase = this.removal === "secured" ? "dispatch" : "seizure";
      this.sim.events.push({ type: "comms", speaker: "vale", message: this.removal === "secured"
        ? "Perimeter clear. Open access at the service door."
        : "Perimeter clear. Get a robot beside the recovery van and stop the removal." });
    }
    if (this.phase === "seizure" && this.removal === "secured") this.phase = "dispatch";
    if (this.phase === "dispatch") {
      this.accessProgress = living.some(a => this.inside(a, PRIORITY_SITES.dispatch))
        ? Math.min(1, this.accessProgress + STEP / this.definition.releaseSeconds) : 0;
      if (this.accessProgress >= 1) this.openAccess();
    }
    if (this.phase === "restore") {
      if (this.service.hp <= 0 || this.service.state === "stranded" || this.service.parked && distance2(this.service.body.translation(), PRIORITY_SITES.serviceStop) < 2)
        this.bringCrew();
      // Contact can push a worker away from the cabinet. Recover at a bounded
      // cadence instead of issuing a route search every simulation tick.
      this.technicians.forEach((a, i) => {
        if (!a.dead && !a.path.length && distance2(a.body.translation(), PRIORITY_SITES.technicians[i]) > 1.5 &&
            this.sim.time >= (a.replanAt ?? 0)) {
          this.sim.navigate(a, PRIORITY_SITES.technicians[i]); a.replanAt = this.sim.time + 2;
        }
      });
      if (!this.contested && this.repairing.length) this.repairProgress = Math.min(1,
        this.repairProgress + STEP / REPAIR_SECONDS * this.repairing.length / 2);
      if (!this.repairNotice && this.repairing.length && this.contested) {
        this.repairNotice = true;
        this.sim.events.push({ type: "comms", speaker: "vale", message: "The technicians have stopped work. Push those machines away from the service door; the work they've completed will hold." });
      }
      if (this.repairProgress >= 1 && this.restoredAt === undefined) {
        this.restoredAt = this.sim.time; this.releaseProgress = 1;
        for (const p of this.sim.city!.porters) this.sim.city!.workers.resume(p.route.id);
        this.heldTraffic.forEach(c => { c.parked = false; });
        this.sim.events.push({ type: "comms", speaker: "sable", message: "The local dispatcher is answering. The owners have control again. Their delivery orders are running." });
      }
      if (this.restoredAt !== undefined && this.responseGroups.size === PRIORITY_RESPONSE.length && !this.response.length) {
        this.phase = "return";
        this.sim.events.push({ type: "comms", speaker: "morrow", message: "The exchange is theirs and the response is finished. Bring the surviving squad back to the west-square van." });
      }
    }
    if (this.phase === "return") {
      this.returnProgress = living.every(a => this.inside(a, PRIORITY_SITES.exit))
        ? Math.min(1, this.returnProgress + STEP / this.definition.returnSeconds) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective, enemies: this.enemies.length,
      guards: this.guardIds.length, guardsRemaining: this.guards.length, response: this.response.length,
      releaseProgress: this.releaseProgress, returnProgress: this.returnProgress, cargoReleased: this.cargoReleased,
      marker: this.marker, enemyShots: this.enemyShots, deployedAt: this.deployedAt, finishedAt: this.finishedAt,
      survivors: this.sim.squad.filter(a => !a.dead).length, failureReason: this.failureReason,
      loadingProgress: this.loadingProgress, removal: this.removal, equipmentSite: this.equipmentSite,
      recoveryVehicle: this.recovery.id, serviceVehicle: this.service.id, accessProgress: this.accessProgress,
      gateOpen: this.gateOpen, repairProgress: this.repairProgress, contested: this.contested,
      responseAt: this.responseAt, responseGroups: this.responseGroups.size, restoredAt: this.restoredAt,
      crewArrivedAt: this.crewArrivedAt, technicians: this.technicians.map(a => ({ id: a.id, hp: a.hp, dead: a.dead,
        working: this.repairing.includes(a), position: { ...a.body.translation() } })),
    };
  }
}
