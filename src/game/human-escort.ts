import { HUMAN, STEP, distance2, type Vec2 } from "./config";
import type { Actor, Simulation } from "./simulation";

/** A vulnerable person follows one living guide; the other hands can cover. */
export class HumanEscort {
  state: "captive" | "following" | "waiting" = "captive";
  guide?: number;
  walkTime = 0;
  rescuedAt?: number;
  private nextRoute = 0;
  constructor(private sim: Simulation, readonly human: Actor) {}
  get leader() { return this.sim.squad.find(a => a.id === this.guide && !a.dead); }
  rescue(guide: Actor) {
    if (this.state !== "captive" || guide.dead || this.human.dead) return;
    this.rescuedAt = this.sim.time;
    this.follow(guide);
  }
  private follow(guide: Actor) {
    this.guide = guide.id;
    this.state = "following";
    this.nextRoute = 0;
  }
  private halt() { this.human.path = []; this.human.moveTarget = undefined; }
  /** Clicking/H toggles the selected guide, or hands Quill to another robot. */
  command() {
    if (this.sim.mission?.stopped) return null;
    if (this.state === "captive") return "Clear the office and reach Quill first.";
    if (this.human.dead) return null;
    const candidates = this.sim.active.slice().sort((a, b) =>
      distance2(a.body.translation(), this.human.body.translation()) - distance2(b.body.translation(), this.human.body.translation()));
    if (!candidates.length) return "Select a living robot to guide Quill.";
    this.sim.onInput?.({ type: "escort" });
    if (this.state === "following" && candidates.some(a => a.id === this.guide)) {
      this.state = "waiting"; this.halt();
    } else this.follow(candidates[0]);
    return null;
  }
  /** The guide waits for a straggler instead of abandoning a person at a corner. */
  movementSpeed(a: Actor): number | undefined {
    if (a === this.human) return HUMAN.walkSpeed;
    if (this.state !== "following" || a.id !== this.guide || this.human.dead) return;
    const gap = distance2(a.body.translation(), this.human.body.translation());
    return gap > 4 ? 0 : gap > 2.8 ? .8 : HUMAN.walkSpeed;
  }
  update() {
    const a = this.human;
    if (a.dead) return;
    const speed = Math.hypot(a.body.linvel().x, a.body.linvel().z);
    this.walkTime += STEP * Math.min(2.5, speed / .58);
    const guide = this.leader;
    if (this.state === "following" && !guide) {
      this.state = "waiting"; this.guide = undefined; this.halt();
      this.sim.events.push({ type: "comms", speaker: "vale", message: "Quill's guide is down. Select another robot and click Quill, or press H, to bring him along." });
    }
    if (this.state === "following" && guide) {
      const p = a.body.translation(), q = guide.body.translation();
      const v = guide.body.linvel(), moving = Math.hypot(v.x, v.z) > .2;
      const heading = moving ? v : guide.path[0] ? { x: guide.path[0].x - q.x, z: guide.path[0].z - q.z }
        : { x: p.x - q.x, z: p.z - q.z };
      const length = Math.hypot(heading.x, heading.z) || 1;
      const goal: Vec2 = moving || guide.path.length
        ? { x: q.x - heading.x / length * 1.6, z: q.z - heading.z / length * 1.6 }
        : { x: q.x + heading.x / length * 1.6, z: q.z + heading.z / length * 1.6 };
      if (distance2(p, goal) < .35 || !moving && !guide.path.length && distance2(p, q) < 2.2) this.halt();
      else if (this.sim.time >= this.nextRoute && (!a.moveTarget || distance2(goal, a.moveTarget) > .65 || !a.path.length)) {
        this.nextRoute = this.sim.time + .65;
        this.sim.navigate(a, goal);
      }
    } else this.halt();
  }
  get pose() { return this.human.dead || Math.hypot(this.human.body.linvel().x, this.human.body.linvel().z) < .15 ? "standing" : "walking"; }
  inspect() {
    return { id: this.human.id, name: "Ren Quill", state: this.state, guide: this.guide ?? null,
      hp: this.human.hp, maxHp: this.human.maxHp, dead: this.human.dead,
      position: { ...this.human.body.translation() }, pose: this.pose,
      walkTime: this.walkTime, rescuedAt: this.rescuedAt };
  }
}
