import RAPIER from "@dimforge/rapier3d-compat";
import { BLAST_RADIUS, STEP, clamp, distance2, type Vec2, type Vec3 } from "./config";
import { inWater, type CityDistrict, type PorterRoute } from "./city";
import { segmentClear } from "./navigation";
import type { Prop, Simulation } from "./simulation";

export const PORTER = { height: 1.9, width: 0.68, depth: 0.56, mass: 92, hp: 90,
  speed: 1.35, loadedSpeed: 1.05, retreatSpeed: 0.85, turnSpeed: 2.4, liftTime: 1.6 };
export const TOTE = { w: 0.66, h: 0.36, d: 0.46, mass: 14, reach: 0.72, carryHeight: 0.16 };
export type PorterState = "travel" | "pickup" | "place" | "waiting" | "yield" | "steady" | "withdraw" |
  "tumbling" | "stranded" | "disabled";
export type CivilianPorter = {
  id: number; model: "PORTER"; route: PorterRoute; next: number; cargoStation: number;
  body: RAPIER.RigidBody; collider: RAPIER.Collider; cargo: Prop; grip?: RAPIER.ImpulseJoint;
  previous: Vec3; previousRotation: { x: number; y: number; z: number; w: number };
  hp: number; yaw: number; state: PorterState; phase: number; wait: number;
  distance: number; transfers: number; blocked: number; alertUntil: number; brakeUntil: number;
  impactUntil: number; settled: number;
};

function lineDistance(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return distance2(p, { x: a.x + t * dx, z: a.z + t * dz });
}

/** Authored cargo aisles, local yielding and physical two-handed loads. No per-tick A*. */
export class CargoWorkers {
  porters: CivilianPorter[] = [];
  constructor(private sim: Simulation, private district: CityDistrict) {
    for (const [i, route] of (district.porterRoutes ?? []).entries()) {
      const start = route.points[0], yaw = start.station!.yaw;
      const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x, PORTER.height / 2 + 0.01, start.z).lockRotations()
        .setLinearDamping(0.4).setAngularDamping(5).setCcdEnabled(true));
      body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
      const collider = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(PORTER.width / 2, PORTER.height / 2, PORTER.depth / 2)
        .setMass(PORTER.mass).setFriction(0.15).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), body);
      const load = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(start.x + Math.sin(yaw) * TOTE.reach, 0.7 + TOTE.h / 2 + 0.01,
          start.z + Math.cos(yaw) * TOTE.reach).setLinearDamping(0.6).setAngularDamping(2).setCcdEnabled(true));
      load.setRotation(body.rotation(), true);
      sim.world.createCollider(RAPIER.ColliderDesc.cuboid(TOTE.w / 2, TOTE.h / 2, TOTE.d / 2)
        .setMass(TOTE.mass).setFriction(0.7).setRestitution(0.04), load);
      const cargo: Prop = { id: 4000 + i, body: load, ...TOTE, style: "tote",
        previous: { ...load.translation() }, previousRotation: { ...load.rotation() } };
      sim.props.push(cargo);
      this.porters.push({ id: 3000 + i, model: "PORTER", route, next: 0, cargoStation: 0, body, collider, cargo,
        previous: { ...body.translation() }, previousRotation: { ...body.rotation() }, yaw, hp: PORTER.hp,
        state: "waiting", phase: 0, wait: i * 0.8, distance: 0, transfers: 0, blocked: 0,
        alertUntil: 0, brakeUntil: 0, impactUntil: 0, settled: 0 });
    }
  }
  neutral(handle: number) { return this.porters.find(p => p.collider.handle === handle); }
  release(p: CivilianPorter) {
    if (p.grip) this.sim.world.removeImpulseJoint(p.grip, true);
    p.grip = undefined;
  }
  private attach(p: CivilianPorter) {
    const load = p.cargo.body.translation(), body = p.body.translation();
    // Only grasp a tote actually resting in reach; displaced cargo cannot teleport back.
    const hand = { x: body.x + Math.sin(p.yaw) * TOTE.reach, z: body.z + Math.cos(p.yaw) * TOTE.reach };
    if (distance2(load, hand) > 0.3 || Math.abs(load.y - 0.88) > 0.22) return false;
    const frame = { x: 0, y: 0, z: 0, w: 1 };
    // Preserve its current relative rotation when grasping, including small settling angles.
    const q = p.cargo.body.rotation(), s = Math.sin(-p.yaw / 2), c = Math.cos(-p.yaw / 2);
    const relative = { x: c * q.x + s * q.z, y: c * q.y + s * q.w, z: c * q.z - s * q.x, w: c * q.w - s * q.y };
    p.grip = this.sim.world.createImpulseJoint(RAPIER.JointData.fixed(
      { x: 0, y: load.y - body.y, z: TOTE.reach }, relative, { x: 0, y: 0, z: 0 }, frame), p.body, p.cargo.body, true);
    p.grip.setContactsEnabled(false);
    return true;
  }
  disturb(from: Vec3, to: Vec3 = from, duration = 8) {
    for (const p of this.porters) {
      const position = p.body.translation();
      if (!p.hp || p.impactUntil || (distance2(position, from) > 18 && lineDistance(position, from, to) > 4)) continue;
      if (p.alertUntil <= this.sim.time) {
        p.brakeUntil = this.sim.time + 0.7;
        // Stabilize any attached load before retreating along the same clear aisle.
        const options = p.route.points.map((point, index) => ({ point, index }))
          .filter(({ point }) => segmentClear(position, point, this.sim.layout.barriers.filter(b => b.h > 0.75), 0.4))
          .sort((a, b) => distance2(b.point, from) - distance2(a.point, from));
        if (options.length) p.next = options[0].index;
        p.phase = 0; p.wait = 0; p.state = "steady";
      }
      p.alertUntil = Math.max(p.alertUntil, this.sim.time + duration);
    }
  }
  damage(p: CivilianPorter, damage: number, impulse: Vec3, point: Vec3) {
    const alive = p.hp > 0;
    this.release(p);
    p.hp = Math.max(0, p.hp - damage); p.phase = 0; p.wait = 0; p.settled = 0;
    p.impactUntil = this.sim.time + 0.8;
    p.body.lockRotations(false, true); p.collider.setFriction(0.65);
    p.body.setAngularDamping(1.8); p.body.setLinearDamping(0.35);
    p.body.applyImpulseAtPoint(impulse, point, true);
    for (const [velocity, limit, angular] of [[p.body.linvel(), 12, false], [p.body.angvel(), 6, true]] as const) {
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
      if (speed <= limit) continue;
      const v = { x: velocity.x * limit / speed, y: velocity.y * limit / speed, z: velocity.z * limit / speed };
      if (angular) p.body.setAngvel(v, true); else p.body.setLinvel(v, true);
    }
    p.state = p.hp ? "tumbling" : "disabled";
    if (alive && !p.hp) this.sim.events.push({ type: "down", position: { ...p.body.translation() } });
  }
  blast(origin: Vec3) {
    for (const p of this.porters) {
      const at = p.body.translation(), distance = Math.hypot(at.x - origin.x, at.y - origin.y, at.z - origin.z);
      if (distance >= BLAST_RADIUS) continue;
      const exposed = [-0.25, 0.25].filter(dy => !this.sim.ray(origin, { ...at, y: at.y + dy }, p.body)).length;
      if (!exposed) continue;
      const falloff = (1 - distance / BLAST_RADIUS) * exposed / 2, strength = 720 * falloff;
      const dx = (at.x - origin.x) / Math.max(0.4, distance), dz = (at.z - origin.z) / Math.max(0.4, distance);
      this.damage(p, 160 * Math.sqrt(falloff), { x: dx * strength, y: strength * 0.65, z: dz * strength },
        { x: at.x - dx * 0.3, y: at.y - 0.2, z: at.z - dz * 0.3 });
    }
  }
  private recover(p: CivilianPorter) {
    const at = p.body.translation(), v = p.body.linvel(), q = p.body.rotation(), spin = p.body.angvel();
    const quiet = Math.hypot(v.x, v.y, v.z) < 0.35 && Math.hypot(spin.x, spin.y, spin.z) < 0.5;
    const dry = !this.district.water.some(w => inWater(at, w));
    const supported = quiet && dry && !!this.sim.ray(at, { ...at, y: at.y - PORTER.height / 2 - 0.2 }, p.body);
    p.settled = this.sim.time >= p.impactUntil && supported ? p.settled + STEP : 0;
    if (p.settled < 0.6) return false;
    if (1 - 2 * (q.x * q.x + q.z * q.z) < 0.9) { p.state = "stranded"; return false; }
    const reachable = p.route.points.map((point, index) => ({ point, index }))
      .filter(({ point }) => segmentClear(at, point, this.sim.layout.barriers, 0.28))
      .sort((a, b) => distance2(at, a.point) - distance2(at, b.point));
    if (!reachable.length) { p.state = "stranded"; return false; }
    p.next = reachable[0].index; p.impactUntil = 0;
    p.yaw = Math.atan2(2 * (q.w * q.y + q.x * q.z), 1 - 2 * (q.y * q.y + q.z * q.z));
    p.body.lockRotations(true, true); p.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    p.collider.setFriction(0.15); p.body.setLinearDamping(0.4); p.body.setAngularDamping(5);
    p.state = "travel";
    return true;
  }
  update() {
    for (const p of this.porters) {
      const at = p.body.translation(), velocity = p.body.linvel();
      p.previous = { ...at }; p.previousRotation = { ...p.body.rotation() };
      p.distance += Math.hypot(velocity.x, velocity.z) * STEP;
      if (!p.hp) continue;
      if (!p.impactUntil && this.district.water.some(w => inWater(at, w)))
        this.damage(p, 0, { x: 0, y: 0, z: 0 }, at);
      if (p.impactUntil && !this.recover(p)) continue;
      // A physical shove can move a waiting worker off its station. Its pause
      // must still expire so the drive can return it to the loading stand.
      p.wait = Math.max(0, p.wait - STEP);
      const alerted = p.alertUntil > this.sim.time;
      if (alerted && p.grip) p.grip.setAnchor1({ x: 0, y: TOTE.carryHeight, z: TOTE.reach });
      let target = p.route.points[p.next], distance = distance2(at, target);
      const working = p.state === "pickup" || p.state === "place";
      if (working && !alerted) {
        p.phase = Math.min(1, p.phase + STEP / PORTER.liftTime);
        const lift = p.state === "pickup" ? p.phase : 1 - p.phase;
        const smooth = lift * lift * (3 - 2 * lift);
        p.grip?.setAnchor1({ x: 0, y: (0.7 + TOTE.h / 2 - PORTER.height / 2) * (1 - smooth) + TOTE.carryHeight * smooth, z: TOTE.reach });
        if (p.phase >= 1) {
          if (p.state === "place") {
            this.release(p); p.cargoStation = p.next; p.transfers++; p.wait = 2;
            p.state = "waiting";
          } else { p.next = (p.next + 1) % p.route.points.length; p.state = "travel"; }
          p.phase = 0;
        }
      } else if (distance < 0.12 && !alerted) {
        const desired = target.station?.yaw ?? p.yaw;
        const turn = Math.atan2(Math.sin(desired - p.yaw), Math.cos(desired - p.yaw));
        if (!p.wait && Math.abs(turn) < 0.04) {
          if (p.grip) { p.state = "place"; p.phase = 0; }
          else if (p.cargoStation === p.next && this.attach(p)) { p.state = "pickup"; p.phase = 0; }
          else if (p.cargoStation !== p.next) { p.next = p.cargoStation; p.state = "travel"; }
          else { p.state = "waiting"; p.wait = 2; }
        }
      }
      target = p.route.points[p.next]; distance = distance2(at, target);
      const forward = { x: (target.x - at.x) / (distance || 1), z: (target.z - at.z) / (distance || 1) };
      const blockers = [
        ...this.sim.actors.map(a => ({ at: a.body.translation(), radius: 1.45 })),
        ...this.sim.city!.carts.map(c => ({ at: c.body.translation(), radius: 1.5 })),
        ...this.sim.city!.vehicles.map(c => ({ at: c.body.translation(), radius: 3.6 })),
        ...this.porters.filter(other => other !== p).map(other => ({ at: other.body.translation(), radius: 1.25 })),
        ...this.sim.props.filter(prop => prop !== p.cargo).map(prop => ({ at: prop.body.translation(), radius: Math.max(prop.w, prop.d) / 2 + 0.9 })),
      ];
      const obstructed = distance > 0.15 && blockers.some(b => Math.abs(b.at.y - at.y) < 1.5 &&
        distance2(at, b.at) < b.radius && (b.at.x - at.x) * forward.x + (b.at.z - at.z) * forward.z > 0.1);
      p.blocked = obstructed ? p.blocked + STEP : 0;
      if (p.blocked > 3) { p.next = (p.next + 1) % p.route.points.length; p.blocked = 0; }
      const stopped = working || p.state === "pickup" || p.state === "place" || p.wait > 0 || obstructed ||
        p.brakeUntil > this.sim.time || distance < 0.12;
      const desired = distance < 0.12 ? (target.station?.yaw ?? p.yaw) : Math.atan2(forward.x, forward.z);
      const turn = Math.atan2(Math.sin(desired - p.yaw), Math.cos(desired - p.yaw));
      p.yaw += clamp(turn, -STEP * PORTER.turnSpeed, STEP * PORTER.turnSpeed);
      p.body.setRotation({ x: 0, y: Math.sin(p.yaw / 2), z: 0, w: Math.cos(p.yaw / 2) }, true);
      if (alerted) p.state = p.brakeUntil > this.sim.time ? "steady" : "withdraw";
      else if (!working && p.state !== "pickup" && p.state !== "place" && p.state !== "waiting") p.state = obstructed ? "yield" : "travel";
      const speed = stopped ? 0 : Math.min(alerted ? PORTER.retreatSpeed : p.grip ? PORTER.loadedSpeed : PORTER.speed, distance * 3);
      const mass = PORTER.mass + (p.grip ? TOTE.mass : 0), facing = Math.max(0, Math.cos(turn));
      p.body.applyImpulse({ x: clamp(forward.x * speed * facing - velocity.x, -STEP * 3, STEP * 3) * mass,
        y: 0, z: clamp(forward.z * speed * facing - velocity.z, -STEP * 3, STEP * 3) * mass }, true);
    }
  }
  inspect() {
    return this.porters.map(p => ({ id: p.id, model: p.model, route: p.route.id, state: p.state, hp: p.hp,
      position: { ...p.body.translation() }, velocity: { ...p.body.linvel() }, yaw: p.yaw, carrying: !!p.grip,
      phase: p.phase, transfers: p.transfers, distance: p.distance,
      cargo: { id: p.cargo.id, position: { ...p.cargo.body.translation() }, velocity: { ...p.cargo.body.linvel() } } }));
  }
}
