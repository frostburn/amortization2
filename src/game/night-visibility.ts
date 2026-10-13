import { distance2, type Vec3 } from "./config";
import { berthLights } from "./night-port";
import { forestPoint } from "./night-forest";
import { VEHICLES } from "./traffic";
import type { Actor, Simulation } from "./simulation";

export type NightLight = { id: string; position: Vec3; target: Vec3; range: number; angle: number; color: number; intensity: number; shadow: boolean };
type Flash = { position: Vec3; until: number; range: number };

/** World-space optical rules, independent of camera, frame rate and graphics settings. */
export class NightVisibility {
  readonly visible = new Set<number>();
  private nextScan = 0;
  private actorKey = "";
  private actorHulls = new Set<number>();
  readonly flashes: Flash[] = [];
  constructor(private sim: Simulation) {}
  get lights(): NightLight[] {
    const t = this.sim.time * .22;
    const lights: NightLight[] = this.sim.range === "nightport" ? berthLights(!!this.sim.mission?.cargoReleased) : [
      { id: "clearing", position: forestPoint({ x: 8, z: -26 }, 7), target: forestPoint({ x: 12 + Math.sin(t) * 9, z: -8 + Math.cos(t) * 6 }), range: 45, angle: .65, color: 0xffd599, intensity: 650, shadow: true },
      { id: "receiving", position: forestPoint({ x: 35, z: 24 }, 6), target: forestPoint({ x: 37, z: 37 }), range: 30, angle: .8, color: 0xf9d6a3, intensity: 450, shadow: false },
    ];
    for (const c of this.sim.city?.vehicles ?? []) {
      if (!c.hp) continue;
      const p = c.body.translation(), front = VEHICLES[c.model].length / 2 + .25;
      const x = Math.sin(c.yaw), z = Math.cos(c.yaw);
      lights.push({ id: `vehicle-${c.id}`, position: { x: p.x + x * front, y: p.y + .2, z: p.z + z * front },
        target: { x: p.x + x * 20, y: this.sim.walkingHeight({x:p.x+x*20,z:p.z+z*20}), z: p.z + z * 20 }, range: 32, angle: .5,
        color: 0xd4e6ff, intensity: 400, shadow: false });
    }
    return lights;
  }
  flash(position: Vec3, seconds = .35, range = 18) {
    // Sustained automatic fire refreshes one nearby light instead of accumulating nodes.
    const existing = this.flashes.find(f => distance2(f.position, position) < 2);
    if (existing) { existing.position = { ...position }; existing.until = this.sim.time + seconds; existing.range = Math.max(range, existing.range); }
    else this.flashes.push({ position: { ...position }, until: this.sim.time + seconds, range });
    this.nextScan = 0;
  }
  private unblocked(from: Vec3, to: Vec3) {
    const handles = this.sim.actors.map(a => a.collider.handle), key = handles.join(",");
    if (key !== this.actorKey) {
      this.actorKey = key;
      this.actorHulls = new Set(handles);
    }
    // Ignore sensor owners and the contacted chassis; vehicles, cargo and world
    // geometry still occlude both light exposure and optical contacts.
    return !this.sim.ray(from, to, undefined, c => !this.actorHulls.has(c.handle));
  }
  illuminated(point: Vec3, lights = this.lights) {
    if (this.flashes.some(f => f.until > this.sim.time && Math.hypot(point.x - f.position.x, point.y - f.position.y, point.z - f.position.z) < f.range && this.unblocked(f.position, point))) return true;
    return lights.some(l => {
      const dx = point.x - l.position.x, dy = point.y - l.position.y, dz = point.z - l.position.z;
      const distance = Math.hypot(dx, dy, dz);
      const tx = l.target.x - l.position.x, ty = l.target.y - l.position.y, tz = l.target.z - l.position.z;
      return distance < l.range && (dx * tx + dy * ty + dz * tz) / (distance * Math.hypot(tx, ty, tz) || 1) > Math.cos(l.angle) && this.unblocked(l.position, point);
    });
  }
  canSee(observer: Actor, target: Actor, lights = this.lights) {
    if (observer.dead || target.dead) return false;
    const p = observer.body.translation(), q = target.body.translation();
    const distance = Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
    if (distance > 52 || distance > 18 && !this.illuminated({ ...q, y: q.y + (target.flight ? 0 : .45) }, lights)) return false;
    const from = { ...p, y: p.y + (observer.flight ? 0 : .65) };
    return (target.flight ? [0] : [.25, .75]).some(height => this.unblocked(from, { ...q, y: q.y + height }));
  }
  update() {
    for (let i = this.flashes.length - 1; i >= 0; i--) if (this.flashes[i].until <= this.sim.time) this.flashes.splice(i, 1);
    if (this.sim.time < this.nextScan) return;
    this.nextScan = this.sim.time + .15;
    this.visible.clear();
    const lights = this.lights, squad = this.sim.squad.filter(a => !a.dead);
    for (const enemy of this.sim.actors) if (enemy.kind === "enemy" && !enemy.dead && squad.some(a => this.canSee(a, enemy, lights))) this.visible.add(enemy.id);
  }
}
