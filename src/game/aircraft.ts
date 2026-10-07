import RAPIER from "@dimforge/rapier3d-compat";
import { BLAST_RADIUS, STEP, clamp, distance2, type Vec3 } from "./config";
import type { CityDistrict, DeliveryPad, FlightRoute } from "./city";
import type { Simulation } from "./simulation";

export const KITE = { mass: 18, hp: 24, speed: 6, climb: 2.6, restHeight: 0.493, span: 2.24 };
export type FlightState = "takeoff" | "cruise" | "approach" | "hover" | "delivery" | "abort" | "crashing" | "stranded" | "disabled";
export type CivilianKite = {
  id: number; model: "KITE"; route: FlightRoute; body: RAPIER.RigidBody; colliders: RAPIER.Collider[];
  previous: Vec3; previousRotation: { x: number; y: number; z: number; w: number };
  hp: number; state: FlightState; plan: Vec3[]; next: number; outbound: boolean; returning: boolean;
  wait: number; alertUntil: number; deliveries: number; loaded: boolean; rotors: number; yaw: number; distance: number;
};

/** Authored air corridors, finite thrust and designated pads; no ground A* calls. */
export class ParcelFlights {
  kites: CivilianKite[] = [];
  private hulls = new Map<number, CivilianKite>();
  constructor(private sim: Simulation, private district: CityDistrict) {
    // Match the existing 33 mm paving surface under each collection pad.
    // It remains walkable and adds no permanent navigation obstruction.
    for (const pad of district.pads) sim.world.createCollider(RAPIER.ColliderDesc.cuboid(2.3, 0.0165, 2.3)
      .setTranslation(pad.x, 0.0165, pad.z).setFriction(0.65));
    for (const [i, route] of district.flights.entries()) {
      const home = this.pad(route.home);
      const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(home.x, KITE.restHeight, home.z).lockRotations()
        .setLinearDamping(0.05).setAngularDamping(1.2).setCcdEnabled(true));
      const colliders: RAPIER.Collider[] = [];
      const add = (desc: RAPIER.ColliderDesc) => colliders.push(sim.world.createCollider(desc.setFriction(0.65).setRestitution(0.08), body));
      add(RAPIER.ColliderDesc.cuboid(0.37, 0.14, 0.30).setTranslation(0, 0.1, 0).setMass(12));
      add(RAPIER.ColliderDesc.cuboid(0.23, 0.13, 0.24).setTranslation(0, -0.16, 0).setMass(0));
      for (const x of [-0.72, 0.72]) for (const z of [-0.63, 0.63])
        add(RAPIER.ColliderDesc.cylinder(0.025, 0.4).setTranslation(x, 0.23, z).setMass(1));
      for (const x of [-0.4, 0.4])
        add(RAPIER.ColliderDesc.cuboid(0.045, 0.045, 0.58).setTranslation(x, -0.4, 0).setMass(1));
      const c: CivilianKite = { id: 2000 + i, model: "KITE", route, body, colliders,
        previous: { ...body.translation() }, previousRotation: { ...body.rotation() }, hp: KITE.hp,
        state: "delivery", plan: [], next: 0, outbound: true, returning: false, wait: 2 + i * 5,
        alertUntil: 0, deliveries: 0, loaded: true, rotors: 0, yaw: 0, distance: 0 };
      // One established flight makes the aircraft visible immediately; the others
      // leave their individual depot pads on staggered schedules.
      this.makeTrip(c);
      if (!i) {
        c.next = 2; c.state = "cruise"; c.wait = 0; c.rotors = 1;
        const a = c.plan[1], b = c.plan[2];
        const start = { x: a.x + (b.x - a.x) * 0.65, y: a.y, z: a.z + (b.z - a.z) * 0.65 };
        body.setTranslation(start, true); c.previous = { ...start };
      }
      this.kites.push(c); colliders.forEach(h => this.hulls.set(h.handle, c));
    }
  }
  private pad(id: string): DeliveryPad { return this.district.pads.find(p => p.id === id)!; }
  private makeTrip(c: CivilianKite) {
    const start = this.pad(c.outbound ? c.route.home : c.route.destination);
    const end = this.pad(c.outbound ? c.route.destination : c.route.home);
    const corridor = c.outbound ? c.route.corridor : [...c.route.corridor].reverse();
    c.plan = [start, ...corridor, end].map(p => ({ x: p.x, y: c.route.altitude, z: p.z }));
    c.plan.push({ x: end.x, y: KITE.restHeight, z: end.z }); c.next = 0;
  }
  neutral(handle: number) { return this.hulls.get(handle); }
  disturb(from: Vec3, to: Vec3, duration: number) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    for (const c of this.kites) {
      if (!c.hp || ["crashing", "stranded"].includes(c.state)) continue;
      const p = c.body.translation(), end = c.plan.at(-1)!;
      const t = clamp(((p.x - from.x) * dx + (p.y - from.y) * dy + (p.z - from.z) * dz) / (dx * dx + dy * dy + dz * dz || 1), 0, 1);
      const nearShot = Math.hypot(p.x - from.x - dx * t, p.y - from.y - dy * t, p.z - from.z - dz * t) < 10;
      // Ground combat near an aircraft or its intended pad cancels collection.
      if (!nearShot && distance2(p, from) > 18 && distance2(end, from) > 12) continue;
      c.alertUntil = Math.max(c.alertUntil, this.sim.time + duration);
      if (c.returning) continue;
      const home = this.pad(c.route.home);
      c.returning = true; c.wait = 0; c.state = "abort";
      c.plan = [{ x: p.x, y: c.route.altitude, z: p.z },
        { x: home.x, y: c.route.altitude, z: home.z }, { x: home.x, y: KITE.restHeight, z: home.z }]; c.next = 0;
    }
  }
  damage(c: CivilianKite, damage: number, impulse: Vec3, point: Vec3) {
    const alive = c.hp > 0;
    c.hp = Math.max(0, c.hp - damage); c.state = c.hp ? "crashing" : "disabled";
    c.body.lockRotations(false, true);
    c.body.applyImpulseAtPoint(impulse, point, true);
    for (const [v, limit, spin] of [[c.body.linvel(), 14, false], [c.body.angvel(), 8, true]] as const) {
      const speed = Math.hypot(v.x, v.y, v.z);
      if (speed <= limit) continue;
      const bounded = { x: v.x * limit / speed, y: v.y * limit / speed, z: v.z * limit / speed };
      if (spin) c.body.setAngvel(bounded, true); else c.body.setLinvel(bounded, true);
    }
    if (alive && !c.hp) this.sim.events.push({ type: "down", position: { ...c.body.translation() } });
  }
  blast(origin: Vec3, source?: RAPIER.RigidBody) {
    for (const c of this.kites) {
      const p = c.body.translation(), d = Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z);
      if (d >= BLAST_RADIUS || this.sim.ray(origin, p, c.body, h => !source || h.parent()?.handle !== source.handle)) continue;
      const f = 1 - d / BLAST_RADIUS, strength = 500 * f;
      this.damage(c, 160 * Math.sqrt(f), { x: (p.x - origin.x) / Math.max(d, 0.4) * strength,
        y: strength * 0.7, z: (p.z - origin.z) / Math.max(d, 0.4) * strength }, p);
    }
  }
  private occupied(c: CivilianKite, pad: Vec3) {
    const obstacles = [...this.sim.actors.map(a => a.body), ...this.sim.props.map(p => p.body),
      ...(this.sim.city?.carts ?? []).map(c => c.body), ...(this.sim.city?.porters ?? []).map(c => c.body),
      ...(this.sim.city?.vehicles ?? []).map(c => c.body),
      ...this.kites.filter(k => k !== c).map(k => k.body)];
    return obstacles.some(body => { const p = body.translation(); return p.y < 3 && distance2(p, pad) < 2.5; });
  }
  update() {
    for (const c of this.kites) {
      const p = c.body.translation(), v = c.body.linvel();
      c.previous = { ...p }; c.previousRotation = { ...c.body.rotation() };
      c.distance += Math.hypot(v.x, v.y, v.z) * STEP;
      if (["crashing", "stranded", "disabled"].includes(c.state)) {
        c.rotors = Math.max(0, c.rotors - STEP * 1.5);
        if (c.hp && Math.hypot(v.x, v.y, v.z) < 0.35 && this.sim.ray(p, { x: p.x, y: p.y - 0.8, z: p.z }, c.body)) c.state = "stranded";
        continue;
      }
      if (c.state === "delivery") {
        c.rotors = Math.max(0, c.rotors - STEP * 1.4); c.wait = Math.max(0, c.wait - STEP);
        if (c.wait || c.alertUntil > this.sim.time) continue;
        c.returning = false; this.makeTrip(c); c.state = "takeoff";
      }
      c.rotors = Math.min(1, c.rotors + STEP * 1.5);
      let target = c.plan[c.next];
      const final = c.next === c.plan.length - 1;
      const blocked = final && this.occupied(c, target);
      if (blocked) { target = { ...target, y: 3.5 }; c.state = "hover"; }
      else if (c.returning) c.state = "abort";
      else c.state = final ? "approach" : c.next ? "cruise" : "takeoff";
      const dx = target.x - p.x, dy = target.y - p.y, dz = target.z - p.z, horizontal = Math.hypot(dx, dz);
      if (!blocked && horizontal < 0.18 && Math.abs(dy) < (final ? 0.05 : 0.25) && Math.hypot(v.x, v.y, v.z) < (final ? 0.3 : 0.9)) {
        if (final) {
          if (!c.returning && c.outbound) { c.deliveries++; c.loaded = false; }
          else c.loaded = true;
          c.outbound = !c.returning && c.outbound ? false : true;
          c.state = "delivery"; c.wait = 5; continue;
        }
        c.next++; continue;
      }
      const speed = Math.min(KITE.speed, horizontal * 1.4);
      const desired = { x: dx / (horizontal || 1) * speed, y: clamp(dy * 1.5, -KITE.climb, KITE.climb), z: dz / (horizontal || 1) * speed };
      // Thrust counters world gravity; position never snaps to a waypoint.
      c.body.applyImpulse({ x: clamp((desired.x - v.x) * 3, -4, 4) * KITE.mass * STEP,
        y: (clamp((desired.y - v.y) * 4, -6, 6) - this.sim.world.gravity.y) * KITE.mass * STEP,
        z: clamp((desired.z - v.z) * 3, -4, 4) * KITE.mass * STEP }, true);
      if (horizontal > 0.3) {
        const wanted = Math.atan2(dx, dz), angle = Math.atan2(Math.sin(wanted - c.yaw), Math.cos(wanted - c.yaw));
        c.yaw += clamp(angle, -STEP * 1.8, STEP * 1.8);
      }
      const pitch = final ? 0 : clamp((v.x * Math.sin(c.yaw) + v.z * Math.cos(c.yaw)) * 0.024, -0.15, 0.15);
      const sy = Math.sin(c.yaw / 2), cy = Math.cos(c.yaw / 2), sp = Math.sin(pitch / 2), cp = Math.cos(pitch / 2);
      c.body.setRotation({ x: cy * sp, y: sy * cp, z: -sy * sp, w: cy * cp }, true);
    }
  }
  inspect() {
    return this.kites.map(c => ({ id: c.id, model: c.model, route: c.route.id, state: c.state, hp: c.hp,
      loaded: c.loaded, deliveries: c.deliveries, rotors: c.rotors, distance: c.distance, alertUntil: c.alertUntil,
      position: { ...c.body.translation() }, velocity: { ...c.body.linvel() }, destination: { ...c.plan.at(-1)! } }));
  }
}
