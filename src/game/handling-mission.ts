import RAPIER from "@dimforge/rapier3d-compat";
import { PISTOL, STEP, distance2 } from "./config";
import { updateEnemy, type EnemyProfile } from "./enemies";
import { HANDLING_DRONE_ENTRIES, HANDLING_GATE, HANDLING_GUARDS, HANDLING_SHELTERS, HANDLING_SITES, SERVICE_HALL_ROOF, SERVICE_HALL_SPEC, serviceHallWalls } from "./handling";
import { SquadHauling, type SquadLoad } from "./hauling";
import { Mission, type MissionDefinition } from "./missions";
import type { Simulation } from "./simulation";

export const HANDLING_CONTRACT = {
  id: "handling", number: "03", title: "Handling", location: "Wharf Cooperative · Gannet service hall",
  summary: "A routine return gets you through Gannet's receiving gate. Recover the cooperative's tool chest before its inventory drones reclaim it.",
  briefing: [
    { speaker: "morrow", message: "Gannet still has the cooperative's calibration tools. Their gate accepts returns even while the account is frozen. Carry the return box onto the yellow pad, then deal with the guards inside. Bring the tool chest back to our van." },
    { speaker: "rook", message: "Select a robot and click the box, or press H, to collect it. Right-click moves the load; H puts it down. The chest needs two selected chassis, and neither can fire while hauling. Leave the other two covering with C, or control their pistols yourself. Inventory drones come for moving stock. Put the load down if you need everyone fighting." },
  ],
  objectives: ["Carry the return box onto the receiving pad", "Eliminate the facility guards", "Haul the tool chest to the van with two robots", "Recover the surviving squad"],
  releaseSeconds: 0.7, returnSeconds: 1,
} as const satisfies MissionDefinition;
const GUARD_PROFILE: EnemyProfile = { brace: false, grenades: false, automaticBurst: 0.06,
  attackInterval: 0.85, reactionTime: 0.5, pistolRange: PISTOL.range, leash: 7 };

export class HandlingMission extends Mission {
  readonly definition = HANDLING_CONTRACT;
  readonly firstPhase = "delivery";
  readonly box: SquadLoad;
  readonly chest: SquadLoad;
  private gate: RAPIER.RigidBody;
  private guards: number[] = [];
  private nextWave = 3;
  carrySeconds = 0;
  waves = 0;
  constructor(sim: Simulation) {
    super(sim);
    sim.hauling = new SquadHauling(sim);
    this.box = sim.hauling.add(6000, HANDLING_SITES.box, 1);
    this.chest = sim.hauling.add(6001, HANDLING_SITES.chest, 2, false);
    this.obstacles = [{ ...HANDLING_GATE }];
    const b = HANDLING_GATE;
    this.gate = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(b.x, b.h / 2, b.z));
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2), this.gate);
    // Overhead collision must not fill the walkable floor in the ground grid.
    const roof = SERVICE_HALL_ROOF;
    const collider = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(roof.w / 2, roof.h / 2, roof.d / 2)
      .setTranslation(roof.x, roof.y! + roof.h / 2, roof.z));
    const wallSpecs = serviceHallWalls(SERVICE_HALL_SPEC), walls: number[] = [];
    sim.world.forEachCollider(c => {
      const p = c.translation();
      if (wallSpecs.some(w => Math.abs(p.x - w.x) < 0.001 && Math.abs(p.z - w.z) < 0.001 && Math.abs(p.y - w.h / 2) < 0.001))
        walls.push(c.handle);
    });
    this.roofs.push({ area: HANDLING_SHELTERS[0], collider: collider.handle, walls, revealDistance: 12 });
    HANDLING_GUARDS.forEach((p, i) => {
      const a = sim.addEnemy("assault", p);
      a.hp = a.maxHp = 110;
      a.ai = { squad: 0, gate: "SERVICE HALL", rally: { ...p }, flank: i % 2 ? 0.3 : -0.3,
        target: null, aim: { ...p, y: 1.25 }, state: "holding", nextThink: i * 0.04, nextRoute: 0,
        nextAttack: 0, entryUntil: 0, nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
      this.guards.push(a.id);
    });
  }
  get enemies() { return this.sim.actors.filter(a => this.guards.includes(a.id) && !a.dead); }
  get objective() { return this.phase === "return" || this.phase === "complete" ? 3 : this.chest.unlocked ? 2 : this.cargoReleased ? 1 : 0; }
  get marker() {
    return this.phase === "delivery" ? { ...HANDLING_SITES.delivery, kind: "dispatch" as const }
      : this.phase === "haul" || this.phase === "return" ? { ...HANDLING_SITES.exit, kind: "return" as const } : null;
  }
  updateCombat() {
    const living = this.sim.squad.filter(a => !a.dead);
    for (const a of this.enemies) updateEnemy(this.sim, a, this.cargoReleased ? living : [], GUARD_PROFILE);
    if (!this.sim.hauling!.transporting.length) return;
    this.carrySeconds += STEP;
    if (this.carrySeconds < this.nextWave) return;
    const active = this.sim.security!.drones.filter(a => !a.dead && a.flight!.contract).length;
    if (active >= 4) return;
    const heavy = this.chest.state === "carried", origin = (heavy ? this.chest : this.box).prop.body.translation();
    const entries = HANDLING_DRONE_ENTRIES.filter(p => this.cargoReleased || p.x < 9)
      .slice().sort((a, b) => distance2(a, origin) - distance2(b, origin));
    let spawned = 0;
    for (const p of entries) {
      if (spawned >= Math.min(heavy ? 2 : 1, 4 - active)) break;
      if (this.sim.security!.drones.some(a => !a.dead && distance2(a.body.translation(), p) < 3)) continue;
      if (this.sim.security!.launch({ ...p, y: 12 }, active + spawned, true)) spawned++;
    }
    if (!spawned) return;
    this.sim.events.push({ type: "security", phase: "arrival", position: { ...origin }, level: 1 });
    this.waves++; this.nextWave = this.carrySeconds + 14;
    if (this.waves === 1) this.sim.events.push({ type: "comms", speaker: "vale",
      message: "Inventory drones inbound. Your hauler's hands are full. Keep the other pistols watching the sky." });
  }
  updateObjectives() {
    if (this.stopped) return;
    const living = this.sim.squad.filter(a => !a.dead);
    if (!living.length || !this.chest.delivered && living.length < 2) {
      this.failureReason = living.length ? "Not enough chassis to recover the chest" : "Squad lost at the service hall";
      for (const load of this.sim.hauling!.loads) this.sim.hauling!.drop(load);
      this.finish("failed"); return;
    }
    if (this.phase === "delivery") {
      const p = this.box.prop.body.translation();
      const delivered = this.box.carriedOnce && p.y > 0.2 && p.y < 1.3 && distance2(p, HANDLING_SITES.delivery) < HANDLING_SITES.delivery.radius;
      this.releaseProgress = delivered ? Math.min(1, this.releaseProgress + STEP / this.definition.releaseSeconds) : 0;
      if (this.releaseProgress >= 1) {
        this.sim.hauling!.drop(this.box); this.box.delivered = true;
        this.sim.events.push({ type: "cargo", phase: "accept", position: { ...p }, heavy: false });
        this.sim.world.removeRigidBody(this.gate); this.obstacles = []; this.phase = "facility";
        this.sim.events.push({ type: "comms", speaker: "vale", message: "Return accepted. Gate open. Three guards inside; keep your carriers out of the firing lane." });
      }
    }
    if (this.phase === "facility" && !this.enemies.length) {
      this.phase = "haul"; this.chest.unlocked = true; this.nextWave = this.carrySeconds + 3;
      this.sim.events.push({ type: "comms", speaker: "rook", message: "Hall clear. Select two chassis and press H for the chest. Keep the other two covering. Bring the load onto the green pad beside the van." });
    }
    if (this.phase === "haul") {
      const p = this.chest.prop.body.translation();
      const inside = this.chest.carriedOnce && p.y > 0.2 && p.y < 1.3 && distance2(p, HANDLING_SITES.exit) < HANDLING_SITES.exit.radius;
      this.returnProgress = inside ? Math.min(1, this.returnProgress + STEP) : 0;
      if (this.returnProgress >= 1) {
        this.sim.hauling!.drop(this.chest); this.chest.delivered = true;
        this.sim.events.push({ type: "cargo", phase: "accept", position: { ...p }, heavy: true }); this.phase = "return"; this.returnProgress = 0;
        this.sim.events.push({ type: "comms", speaker: "morrow", message: "Tools recovered. Bring the rest of the squad to the van." });
      }
    }
    if (this.phase === "return") {
      const together = living.every(a => distance2(a.body.translation(), HANDLING_SITES.exit) < HANDLING_SITES.exit.radius);
      this.returnProgress = together ? Math.min(1, this.returnProgress + STEP / this.definition.returnSeconds) : 0;
      if (this.returnProgress >= 1) this.finish("complete");
    }
  }
  inspect() {
    return { id: this.definition.id, phase: this.phase, objective: this.objective, enemies: this.enemies.length,
      guards: this.guards.length, releaseProgress: this.releaseProgress, returnProgress: this.returnProgress,
      cargoReleased: this.cargoReleased, marker: this.marker, enemyShots: this.enemyShots,
      deployedAt: this.deployedAt, finishedAt: this.finishedAt, survivors: this.sim.squad.filter(a => !a.dead).length,
      waves: this.waves, carrySeconds: this.carrySeconds, waveIn: Math.max(0, this.nextWave - this.carrySeconds),
      loads: this.sim.hauling!.inspect(), failureReason: this.failureReason };
  }
}
