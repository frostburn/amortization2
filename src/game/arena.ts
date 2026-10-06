import { PISTOL, RIFLE, ROBOT_MODELS, STEP, clamp, distance2, type Vec2, type Vec3 } from "./config";
import { ARENA_ENTRIES } from "./ranges";
import { segmentClear } from "./navigation";
import type { Actor, Simulation } from "./simulation";

export type EnemyBrain = {
  squad: number;
  gate: string;
  rally: Vec2;
  flank: number;
  target: number | null;
  aim: Vec3;
  state: "entering" | "advancing" | "aiming" | "firing" | "suppressed" | "reloading";
  nextThink: number;
  nextRoute: number;
  nextAttack: number;
  nextGrenade: number;
  burstUntil: number;
  visible: boolean;
  fire: boolean;
};

/** Wave timing and enemy intentions; all shots, impacts and movement use the simulation. */
export class ArenaCombat {
  wave = 0;
  cleared = 0;
  kills = 0;
  enemyShots = 0;
  phase: "incoming" | "active" | "intermission" | "defeat" = "incoming";
  countdown = 4;
  entries = [0];

  constructor(private sim: Simulation) {}

  get enemies() {
    return this.sim.actors.filter((a) => a.kind === "enemy" && !a.dead);
  }
  get nextCount() {
    return Math.min(12, this.wave + 3);
  }

  update() {
    const sim = this.sim;
    // Endless play must not accumulate physics bodies or GPU models indefinitely.
    for (const a of [...sim.actors])
      if (a.kind === "enemy" && a.dead && sim.time - a.deathTime! > 8)
        sim.retireEnemy(a);
    if (this.phase === "defeat") return;
    const living = sim.squad.filter((a) => !a.dead);
    if (!living.length) {
      this.phase = "defeat";
      this.countdown = 0;
      sim.release();
      for (const a of this.enemies) {
        a.ai!.fire = a.firing = false;
        a.path = [];
        a.moveTarget = undefined;
        a.braced = true;
      }
      sim.events.push({ type: "wave", message: `Squad lost on wave ${this.wave}. Shift+R restarts the arena.` });
      return;
    }
    if (this.phase === "active" && !this.enemies.length && !sim.grenades.length) {
      this.cleared = this.wave;
      this.phase = "intermission";
      this.countdown = 6;
      sim.trigger = false;
      for (const a of living) {
        a.hp = a.maxHp;
        a.ammo = sim.magazine(a, a.model ? ROBOT_MODELS[a.model].weapon : "gun");
        a.pistol.ammo = a.model === "sniper" ? PISTOL.magazine : 0;
        a.reload = a.pistol.reload = a.grenadeCooldown = a.recoil = 0;
        a.stability = 1;
        a.firing = false;
      }
      this.planEntries(living);
      sim.events.push({ type: "wave", message: `Wave ${this.wave} cleared. Surviving robots repaired and rearmed.` });
    }
    if (this.phase !== "active") {
      this.countdown = Math.max(0, this.countdown - STEP);
      if (this.countdown === 0) this.startWave();
    }
    if (this.phase === "active")
      for (const a of this.enemies) this.updateEnemy(a, living);
  }

  private planEntries(living: Actor[]) {
    const squads = Math.ceil(this.nextCount / 4);
    const gates = ARENA_ENTRIES.map((entry, i) => ({
      index: i,
      distance: Math.min(...living.map((a) => distance2(entry, a.body.translation()))),
      order: (i - this.wave % 4 + 4) % 4,
    })).sort((a, b) => a.order - b.order);
    const safe = gates.filter((g) => g.distance >= 12);
    this.entries = (safe.length >= squads ? safe : gates.sort((a, b) => b.distance - a.distance))
      .slice(0, squads).map((g) => g.index);
  }

  private startWave() {
    for (const actor of [...this.sim.actors])
      if (actor.kind === "enemy" && actor.dead) this.sim.retireEnemy(actor);
    const count = this.nextCount;
    this.wave++;
    this.phase = "active";
    for (let i = 0; i < count; i++) {
      const squad = Math.floor(i / 4), slot = i % 4;
      const gate = ARENA_ENTRIES[this.entries[squad]];
      const side = slot % 2 === 0 ? -1.1 : 1.1;
      const depth = Math.floor(slot / 2) * 1.9;
      const position = {
        x: gate.x + gate.dz * side + gate.dx * depth,
        z: gate.z - gate.dx * side + gate.dz * depth,
      };
      // Keep an announced entrance even if the player approaches it during the warning.
      // Try adjacent entrance slots rather than materialising inside another chassis.
      const candidates = [depth, depth + 1.9, depth + 3.8, depth + 5.7].flatMap((row) =>
        [side, -side, -3.3, 3.3].map((offset) => ({
          x: gate.x + gate.dz * offset + gate.dx * row,
          z: gate.z - gate.dx * offset + gate.dz * row,
        })));
      const spawn = candidates.find((p) => this.sim.actors.every((other) =>
        distance2(p, other.body.translation()) > (other.dead ? 1.5 : 1.2))) ?? position;
      const a = this.sim.addEnemy(this.wave >= 3 && slot === 3 ? "sniper" : "assault", spawn);
      a.yaw = Math.atan2(gate.dx, gate.dz);
      a.ai = {
        squad, gate: gate.name,
        rally: { x: spawn.x + gate.dx * 6, z: spawn.z + gate.dz * 6 },
        flank: [-0.45, 0.45, -0.15, 0.15][slot],
        target: null, aim: { x: 0, y: 1.25, z: 9 }, state: "entering",
        nextThink: this.sim.time + slot * 0.04, nextRoute: 0,
        nextAttack: this.sim.time + 1, nextGrenade: this.sim.time + 6,
        burstUntil: 0, visible: false, fire: false,
      };
      this.sim.navigate(a, a.ai.rally);
      a.ai.rally = a.moveTarget ?? spawn;
    }
    this.sim.events.push({ type: "wave", message: `Wave ${this.wave}: ${count} robots entering from ${this.entries.map((i) => ARENA_ENTRIES[i].name.toLowerCase()).join(" / ")}.` });
  }

  private updateEnemy(a: Actor, living: Actor[]) {
    const sim = this.sim, brain = a.ai!, now = sim.time;
    brain.fire = false;
    if (brain.state === "entering") {
      if (distance2(a.body.translation(), brain.rally) > 0.7) return;
      brain.state = "advancing";
      brain.nextAttack = Math.max(brain.nextAttack, now + 0.8);
    }
    if (now >= brain.nextThink) {
      brain.nextThink = now + 0.15;
      const p = a.body.translation();
      const target = living.reduce((best, candidate) => {
        const score = (actor: Actor) => distance2(p, actor.body.translation()) - (actor.id === brain.target ? 2 : 0);
        return score(candidate) < score(best) ? candidate : best;
      });
      if (brain.target !== target.id) {
        brain.target = target.id;
        brain.nextAttack = Math.max(brain.nextAttack, now + (a.model === "sniper" ? 1.3 : 0.7));
        brain.burstUntil = 0;
      }
      const q = target.body.translation();
      brain.aim = { x: q.x, y: q.y + 0.25, z: q.z };
      const distance = distance2(p, q);
      if (a.model === "sniper") {
        const weapon = distance < 12 ? "pistol" : distance > 16 ? "rifle" : a.weapon;
        if (weapon !== a.weapon) {
          a.weapon = weapon;
          a.braceTime = 0;
          brain.nextAttack = Math.max(brain.nextAttack, now + 0.7);
        }
      }
      brain.visible = false;
      // Low cover can expose a chassis's upper body; tall cover still needs a flank.
      for (const height of [0.25, 0.7]) {
        const aim = { x: q.x, y: q.y + height, z: q.z };
        if (sim.fireRay(a, sim.muzzle(a, aim), aim)?.collider.handle === target.collider.handle) {
          brain.aim = aim;
          brain.visible = true;
          break;
        }
      }
      const state = sim.ammunition(a);
      const suppressed = a.stability < 0.55 || now - a.hitTime < 0.25;
      if (this.wave >= 4 && !suppressed && a.model === "assault" &&
          now >= brain.nextGrenade && distance > 10 && distance < 24 &&
          !sim.grenades.some((g) => g.team === "enemy") &&
          living.filter((other) => distance2(q, other.body.translation()) < 4).length >= 2 &&
          this.enemies.every((other) => distance2(q, other.body.translation()) > 8)) {
        if (sim.throwGrenade(q, a)) {
          brain.nextGrenade = now + 8;
          brain.nextAttack = now + 0.8;
          brain.burstUntil = 0;
        }
      }
      if (suppressed || state.reload > 0) {
        brain.state = suppressed ? "suppressed" : "reloading";
        brain.burstUntil = 0;
        brain.nextAttack = Math.max(brain.nextAttack, now + 0.5);
      } else if (brain.visible && distance < (a.weapon === "rifle" ? 80 : a.weapon === "pistol" ? 24 : 25)) {
        a.braced = true;
        a.path = [];
        a.moveTarget = undefined;
        brain.state = "aiming";
      } else {
        a.braced = false;
        a.braceTime = 0;
        brain.state = "advancing";
        brain.burstUntil = 0;
        brain.nextAttack = Math.max(brain.nextAttack, now + 0.55);
        if (now >= brain.nextRoute) {
          brain.nextRoute = now + 1.2;
          sim.navigate(a, this.firingPosition(a, target));
        }
      }
    }
    const state = sim.ammunition(a);
    if (brain.state === "aiming" && now >= brain.nextAttack &&
        a.braceTime >= (a.weapon === "rifle" ? RIFLE.settle : 0.15)) {
      brain.burstUntil = now + (a.weapon === "gun" ? 0.22 + Math.min(this.wave, 10) * 0.01 : 0.06);
      brain.nextAttack = now + (a.weapon === "rifle" ? 2.4 : Math.max(0.8, 1.6 - this.wave * 0.04));
    }
    brain.fire = brain.visible && now < brain.burstUntil && brain.state !== "suppressed" && state.reload === 0;
    if (brain.fire) brain.state = "firing";
    if (state.ammo === 0) sim.reloadActor(a);
  }

  private firingPosition(a: Actor, target: Actor): Vec2 {
    const p = a.body.translation(), q = target.body.translation();
    const bearing = Math.atan2(p.x - q.x, p.z - q.z);
    const radius = a.weapon === "rifle" ? 35 : a.weapon === "pistol" ? 12 : 17;
    const b = this.sim.layout.bounds;
    const solids = [...this.sim.layout.barriers, ...this.sim.layout.platforms,
      ...this.sim.props.map((prop) => ({ x: prop.body.translation().x, z: prop.body.translation().z, w: prop.w, d: prop.d }))];
    let best = { x: q.x, z: q.z }, bestScore = Infinity;
    for (const offset of [0, 0.65, -0.65, 1.2, -1.2, 1.8, -1.8]) {
      const angle = bearing + a.ai!.flank + offset;
      const goal = { x: clamp(q.x + Math.sin(angle) * radius, b.left + 1, b.right - 1),
        z: clamp(q.z + Math.cos(angle) * radius, b.back + 1, b.front - 1) };
      if (!segmentClear(goal, goal, solids, 0.6)) continue;
      const hit = this.sim.fireRay(a, { ...goal, y: 1.4 }, { ...q, y: q.y + 0.25 });
      const visible = hit?.collider.handle === target.collider.handle;
      const score = distance2(p, goal) + Math.abs(offset) * 2 + (visible ? 0 : 18);
      if (score < bestScore) { bestScore = score; best = goal; }
    }
    return best;
  }

  inspect() {
    return { wave: this.wave, cleared: this.cleared, phase: this.phase,
      countdown: this.countdown, enemies: this.enemies.length,
      kills: this.kills, enemyShots: this.enemyShots,
      nextCount: this.nextCount, entries: this.entries.map((i) => ARENA_ENTRIES[i].name),
      maxWaveRobots: 12 };
  }
}
