import RAPIER from "@dimforge/rapier3d-compat";
import { STEP, clamp, distance2, type Vec2 } from "./config";
import { NavigationGrid, segmentClear } from "./navigation";
import type { Actor, Prop, Simulation } from "./simulation";

export type SquadLoad = {
  prop: Prop; hands: 1 | 2; unlocked: boolean; delivered: boolean;
  state: "resting" | "approaching" | "lifting" | "carried";
  carriers: Actor[]; joints: RAPIER.ImpulseJoint[]; lift: number;
  path: Vec2[]; goal?: Vec2; lastRoute: number; carriedOnce: boolean; orientation: number;
};
const FORMATION_MARGIN = 5.2;
const identity = { x: 0, y: 0, z: 0, w: 1 };

/** Real rigid loads, physical grips, and one shared route for a hauling team. */
export class SquadHauling {
  loads: SquadLoad[] = [];
  private grids = new Map<number, NavigationGrid>();
  constructor(private sim: Simulation) {}
  add(id: number, position: Vec2, hands: 1 | 2, unlocked = true) {
    const size = hands === 1 ? { w: 0.7, h: 0.55, d: 0.6 } : { w: 1.6, h: 0.75, d: 0.95 };
    const body = this.sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(position.x, size.h / 2 + 0.02, position.z)
      .setLinearDamping(0.6).setAngularDamping(2).setCcdEnabled(true));
    this.sim.world.createCollider(RAPIER.ColliderDesc.cuboid(size.w / 2, size.h / 2, size.d / 2)
      .setMass(hands === 1 ? 18 : 124).setFriction(0.7).setRestitution(0.04), body);
    const prop: Prop = { id, body, ...size, style: hands === 1 ? "parcel" : "chest",
      previous: { ...body.translation() }, previousRotation: { ...body.rotation() } };
    const load: SquadLoad = { prop, hands, unlocked, delivered: false, state: "resting",
      carriers: [], joints: [], lift: 0, path: [], lastRoute: -Infinity, carriedOnce: false, orientation: 0 };
    this.sim.props.push(prop); this.loads.push(load);
    this.grids.set(id, new NavigationGrid([...this.sim.layout.barriers, ...this.sim.layout.platforms],
      hands === 1 ? 1.4 : 1.9, this.sim.layout.bounds));
    return load;
  }
  loadFor(a: Actor) { return this.loads.find(l => l.carriers.includes(a)); }
  get transporting() { return this.loads.filter(l => l.state === "carried"); }
  available() { return this.loads.find(l => l.unlocked && !l.delivered); }
  private offset(load: SquadLoad, slot: number): Vec2 {
    const o = load.hands === 1 ? { x: 0, z: -1 } : { x: slot ? 1.4 : -1.4, z: 0 };
    return { x: o.x * Math.cos(load.orientation) + o.z * Math.sin(load.orientation),
      z: o.z * Math.cos(load.orientation) - o.x * Math.sin(load.orientation) };
  }
  private yaw(load: SquadLoad, slot: number) {
    return (load.hands === 1 ? 0 : slot ? -Math.PI / 2 : Math.PI / 2) + load.orientation;
  }
  destinations(point: Vec2) {
    const load = this.loads.find(l => l.carriers.some(a => this.sim.selected.has(a.id)));
    if (!load) return null;
    const b = this.sim.layout.bounds, center = { x: clamp(point.x, b.left + FORMATION_MARGIN, b.right - FORMATION_MARGIN), z: clamp(point.z, b.back + FORMATION_MARGIN, b.front - FORMATION_MARGIN) };
    const escorts = this.sim.active.filter(a => !load.carriers.includes(a));
    return [...load.carriers.map((a, slot) => {
      const offset = this.offset(load, slot);
      return { actor: a.id, position: { x: center.x + offset.x, z: center.z + offset.z } };
    }), ...escorts.map((a, i) => ({ actor: a.id, position: {
      x: center.x - 2.8, z: center.z + (i % 2 ? -3.2 : 3.2) + Math.floor(i / 2) * 1.4,
    } }))];
  }
  intent(id?: number): { load?: SquadLoad; action: "collect" | "drop" | "blocked"; message?: string } {
    const selected = this.sim.active;
    const current = this.loads.find(l => l.carriers.some(a => selected.includes(a)));
    const load = id === undefined ? current ?? this.available() : this.loads.find(l => l.prop.id === id);
    if (this.sim.mission?.stopped) return { action: "blocked" };
    if (!load) return { action: "blocked", message: "No cargo available to collect." };
    if (load === current) return { load, action: "drop" };
    if (!load.unlocked) return { load, action: "blocked", message: "Clear the guards before collecting this cargo." };
    if (load.delivered) return { load, action: "blocked", message: "Cargo already delivered." };
    if (load.carriers.length) return { load, action: "blocked", message: "Cargo already assigned. Select a carrier and press H to put it down first." };
    const candidates = selected.filter(a => !a.haul && !this.sim.isDisrupted(a));
    if (candidates.length < load.hands) return { load, action: "blocked",
      message: load.hands === 2 ? "Select two robots to lift the chest." : "Select a robot to collect the box." };
    return { load, action: "collect" };
  }
  command(id?: number): string | null {
    const intent = this.intent(id), load = intent.load;
    if (intent.action === "blocked" || !load) return intent.message ?? null;
    if (intent.action === "drop") {
      this.sim.onInput?.({ type: "haul", ...(id === undefined ? {} : { cargo: id }) });
      this.drop(load); return null;
    }
    const candidates = this.sim.active.filter(a => !a.haul && !this.sim.isDisrupted(a));
    const p = load.prop.body.translation();
    candidates.sort((a, b) => distance2(a.body.translation(), p) - distance2(b.body.translation(), p) || a.id - b.id);
    const hands = candidates.slice(0, load.hands), original = load.orientation;
    const angles = [...new Set([original, 0, Math.PI / 2, ...(load.hands === 1 ? [Math.PI, 3 * Math.PI / 2] : [])])];
    const solids = [...this.sim.layout.barriers, ...this.sim.layout.platforms, ...(this.sim.mission?.obstacles ?? [])];
    const orientation = angles.find(angle => {
      load.orientation = angle;
      return hands.every((_, slot) => {
        const o = this.offset(load, slot), grip = { x: p.x + o.x, z: p.z + o.z };
        return segmentClear(grip, grip, solids, 0.5) && this.sim.actors.every(a =>
          hands.includes(a) || a.flight || a.dead || distance2(grip, a.body.translation()) > 0.8);
      });
    });
    load.orientation = orientation ?? original;
    if (orientation === undefined) return "Clear space around the cargo before collecting it.";
    this.sim.onInput?.({ type: "haul", ...(id === undefined ? {} : { cargo: id }) });
    load.carriers = hands; load.state = "approaching"; load.lastRoute = -Infinity;
    for (const a of load.carriers) {
      a.haul = load.prop.id; a.escort = undefined; a.cover = undefined; a.braced = false; a.braceTime = 0; a.firing = false;
    }
    this.approach(load);
    return null;
  }
  private approach(load: SquadLoad) {
    const p = load.prop.body.translation();
    load.carriers.forEach((a, slot) => {
      const offset = this.offset(load, slot);
      this.sim.navigate(a, { x: p.x + offset.x, z: p.z + offset.z });
    });
    load.lastRoute = this.sim.time;
  }
  drop(load: SquadLoad) {
    if (load.joints.length) this.sim.events.push({ type: "cargo", phase: "drop", position: { ...load.prop.body.translation() }, heavy: load.hands === 2 });
    for (const joint of load.joints) this.sim.world.removeImpulseJoint(joint, true);
    for (const a of load.carriers) { a.haul = undefined; a.path = []; a.moveTarget = undefined; }
    for (const a of this.sim.squad) if (a.escort === load.prop.id) a.escort = undefined;
    load.prop.body.lockRotations(false, true);
    load.joints = []; load.carriers = []; load.path = []; load.goal = undefined;
    load.state = "resting"; load.lift = 0;
  }
  /** Any selected hand controls the complete team. Queued moves stay shared. */
  move(load: SquadLoad, point: Vec2, queue: boolean) {
    const bounds = this.sim.layout.bounds, radius = FORMATION_MARGIN;
    const goal = { x: clamp(point.x, bounds.left + radius, bounds.right - radius),
      z: clamp(point.z, bounds.back + radius, bounds.front - radius) };
    const extras = [...(this.sim.mission?.obstacles ?? []), ...this.sim.props.filter(p => p !== load.prop)
      .map(p => ({ ...p.body.translation(), w: p.w, d: p.d }))];
    const path = this.grids.get(load.prop.id)!.findPath(queue ? load.path.at(-1) ?? load.prop.body.translation() : load.prop.body.translation(), goal, extras);
    load.path = queue ? [...load.path, ...path] : path; load.goal = load.path.at(-1);
    load.carriers.forEach((a, slot) => {
      a.braced = false;
      const offset = this.offset(load, slot);
      if (load.state === "approaching") return;
      a.moveTarget = load.goal ? { x: load.goal.x + offset.x, z: load.goal.z + offset.z } : undefined;
    });
  }
  update() {
    for (const load of this.loads) {
      if (!load.carriers.length) continue;
      if (load.carriers.some(a => a.dead || this.sim.isDisrupted(a) && a.staggerDuration >= 0.4 || a.body.translation().y < 0.5)) {
        this.drop(load); continue;
      }
      const p = load.prop.body.translation();
      if (load.state === "approaching") {
        const ready = Math.hypot(load.prop.body.linvel().x, load.prop.body.linvel().z) < 0.3 &&
          p.y < load.prop.h / 2 + 0.2 && load.carriers.every((a, slot) => {
            const offset = this.offset(load, slot);
            return distance2(a.body.translation(), { x: p.x + offset.x, z: p.z + offset.z }) < 0.16;
          });
        if (!ready) { if (this.sim.time - load.lastRoute > 1) this.approach(load); continue; }
        // Right a resting case before gripping. No translation or remote pickup.
        load.prop.body.setRotation({ x: 0, y: Math.sin(load.orientation / 2), z: 0, w: Math.cos(load.orientation / 2) }, true);
        load.prop.body.lockRotations(true, true);
        load.state = "lifting"; load.lift = 0;
        load.carriers.forEach((a, slot) => {
          const yaw = this.yaw(load, slot), q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) };
          a.yaw = yaw; a.body.setRotation(q, true); a.path = []; a.moveTarget = undefined;
          const reach = load.hands === 1 ? 1 : 1.4;
          const joint = this.sim.world.createImpulseJoint(RAPIER.JointData.fixed(
            { x: 0, y: p.y - a.body.translation().y, z: reach },
            { x: 0, y: Math.sin((load.orientation - yaw) / 2), z: 0, w: Math.cos((load.orientation - yaw) / 2) },
            { x: 0, y: 0, z: 0 }, identity), a.body, load.prop.body, true);
          joint.setContactsEnabled(false); load.joints.push(joint);
        });
      }
      if (load.state === "lifting") {
        load.lift = Math.min(1, load.lift + STEP / 0.9);
        const eased = load.lift * load.lift * (3 - 2 * load.lift);
        for (const joint of load.joints) joint.setAnchor1({ ...joint.anchor1(),
          y: (load.prop.h / 2 - 0.93) * (1 - eased) - 0.03 * eased });
        if (load.lift >= 1) {
          load.state = "carried"; load.carriedOnce = true;
          this.sim.events.push({ type: "cargo", phase: "lift", position: { ...p }, heavy: load.hands === 2 });
          load.carriers.forEach((a, slot) => {
            const offset = this.offset(load, slot);
            a.moveTarget = load.goal ? { x: load.goal.x + offset.x, z: load.goal.z + offset.z } : undefined;
          });
        }
      }
      while (load.path.length && distance2(p, load.path[0]) < 0.14) load.path.shift();
    }
  }
  escortSpeed(a: Actor, target: Vec2) {
    const load = this.loads.find(l => l.prop.id === a.escort && l.carriers.length > 0);
    if (!load) return undefined;
    const p = a.body.translation(), c = load.prop.body.translation();
    const movingAway = (target.x - p.x) * (p.x - c.x) + (target.z - p.z) * (p.z - c.z) > 0;
    return movingAway && distance2(p, c) > 5 ? 0 : load.hands === 1 ? 2.3 : 1.8;
  }
  drive(a: Actor) {
    const load = this.loadFor(a);
    if (!load || load.state === "approaching") return false;
    const slot = load.carriers.indexOf(a), offset = this.offset(load, slot), p = a.body.translation(), v = a.body.linvel();
    const center = load.carriers.reduce((sum, robot, i) => {
      const at = robot.body.translation(), o = this.offset(load, i);
      return { x: sum.x + (at.x - o.x) / load.hands, z: sum.z + (at.z - o.z) / load.hands };
    }, { x: 0, z: 0 });
    const next = load.state === "carried" && !load.carriers.some(robot => robot.braced || this.sim.isDisrupted(robot)) ? load.path[0] : undefined;
    const length = next ? distance2(center, next) : 0, speed = Math.min(load.hands === 1 ? 2.3 : 1.8, length * 3);
    const dx = (next ? (next.x - center.x) / (length || 1) * speed : 0) + (center.x + offset.x - p.x) * 3 + a.knockback.x;
    const dz = (next ? (next.z - center.z) / (length || 1) * speed : 0) + (center.z + offset.z - p.z) * 3 + a.knockback.z;
    const mass = a.body.mass() + load.prop.body.mass() / load.hands;
    a.body.applyImpulse({ x: clamp(dx - v.x, -10 * STEP, 10 * STEP) * mass, y: 0,
      z: clamp(dz - v.z, -10 * STEP, 10 * STEP) * mass }, true);
    a.yaw = this.yaw(load, slot);
    a.body.setRotation({ x: 0, y: Math.sin(a.yaw / 2), z: 0, w: Math.cos(a.yaw / 2) }, true);
    return true;
  }
  inspect() {
    return this.loads.map(l => ({ id: l.prop.id, hands: l.hands, unlocked: l.unlocked, delivered: l.delivered,
      state: l.state, carriedOnce: l.carriedOnce, orientation: l.orientation, carriers: l.carriers.map(a => a.id), lift: l.lift,
      position: { ...l.prop.body.translation() }, velocity: { ...l.prop.body.linvel() }, goal: l.goal ?? null }));
  }
}
