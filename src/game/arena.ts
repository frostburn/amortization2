import { ENEMY_BRACE_WAVE, PISTOL, ROBOT_MODELS, STEP, distance2 } from "./config";
import { arenaEntries, entrySlots, type ArenaEntry } from "./arena-entries";
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

  readonly gates: ArenaEntry[];
  private pending: { squad: number; slot: number; gate: ArenaEntry }[] = [];
  constructor(private sim: Simulation) {
    this.gates = arenaEntries(sim);
    if (!this.gates.length) throw new Error(`No reachable arena entrances for ${sim.range}`);
    if (sim.range !== "arena") this.planEntries(sim.squad);
  }

  get enemies() {
    return this.sim.actors.filter((a) => a.kind === "enemy" && !a.flight && !a.dead);
  }
  get incoming() { return this.pending.length; }
  get nextCount() {
    return Math.min(12, this.wave + 3);
  }

  update() {
    const sim = this.sim;
    // Endless play must not accumulate physics bodies or GPU models indefinitely.
    for (const a of [...sim.actors])
      if (a.kind === "enemy" && !a.flight && a.dead && sim.time - a.deathTime! > 8)
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
    if (this.phase === "active" && !this.enemies.length && !this.pending.length && !sim.grenades.length) {
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
    if (this.phase === "active") this.spawnIncoming();
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
    const gates = this.gates.map((entry, i) => ({
      index: i,
      distance: Math.min(...living.map((a) => distance2(entry, a.body.translation()))),
      order: (i - this.wave % this.gates.length + this.gates.length) % this.gates.length,
    })).sort((a, b) => a.order - b.order);
    const safe = gates.filter((g) => g.distance >= 12);
    this.entries = (safe.length >= squads ? safe : gates.sort((a, b) => b.distance - a.distance))
      .slice(0, squads).map((g) => g.index);
    while (this.entries.length < squads) this.entries.push(this.entries[this.entries.length % gates.length]);
  }

  private startWave() {
    for (const actor of [...this.sim.actors])
      if (actor.kind === "enemy" && !actor.flight && actor.dead) this.sim.retireEnemy(actor);
    const count = this.nextCount;
    this.wave++;
    this.phase = "active";
    for (let i = 0; i < count; i++) {
      const squad = Math.floor(i / 4), slot = i % 4;
      const gate = this.gates[this.entries[squad]];
      this.pending.push({ squad, slot, gate });
    }
    this.spawnIncoming();
    this.sim.events.push({ type: "wave", message: `Wave ${this.wave}: ${count} robots entering from ${this.entries.map((i) => this.gates[i].name.toLowerCase()).join(" / ")}.` });
  }

  private spawnIncoming() {
    this.pending = this.pending.filter(({ squad, slot, gate }) => {
      // Busy entrances wait for room; never spawn inside a robot, wall or water.
      const spawn = entrySlots(this.sim, gate, slot).find(p => this.sim.actors.every(other =>
        distance2(p, other.body.translation()) > (other.dead ? 1.5 : 1.2)));
      if (!spawn) return true;
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
      return false;
    });
  }

  inspect() {
    return { wave: this.wave, cleared: this.cleared, phase: this.phase,
      countdown: this.countdown, enemies: this.enemies.length,
      kills: this.kills, enemyShots: this.enemyShots,
      nextCount: this.nextCount, entries: this.entries.map((i) => this.gates[i].name),
      incoming: this.pending.length, gates: this.gates.map(g => ({ ...g })), maxWaveRobots: 12 };
  }
}
