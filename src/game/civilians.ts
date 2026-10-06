import RAPIER from "@dimforge/rapier3d-compat";
import { BLAST_RADIUS, STEP, clamp, distance2, type Vec2, type Vec3 } from "./config";
import { buildingSolid, type CartRoute, type CityDistrict } from "./city";
import type { Simulation } from "./simulation";

export const CART = { width: 0.82, length: 0.94, height: 0.62, mass: 35, hp: 36, speed: 1.6 };
export type CartState = "travel" | "delivery" | "yield" | "alert" | "disabled";
export type CivilianCart = {
  id: number;
  route: CartRoute;
  next: number;
  direction: number;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  previous: Vec3;
  previousRotation: { x: number; y: number; z: number; w: number };
  yaw: number;
  hp: number;
  state: CartState;
  wait: number;
  blocked: number;
  alertUntil: number;
  brakeUntil: number;
  distance: number;
  deliveries: number;
};

function lineDistance(p: Vec2, a: Vec2, b: Vec2) {
  const dx = b.x - a.x, dz = b.z - a.z;
  const t = clamp(((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return distance2(p, { x: a.x + dx * t, z: a.z + dz * t });
}

/** Local civilian activity. No weapons, squad membership, enemy scoring or arena AI. */
export class CityLife {
  carts: CivilianCart[] = [];
  closedUntil = new Map<string, number>();
  constructor(private sim: Simulation, public district: CityDistrict) {
    let id = 1000;
    for (const route of district.routes) {
      const lengths = route.points.map((p, i) => distance2(p, route.points[(i + 1) % route.points.length]));
      const total = lengths.reduce((sum, d) => sum + d, 0);
      for (let i = 0; i < route.count; i++) {
        let distance = total * (i + 0.28) / route.count, segment = 0;
        while (distance > lengths[segment]) distance -= lengths[segment++];
        const a = route.points[segment], next = (segment + 1) % route.points.length, b = route.points[next];
        const t = distance / lengths[segment], x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
        const yaw = Math.atan2(b.x - a.x, b.z - a.z);
        const body = sim.world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(x, CART.height / 2 + 0.01, z).lockRotations()
          .setLinearDamping(0.4).setAngularDamping(5).setCcdEnabled(true));
        body.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true);
        const collider = sim.world.createCollider(RAPIER.ColliderDesc.cuboid(CART.width / 2, CART.height / 2, CART.length / 2)
          .setMass(CART.mass).setFriction(0.1).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min).setRestitution(0.02), body);
        this.carts.push({ id: id++, route, next, direction: 1, body, collider,
          previous: { ...body.translation() }, previousRotation: { ...body.rotation() }, yaw,
          hp: CART.hp, state: "travel", wait: 0, blocked: 0, alertUntil: 0, brakeUntil: 0,
          distance: 0, deliveries: 0 });
      }
    }
  }

  get crossing() { return Math.floor(this.sim.time / 10) % 2; }
  isClosed(id: string) { return (this.closedUntil.get(id) ?? 0) > this.sim.time; }
  private advance(c: CivilianCart) {
    c.next = (c.next + c.direction + c.route.points.length) % c.route.points.length;
  }
  private reverse(c: CivilianCart) {
    c.direction *= -1;
    this.advance(c);
  }

  disturb(from: Vec3, to: Vec3 = from, duration = 8) {
    for (const c of this.carts) {
      const p = c.body.translation();
      if (c.hp <= 0 || (distance2(p, from) > 18 && lineDistance(p, from, to) > 4)) continue;
      if (c.alertUntil <= this.sim.time) {
        // Choose between the two directions on its known delivery route.
        const before = c.route.points[(c.next - c.direction + c.route.points.length) % c.route.points.length];
        if (distance2(before, from) > distance2(c.route.points[c.next], from)) this.reverse(c);
        c.brakeUntil = this.sim.time + 0.65;
      }
      c.alertUntil = this.sim.time + duration;
      c.wait = 0;
      c.state = "alert";
    }
    for (const b of this.district.buildings) {
      if (b.backdrop || b.prefab !== "shop") continue;
      const solid = buildingSolid(b);
      const near = { x: clamp(from.x, b.x - solid.w / 2, b.x + solid.w / 2),
        z: clamp(from.z, b.z - solid.d / 2, b.z + solid.d / 2) };
      if (distance2(near, from) < 18 || lineDistance(near, from, to) < 8)
        this.closedUntil.set(b.id, this.sim.time + duration + 2);
    }
  }

  damage(c: CivilianCart, damage: number, impulse: Vec3, point: Vec3) {
    if (c.hp <= 0) return;
    c.hp = Math.max(0, c.hp - damage);
    c.body.applyImpulseAtPoint(impulse, point, true);
    this.disturb(point);
    if (!c.hp) {
      c.state = "disabled";
      c.body.lockRotations(false, true);
      c.collider.setFriction(0.65);
      c.body.setLinearDamping(2);
      c.body.setAngularDamping(4);
      this.sim.events.push({ type: "down", position: { ...c.body.translation() } });
    }
  }

  blast(origin: Vec3) {
    this.disturb(origin, origin, 12);
    for (const c of this.carts) {
      const p = c.body.translation(), distance = Math.hypot(p.x - origin.x, p.y - origin.y, p.z - origin.z);
      if (!c.hp || distance >= BLAST_RADIUS) continue;
      const samples = [-0.18, 0.18].filter(dy => !this.sim.ray(origin, { x: p.x, y: p.y + dy, z: p.z }, c.body));
      if (!samples.length) continue;
      const falloff = (1 - distance / BLAST_RADIUS) * samples.length / 2, strength = 160 * falloff;
      this.damage(c, 160 * Math.sqrt(falloff), {
        x: (p.x - origin.x) / Math.max(0.4, distance) * strength,
        y: strength * 0.18, z: (p.z - origin.z) / Math.max(0.4, distance) * strength,
      }, p);
    }
  }

  update() {
    for (const c of this.carts) {
      const p = c.body.translation(), velocity = c.body.linvel();
      c.previous = { ...p }; c.previousRotation = { ...c.body.rotation() };
      c.distance += Math.hypot(velocity.x, velocity.z) * STEP;
      if (!c.hp) continue;
      c.wait = Math.max(0, c.wait - STEP);
      const alerted = c.alertUntil > this.sim.time;
      const target = c.route.points[c.next];
      let dx = target.x - p.x, dz = target.z - p.z, distance = Math.hypot(dx, dz);
      if (distance < 0.3 && !c.wait) {
        if (target.stop && !alerted && (!target.building || !this.isClosed(target.building))) {
          c.wait = target.stop;
          c.deliveries++;
        }
        this.advance(c);
        const next = c.route.points[c.next]; dx = next.x - p.x; dz = next.z - p.z; distance = Math.hypot(dx, dz);
      }
      const forward = { x: dx / (distance || 1), z: dz / (distance || 1) };
      const signal = this.district.junctions.some(junction => {
        const x = p.x - junction.x, z = p.z - junction.z;
        const crossingX = Math.abs(z) >= 7 && Math.abs(z) <= 11 && Math.abs(x) >= 6.5 && Math.abs(x) < 8.5 && x * forward.x < -0.5;
        const crossingZ = Math.abs(x) >= 7 && Math.abs(x) <= 11 && Math.abs(z) >= 6.5 && Math.abs(z) < 8.5 && z * forward.z < -0.5;
        return crossingX ? this.crossing !== 0 : crossingZ ? this.crossing !== 1 : false;
      });
      const obstacles = [
        ...this.sim.actors.map(a => ({ id: -a.id, p: a.body.translation(), radius: 1.45, cart: false })),
        ...this.sim.props.map(a => ({ id: -a.id, p: a.body.translation(), radius: Math.max(a.w, a.d) / 2 + 0.8, cart: false })),
        ...this.carts.filter(other => other !== c).map(other => ({ id: other.id, p: other.body.translation(), radius: 1.25, cart: true })),
      ];
      const obstacle = obstacles.find(other => {
        const ox = other.p.x - p.x, oz = other.p.z - p.z;
        if (Math.hypot(ox, oz) >= other.radius || ox * forward.x + oz * forward.z <= 0.05) return false;
        if (!other.cart) return true;
        const cart = this.carts.find(o => o.id === other.id)!;
        const sameDirection = Math.sin(cart.yaw) * forward.x + Math.cos(cart.yaw) * forward.z > 0.5;
        return !cart.hp || sameDirection || c.id > cart.id;
      });
      c.blocked = obstacle ? c.blocked + STEP : 0;
      if (c.blocked > 2.5 && !signal) { this.reverse(c); c.blocked = 0; }
      const stopped = !!obstacle || signal || c.wait > 0 || c.brakeUntil > this.sim.time;
      c.state = alerted ? "alert" : c.wait > 0 ? "delivery" : stopped ? "yield" : "travel";
      const speed = stopped ? 0 : Math.min(CART.speed, distance * 2.5);
      const desired = Math.atan2(forward.x, forward.z);
      const turn = Math.atan2(Math.sin(desired - c.yaw), Math.cos(desired - c.yaw));
      c.yaw += clamp(turn, -STEP * 2.6, STEP * 2.6);
      c.body.setRotation({ x: 0, y: Math.sin(c.yaw / 2), z: 0, w: Math.cos(c.yaw / 2) }, true);
      // Limited motor force preserves collision impulses rather than teleporting a cart.
      const facing = Math.max(0, Math.cos(turn));
      c.body.applyImpulse({ x: clamp(forward.x * speed * facing - velocity.x, -STEP * 4, STEP * 4) * CART.mass,
        y: 0, z: clamp(forward.z * speed * facing - velocity.z, -STEP * 4, STEP * 4) * CART.mass }, true);
    }
  }

  inspect() {
    return { crossing: this.crossing,
      closedShops: this.district.buildings.filter(b => this.isClosed(b.id)).map(b => b.id),
      carts: this.carts.map(c => ({ id: c.id, model: "CART", route: c.route.id, state: c.state,
        hp: c.hp, yaw: c.yaw, deliveries: c.deliveries, distance: c.distance,
        position: { ...c.body.translation() }, velocity: { ...c.body.linvel() }, alertUntil: c.alertUntil,
        destination: { ...c.route.points[c.next] } })) };
  }
}
