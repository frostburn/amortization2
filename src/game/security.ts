import RAPIER from "@dimforge/rapier3d-compat";
import { STEP, clamp, distance2, type Vec3, type RoofedArea } from "./config";
import type { Actor, Simulation } from "./simulation";

const staticHull = (c: RAPIER.Collider) => !c.parent() || c.parent()!.isFixed();
const identity = { x: 0, y: 0, z: 0, w: 1 };

/** Conservative hull/volume sweep for roofs omitted by the cutaway renderer. */
function crossesArea(from: Vec3, to: Vec3, area: RoofedArea, margin = WATCH.radius, bottom = area.y ?? 0) {
  let enter = 0, leave = 1;
  for (const [start, end, low, high] of [
    [from.x, to.x, area.x - area.w / 2 - margin, area.x + area.w / 2 + margin],
    [from.z, to.z, area.z - area.d / 2 - margin, area.z + area.d / 2 + margin],
    [from.y, to.y, bottom - (margin ? WATCH.halfHeight : 0), (area.y ?? 0) + area.h + (margin ? WATCH.halfHeight : 0)],
  ]) {
    const delta = end - start;
    if (Math.abs(delta) < 1e-8) { if (start < low || start > high) return false; continue; }
    const a = (low - start) / delta, b = (high - start) / delta;
    enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
    if (enter > leave) return false;
  }
  return true;
}

export const WATCH = {
  hp: 66, mass: 30, radius: 1.38, halfHeight: .22,
  hover: 5.5, speed: 7, climb: 4.5, dispatchDelay: 2.5,
  reinforcementDelay: 8, quietSeconds: 26, maxActive: 6, wreckSeconds: 12,
};
export type SecurityFlight = {
  state: "descending" | "pursuing" | "holding" | "withdrawing" | "disabled";
  goal: Vec3; hover: number; rotors: number; slot: number; spawnedAt: number;
  contract?: boolean;
  transit?: { goal: Vec3; stage: "climb" | "cross" | "descend" };
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
  private hull = new RAPIER.Cylinder(WATCH.halfHeight, WATCH.radius);
  constructor(private sim: Simulation) {
    this.ceiling = Math.max(16, ...sim.layout.barriers.filter(b => !b.navigationOnly).map(b => (b.y ?? 0) + b.h + 5),
      ...sim.layout.platforms.map(b => (b.y ?? 0) + b.h + 5),
      ...(sim.layout.shelters ?? []).map(b => (b.y ?? 0) + b.h + 5));
  }
  get level() { return this.pressure >= 7 ? 3 : this.pressure >= 3 ? 2 : this.pressure > 0 ? 1 : 0; }
  get active() { return this.drones.filter(a => !a.dead && !a.flight!.contract); }
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
      a.flight!.transit = undefined;
      a.ai!.nextThink = this.sim.time;
    }
  }
  attacked(a: Actor) {
    if (!a.flight || a.dead || a.flight.contract) return;
    this.report(a.body.translation(), a.id);
  }
  private columnClear(point: Vec3) {
    const from = { ...point, y: this.ceiling + 2 }, to = { ...point, y: 2.5 };
    return !this.blocked(from, to);
  }
  private blocked(from: Vec3, to: Vec3, exclude?: RAPIER.RigidBody) {
    if (this.sim.layout.shelters?.some(area => crossesArea(from, to, area))) return true;
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, length = Math.hypot(dx, dy, dz);
    return length > .05 && !!this.sim.world.castShape(from, identity,
      { x: dx / length, y: dy / length, z: dz / length }, this.hull,
      .05, length, true, undefined, undefined, undefined, exclude, staticHull);
  }
  private holdingGoal(area: RoofedArea, a: Actor, target: Vec3) {
    const exits = area.exits.slice().sort((x, y) => distance2(x, target) - distance2(y, target));
    for (const exit of exits) {
      const outward = { x: exit.x - area.x, z: exit.z - area.z }, length = Math.hypot(outward.x, outward.z) || 1;
      // Four distinct outdoor banks leave room for a hauling pair at the door.
      const banks = Array.from({ length: 4 }, (_, slot) => {
        const spread = (slot - 1.5) * 3.2;
        return { x: exit.x - outward.z / length * spread, y: a.flight!.hover,
          z: exit.z + outward.x / length * spread };
      });
      // Keep a reserved bank. New arrivals choose nearby banks so opposite
      // approaches do not cross and jam their wide physical rotor guards.
      const cost = (point: Vec3) => distance2(point, a.flight!.goal) < .1 ? -1 : distance2(point, a.body.translation());
      banks.sort((x, y) => cost(x) - cost(y));
      for (const point of banks) {
        if (this.drones.some(other => other !== a && !other.dead && other.flight!.state === "holding" &&
          distance2(other.flight!.goal, point) < 3)) continue;
        if (this.columnClear(point)) return point;
      }
    }
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
      this.launch(position, slot);
      this.sim.events.push({ type: "security", phase: "arrival", position: { ...position }, level: this.level });
    }
    this.nextDispatch = this.sim.time + WATCH.reinforcementDelay;
  }
  /** Authored hostiles share flight, hit physics, wreck cleanup and rendering,
   * but never create complaints or stand down with civilian security. */
  launch(position: Vec3, slot: number, contract = false): Actor | undefined {
    if (!this.columnClear(position)) return undefined;
    const actor = this.sim.addSecurityDrone(position), hover = contract ? 4.2 : WATCH.hover + slot % 2;
    actor.flight = { state: "descending", goal: { ...position, y: hover },
      hover, rotors: 1, slot, spawnedAt: this.sim.time, contract };
    if (contract) actor.hp = actor.maxHp = 44;
    actor.ai = { squad: -1, gate: contract ? "FACILITY RESPONSE" : "air", rally: position, flank: 0, target: null,
      aim: { ...position, y: 0 }, state: "entering", nextThink: this.sim.time, nextRoute: 0,
      nextAttack: this.sim.time + 1, entryUntil: 0, nextGrenade: Infinity, burstUntil: 0, visible: false, fire: false };
    this.drones.push(actor);
    return actor;
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
        a.flight!.transit = undefined;
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
        const shelter = this.sim.layout.shelters?.find(area => Math.abs(q.x - area.x) < area.w / 2 &&
          Math.abs(q.z - area.z) < area.d / 2 && q.y < (area.y ?? 0) + area.h);
        brain.aim = { x: q.x, y: q.y + .25, z: q.z };
        const muzzle = this.sim.muzzle(a, brain.aim);
        brain.visible = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 26 &&
          !this.sim.layout.shelters?.some(area => crossesArea(muzzle, brain.aim, area, 0, (area.y ?? 0) + area.h - .15)) &&
          this.sim.fireRay(a, muzzle, brain.aim)?.collider.handle === target.collider.handle;
        brain.state = a.pistol.reload ? "reloading" : brain.visible ? "aiming" : "advancing";
        flight.state = shelter ? "holding" : "pursuing";
        if (shelter) {
          const goal = this.holdingGoal(shelter, a, q);
          if (goal) flight.goal = goal;
          if (!brain.visible && !a.pistol.reload) brain.state = "holding";
        } else if (!brain.visible || distance2(p, q) < 8 || distance2(p, q) > 18) {
          const bearing = Math.atan2(p.x - q.x, p.z - q.z);
          const bounds = this.sim.layout.bounds;
          for (const offset of [0, .7, -.7, 1.4, -1.4, Math.PI]) {
            const goal = { x: clamp(q.x + Math.sin(bearing + offset) * 13, bounds.left + 3, bounds.right - 3),
              y: flight.hover, z: clamp(q.z + Math.cos(bearing + offset) * 13, bounds.back + 3, bounds.front - 3) };
            if (!this.columnClear(goal) || this.drones.some(other => !other.dead && other !== a && distance2(other.body.translation(), goal) < 3)) continue;
            flight.goal = goal;
            break;
          }
        } else flight.goal = { x: p.x, y: flight.hover, z: p.z };
      }
      if (brain.visible && now >= brain.nextAttack && !a.pistol.reload) {
        brain.burstUntil = now + .08;
        brain.nextAttack = now + (flight.contract ? 1.6 : 1.05);
      }
      brain.fire = brain.visible && now < brain.burstUntil;
      if (brain.fire) brain.state = "firing";
    }
  }
  fly(a: Actor) {
    const f = a.flight!, p = a.body.translation(), v = a.body.linvel();
    let goal = f.goal;
    const altitude = this.ceiling + (f.state === "withdrawing" ? 8 : 0);
    if (!f.transit && this.blocked(p, goal, a.body)) f.transit = { goal: { ...goal }, stage: "climb" };
    if (f.transit) {
      const route = f.transit;
      // Finish the checked outdoor approach before accepting another pursuit
      // goal. Recomputing a diagonal descent each tick could cut through a roof.
      if (route.stage === "climb") {
        goal = { x: p.x, y: this.ceiling, z: p.z };
        if (p.y >= this.ceiling - .25) route.stage = "cross";
      } else if (route.stage === "cross") {
        goal = { ...route.goal, y: altitude };
        if (distance2(p, route.goal) < .25 && Math.hypot(v.x, v.z) < .7)
          route.stage = "descend";
      } else if (this.columnClear(route.goal) || f.state === "withdrawing") {
        goal = route.goal;
        if (distance2(p, goal) < .25 && Math.abs(p.y - goal.y) < .25) f.transit = undefined;
      } else goal = { x: p.x, y: altitude, z: p.z };
    }
    const horizontal = Math.hypot(goal.x - p.x, goal.z - p.z);
    const speed = Math.min(WATCH.speed, horizontal * 1.5);
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
      drones: this.drones.map(a => ({ id: a.id, model: "WATCH", contract: !!a.flight!.contract, state: a.flight!.state, hp: a.hp,
        position: { ...a.body.translation() }, velocity: { ...a.body.linvel() }, goal: { ...a.flight!.goal },
        transit: a.flight!.transit ? { stage: a.flight!.transit.stage, goal: { ...a.flight!.transit.goal } } : null,
        rotors: a.flight!.rotors, target: a.ai!.target })) };
  }
}
