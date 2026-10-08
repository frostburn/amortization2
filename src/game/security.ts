import type RAPIER from "@dimforge/rapier3d-compat";
import { STEP, clamp, distance2, type Vec3 } from "./config";
import type { Actor, Simulation } from "./simulation";

const staticHull = (c: RAPIER.Collider) => !c.parent() || c.parent()!.isFixed();

export const WATCH = {
  hp: 66, mass: 30, radius: 1.38, halfHeight: .22,
  hover: 5.5, speed: 7, climb: 4.5, dispatchDelay: 2.5,
  reinforcementDelay: 8, quietSeconds: 26, maxActive: 6, wreckSeconds: 12,
};
export type SecurityFlight = {
  state: "descending" | "pursuing" | "withdrawing" | "disabled";
  goal: Vec3; hover: number; rotors: number; slot: number; spawnedAt: number;
};

/** Local, bounded air response. No ground navigation and no civilian/enemy blame. */
export class SecurityResponse {
  drones: Actor[] = [];
  pressure = 0;
  lastIncident = -Infinity;
  private incident: Vec3 = { x: 0, y: 0, z: 0 };
  private nextDispatch = Infinity;
  private reported = new Map<number, number>();
  readonly ceiling: number;
  constructor(private sim: Simulation) {
    this.ceiling = Math.max(16, ...sim.layout.barriers.filter(b => !b.navigationOnly).map(b => (b.y ?? 0) + b.h + 5),
      ...sim.layout.platforms.map(b => (b.y ?? 0) + b.h + 5));
  }
  get level() { return this.pressure >= 7 ? 3 : this.pressure >= 3 ? 2 : this.pressure > 0 ? 1 : 0; }
  get active() { return this.drones.filter(a => !a.dead); }
  report(position: Vec3, victim: number, destroyed = false) {
    // One complaint per burst, but a destruction always counts immediately.
    if (!destroyed && this.sim.time - (this.reported.get(victim) ?? -Infinity) < .75) {
      this.lastIncident = this.sim.time;
      return;
    }
    this.reported.set(victim, this.sim.time);
    this.incident = { ...position };
    this.lastIncident = this.sim.time;
    this.pressure = Math.min(12, this.pressure + (destroyed ? 3 : 1));
    if (!Number.isFinite(this.nextDispatch)) {
      this.nextDispatch = this.sim.time + WATCH.dispatchDelay;
      this.sim.events.push({ type: "security", phase: "dispatch", position: { ...position }, level: this.level });
    }
    for (const a of this.active) if (a.flight!.state === "withdrawing") {
      a.flight!.state = "pursuing";
      a.ai!.nextThink = this.sim.time;
    }
  }
  attacked(a: Actor) {
    if (!a.flight || a.dead) return;
    this.report(a.body.translation(), a.id);
  }
  private columnClear(point: Vec3) {
    return [[0, 0], [-WATCH.radius, 0], [WATCH.radius, 0], [0, -WATCH.radius], [0, WATCH.radius]].every(([dx, dz]) =>
      !this.sim.ray({ x: point.x + dx, y: this.ceiling + 2, z: point.z + dz },
        { x: point.x + dx, y: 2.5, z: point.z + dz }, undefined, staticHull));
  }
  private arrival(slot: number): Vec3 | undefined {
    const bounds = this.sim.layout.bounds;
    for (const radius of [9, 15, 22, 30]) for (let i = 0; i < 12; i++) {
      const angle = (i + slot * 6) * Math.PI / 6;
      const point = { x: clamp(this.incident.x + Math.sin(angle) * radius, bounds.left + 3, bounds.right - 3),
        y: this.ceiling, z: clamp(this.incident.z + Math.cos(angle) * radius, bounds.back + 3, bounds.front - 3) };
      if (this.active.some(a => distance2(a.body.translation(), point) < 4) || !this.columnClear(point)) continue;
      return point;
    }
  }
  private spawn() {
    const quota = Math.min(WATCH.maxActive, this.level * 2), count = Math.min(2, quota - this.active.length);
    for (let i = 0; i < count; i++) {
      const slot = this.active.length, position = this.arrival(slot);
      if (!position) continue; // Try again later rather than placing a hull inside scenery.
      const actor = this.sim.addSecurityDrone(position);
      actor.flight = { state: "descending", goal: { ...position, y: WATCH.hover + slot % 2 },
        hover: WATCH.hover + slot % 2, rotors: 1, slot, spawnedAt: this.sim.time };
      actor.ai = { squad: -1, gate: "air", rally: position, flank: 0, target: null,
        aim: { ...position, y: 0 }, state: "entering", nextThink: this.sim.time, nextRoute: 0,
        nextAttack: this.sim.time + 1, entryUntil: 0, nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
      this.drones.push(actor);
      this.sim.events.push({ type: "security", phase: "arrival", position: { ...position }, level: this.level });
    }
    this.nextDispatch = this.sim.time + WATCH.reinforcementDelay;
  }
  update() {
    const now = this.sim.time, living = this.sim.squad.filter(a => !a.dead);
    if (this.pressure && now - this.lastIncident >= WATCH.quietSeconds || !living.length) {
      if (this.pressure) this.sim.events.push({ type: "security", phase: "standdown", position: { ...this.incident }, level: 0 });
      this.pressure = 0;
      this.nextDispatch = Infinity;
      this.reported.clear();
      for (const a of this.active) if (a.flight!.state !== "withdrawing") {
        const p = a.body.translation();
        a.flight!.state = "withdrawing";
        a.flight!.goal = { x: p.x + (a.flight!.slot % 2 ? 18 : -18), y: this.ceiling + 8, z: p.z + 12 };
      }
    }
    if (this.level && now >= this.nextDispatch && this.active.length < this.level * 2) this.spawn();
    for (const a of [...this.drones]) {
      const flight = a.flight!, brain = a.ai!, p = a.body.translation();
      brain.fire = false;
      if (a.dead) {
        flight.state = "disabled";
        flight.rotors = Math.max(0, flight.rotors - STEP * 2);
        if (now - a.deathTime! > WATCH.wreckSeconds) this.retire(a);
        continue;
      }
      if (flight.state === "withdrawing") {
        brain.state = "entering";
        brain.target = null;
        if (p.y > this.ceiling + 6) this.retire(a);
        continue;
      }
      if (flight.state === "descending") {
        brain.state = "entering";
        if (p.y > flight.hover + 1) continue;
        flight.state = "pursuing";
      }
      if (this.sim.isDisrupted(a)) { brain.state = "suppressed"; brain.burstUntil = 0; continue; }
      if (!living.length) continue;
      if (now >= brain.nextThink) {
        brain.nextThink = now + .2;
        const target = living.reduce((best, candidate) =>
          distance2(p, candidate.body.translation()) - (candidate.id === brain.target ? 2 : 0) <
          distance2(p, best.body.translation()) - (best.id === brain.target ? 2 : 0) ? candidate : best);
        if (brain.target !== target.id) { brain.nextAttack = now + .7; brain.burstUntil = 0; }
        brain.target = target.id;
        const q = target.body.translation();
        brain.aim = { x: q.x, y: q.y + .25, z: q.z };
        const muzzle = this.sim.muzzle(a, brain.aim);
        brain.visible = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 26 &&
          this.sim.fireRay(a, muzzle, brain.aim)?.collider.handle === target.collider.handle;
        brain.state = a.pistol.reload ? "reloading" : brain.visible ? "aiming" : "advancing";
        if (!brain.visible || distance2(p, q) < 8 || distance2(p, q) > 18) {
          const bearing = Math.atan2(p.x - q.x, p.z - q.z);
          const bounds = this.sim.layout.bounds;
          for (const offset of [0, .7, -.7, 1.4, -1.4, Math.PI]) {
            const goal = { x: clamp(q.x + Math.sin(bearing + offset) * 13, bounds.left + 3, bounds.right - 3),
              y: flight.hover, z: clamp(q.z + Math.cos(bearing + offset) * 13, bounds.back + 3, bounds.front - 3) };
            if (!this.columnClear(goal) || this.active.some(other => other !== a && distance2(other.body.translation(), goal) < 3)) continue;
            flight.goal = goal;
            break;
          }
        } else flight.goal = { x: p.x, y: flight.hover, z: p.z };
      }
      if (brain.visible && now >= brain.nextAttack && !a.pistol.reload) {
        brain.burstUntil = now + .08;
        brain.nextAttack = now + 1.05;
      }
      brain.fire = brain.visible && now < brain.burstUntil;
      if (brain.fire) brain.state = "firing";
    }
  }
  fly(a: Actor) {
    const f = a.flight!, p = a.body.translation(), v = a.body.linvel();
    let goal = f.goal;
    const blocked = this.sim.ray(p, goal, a.body, staticHull);
    // Lift over rooflines before crossing; descend only through a checked column.
    if (blocked && f.state !== "withdrawing") goal = { ...goal, y: this.ceiling };
    const horizontal = Math.hypot(goal.x - p.x, goal.z - p.z);
    const crossing = blocked && p.y < this.ceiling - 1;
    const speed = crossing ? 0 : Math.min(WATCH.speed, horizontal * 1.5);
    const desired = { x: (goal.x - p.x) / (horizontal || 1) * speed + a.knockback.x,
      y: clamp((goal.y - p.y) * 1.5, -WATCH.climb, WATCH.climb),
      z: (goal.z - p.z) / (horizontal || 1) * speed + a.knockback.z };
    const acceleration = this.sim.isDisrupted(a) ? 2 : 6;
    a.body.applyImpulse({ x: clamp((desired.x - v.x) * 3, -acceleration, acceleration) * WATCH.mass * STEP,
      y: (clamp((desired.y - v.y) * 4, -7, 7) - this.sim.world.gravity.y) * WATCH.mass * STEP,
      z: clamp((desired.z - v.z) * 3, -acceleration, acceleration) * WATCH.mass * STEP }, true);
  }
  private retire(a: Actor) {
    this.sim.retireEnemy(a);
    this.drones = this.drones.filter(other => other !== a);
  }
  inspect() {
    return { phase: this.pressure ? this.active.length ? "engaged" : "dispatched" : this.active.length ? "withdrawing" : "quiet",
      level: this.level, pressure: this.pressure, lastIncident: Number.isFinite(this.lastIncident) ? this.lastIncident : null,
      dispatchIn: Number.isFinite(this.nextDispatch) ? Math.max(0, this.nextDispatch - this.sim.time) : null,
      drones: this.drones.map(a => ({ id: a.id, model: "WATCH", state: a.flight!.state, hp: a.hp,
        position: { ...a.body.translation() }, velocity: { ...a.body.linvel() }, rotors: a.flight!.rotors, target: a.ai!.target })) };
  }
}
