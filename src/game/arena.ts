import { ENEMY_BRACE_WAVE, PISTOL, ROBOT_MODELS, STEP, distance2 } from "./config";
import { ARENA_ENTRIES } from "./ranges";
import { updateEnemy } from "./enemies";
import type { Actor, Simulation } from "./simulation";

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
        a.braced = this.wave >= ENEMY_BRACE_WAVE;
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
        a.stagger = a.staggerDuration = a.staggerGrace = 0;
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
      for (const a of this.enemies) updateEnemy(sim, a, living, {
        brace: this.wave >= ENEMY_BRACE_WAVE,
        grenades: this.wave >= 4,
        automaticBurst: 0.22 + Math.min(this.wave, 10) * 0.01,
        attackInterval: Math.max(0.8, 1.6 - this.wave * 0.04),
      });
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
        entryUntil: this.sim.time + 2.5,
        burstUntil: 0, visible: false, fire: false,
      };
      this.sim.navigate(a, a.ai.rally);
      a.ai.rally = a.moveTarget ?? spawn;
    }
    this.sim.events.push({ type: "wave", message: `Wave ${this.wave}: ${count} robots entering from ${this.entries.map((i) => ARENA_ENTRIES[i].name.toLowerCase()).join(" / ")}.` });
  }

  inspect() {
    return { wave: this.wave, cleared: this.cleared, phase: this.phase,
      countdown: this.countdown, enemies: this.enemies.length,
      kills: this.kills, enemyShots: this.enemyShots,
      nextCount: this.nextCount, entries: this.entries.map((i) => ARENA_ENTRIES[i].name),
      maxWaveRobots: 12 };
  }
}
