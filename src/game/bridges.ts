import RAPIER from "@dimforge/rapier3d-compat";
import { STEP, distance2, type Vec2, type Vec3 } from "./config";
import type { Actor, Simulation } from "./simulation";

export type BridgeSpec = Vec2 & { length: number; width: number; bank: number; clearance: number;
  capacity: number; overloadSeconds: number };
type Transit = { actor: Actor; goal: Vec2; route: Vec2[]; waiting: Vec2; direction: number; state: "waiting" | "crossing" };

/** One weight-bearing hull at a time. Normal movement queues on dry banks;
 * physical overloads still buckle and remove the deck. No teleport or A* per tick. */
export class SingleLoadBridge {
  readonly deck: RAPIER.RigidBody;
  load = 0;
  overload = 0;
  collapsed = false;
  private transits = new Map<number, Transit>();
  private admitted: number | null = null;
  constructor(private sim: Simulation, readonly spec: BridgeSpec) {
    this.deck = sim.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(spec.x, -0.12, spec.z));
    sim.world.createCollider(RAPIER.ColliderDesc.cuboid(spec.length / 2, 0.12, spec.width / 2).setFriction(0.8), this.deck);
  }
  onDeck(p: { x: number; y: number; z: number }) {
    return Math.abs(p.x - this.spec.x) < this.spec.length / 2 &&
      Math.abs(p.z - this.spec.z) < this.spec.width / 2 + 0.3 && p.y > -0.2 && p.y < 2.2;
  }
  side(p: Vec2) { return p.x > this.spec.x + this.spec.clearance ? 1 : p.x < this.spec.x - this.spec.clearance ? -1 : 0; }
  /** Actual shore, excluding the deck; queue release uses a larger margin. */
  shore(p: Vec3) {
    if (this.onDeck(p)) return 0;
    return p.x > this.spec.x + this.spec.bank ? 1 : p.x < this.spec.x - this.spec.bank ? -1 : 0;
  }
  cancel(actor: Actor) {
    this.transits.delete(actor.id);
    if (this.admitted === actor.id && !this.onDeck(actor.body.translation())) this.admitted = null;
  }
  route(actor: Actor, route: Vec2[], queue: boolean) {
    const previous = this.transits.get(actor.id);
    if (queue && previous) {
      previous.route.push(...route);
      previous.goal = { ...route.at(-1)! };
      actor.moveTarget = { ...previous.goal };
      if (previous.state === "crossing") actor.path.push(...route);
      return true;
    }
    if (previous?.state === "crossing" && route.length &&
        (this.onDeck(actor.body.translation()) || Math.sign(route.at(-1)!.x - this.spec.x) === previous.direction)) {
      previous.route = route.map(p => ({ ...p }));
      previous.goal = { ...route.at(-1)! };
      previous.direction = Math.sign(previous.goal.x - this.spec.x) || previous.direction;
      actor.path = route;
      actor.moveTarget = { ...previous.goal };
      return true;
    }
    this.cancel(actor);
    if (!route.length || this.collapsed) return false;
    const p = actor.body.translation(), goal = route.at(-1)!;
    const startSide = Math.sign(p.x - this.spec.x);
    const direction = -startSide;
    const sameBank = Math.abs(goal.x - this.spec.x) >= this.spec.bank && Math.sign(goal.x - this.spec.x) === startSide;
    if (this.onDeck(p) || Math.abs(p.x - this.spec.x) < this.spec.bank || sameBank) return false;
    // Stable lanes outside the narrow mouth keep queued squad members from
    // blocking the granted robot. The final requested formation stays visible.
    const waiting = { x: this.spec.x - direction * (this.spec.clearance + 1),
      z: this.spec.z + ((actor.id - 1) % 4 - 1.5) * 2.1 };
    this.transits.set(actor.id, { actor, goal: { ...goal }, route: route.map(p => ({ ...p })), waiting, direction, state: "waiting" });
    this.sim.navigate(actor, waiting, false, true);
    actor.moveTarget = { ...goal };
    return true;
  }
  update() {
    if (this.collapsed) return;
    // A queued return can become the next leg after its far-bank waypoint.
    // Admit it through the same bank queue when that leg reaches the mouth.
    for (const actor of this.sim.actors) {
      if (actor.dead || actor.flight || this.transits.has(actor.id) || !actor.path.length || this.side(actor.body.translation()) === 0) continue;
      const first = actor.path[0], p = actor.body.translation();
      if (Math.abs(first.x - this.spec.x) <= this.spec.clearance || Math.sign(first.x - this.spec.x) !== Math.sign(p.x - this.spec.x))
        this.route(actor, actor.path.map(p => ({ ...p })), false);
    }
    const hulls = [...this.sim.actors.filter(a => !a.flight).map(a => a.body), ...this.sim.props.map(p => p.body),
      ...(this.sim.city?.carts ?? []).map(c => c.body), ...(this.sim.city?.porters ?? []).map(p => p.body),
      ...(this.sim.city?.vehicles ?? []).map(c => c.body)];
    this.load = hulls.filter(body => this.onDeck(body.translation())).reduce((load, body) => load + body.mass(), 0);
    this.overload = this.load > this.spec.capacity ? this.overload + STEP : Math.max(0, this.overload - STEP * 2);
    if (this.overload >= this.spec.overloadSeconds) {
      this.collapsed = true;
      this.sim.world.removeRigidBody(this.deck);
      this.sim.events.push({ type: "bridge", phase: "collapse", position: { ...this.spec, y: 0 } });
      return;
    }
    for (const [id, transit] of this.transits) {
      const { actor, direction, state } = transit;
      if (actor.dead || state === "crossing" && this.side(actor.body.translation()) === direction) {
        this.transits.delete(id);
        if (this.admitted === id) this.admitted = null;
      }
    }
    if (this.admitted !== null) {
      const actor = this.sim.actors.find(a => a.id === this.admitted);
      if (!this.transits.has(this.admitted) && (!actor || !this.onDeck(actor.body.translation()))) this.admitted = null;
    }
    if (this.admitted === null && this.load < 1) {
      const next = [...this.transits.values()].find(t => t.state === "waiting" && !t.actor.braced &&
        !this.sim.isDisrupted(t.actor) && distance2(t.actor.body.translation(), t.waiting) < 0.35);
      if (next) {
        this.admitted = next.actor.id;
        next.state = "crossing";
        this.sim.navigate(next.actor, next.route[0], false, true);
        next.actor.path.push(...next.route.slice(1));
        next.actor.moveTarget = { ...next.goal };
      }
    }
  }
  /** Waiting robots hold their bank slot rather than replanning to the far goal. */
  waitingGoal(actor: Actor) {
    const transit = this.transits.get(actor.id);
    return transit?.state === "waiting" ? transit.waiting : null;
  }
  queuedGoal(actor: Actor) { return this.transits.get(actor.id)?.goal; }
  inspect() {
    return { capacity: this.spec.capacity, load: this.load, overload: this.overload / this.spec.overloadSeconds,
      collapsed: this.collapsed, admitted: this.admitted,
      queue: [...this.transits.values()].map(t => ({ actor: t.actor.id, state: t.state, waiting: { ...t.waiting }, goal: { ...t.goal } })) };
  }
}
