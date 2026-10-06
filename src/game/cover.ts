import { FIREARMS, distance2, type Vec3 } from "./config";
import type { Actor, Simulation } from "./simulation";

export type CoverBrain = {
  aim: Vec3;
  target: number | null;
  nextThink: number;
  nextAttack: number;
  burstUntil: number;
  fire: boolean;
  state: "watching" | "aiming" | "firing" | "suppressed" | "reloading";
};

/** Temporary support, without changing selection, stance or movement orders. */
export function startCoverFire(sim: Simulation, operator: Actor) {
  for (const a of sim.squad) {
    if (a === operator || a.dead) continue;
    const p = a.body.translation();
    a.cover = {
      aim: { x: p.x + Math.sin(a.yaw) * 20, y: p.y + 0.42, z: p.z + Math.cos(a.yaw) * 20 },
      target: null, nextThink: sim.time,
      nextAttack: sim.time + 0.35 + (a.id - 1) * 0.08,
      burstUntil: 0, fire: false, state: "watching",
    };
    a.firing = false;
  }
}

export function stopCoverFire(sim: Simulation) {
  for (const a of sim.squad) {
    if (!a.cover) continue;
    a.firing = false;
    a.cover = undefined;
  }
}

export function updateCoverFire(sim: Simulation) {
  if (!sim.sniping) return;
  const enemies = sim.actors.filter((a) => a.kind === "enemy" && !a.dead);
  for (const a of sim.squad) {
    const brain = a.cover;
    if (!brain || a.dead) continue;
    brain.fire = false;
    if (sim.time >= brain.nextThink) {
      brain.nextThink = sim.time + 0.15;
      const p = a.body.translation();
      const candidates = enemies.slice().sort((first, second) => {
        const score = (enemy: Actor) => distance2(p, enemy.body.translation()) - (enemy.id === brain.target ? 3 : 0);
        return score(first) - score(second);
      });
      let target: number | null = null;
      for (const enemy of candidates) {
        const q = enemy.body.translation();
        for (const height of [0.25, 0.7]) {
          const aim = { x: q.x, y: q.y + height, z: q.z };
          const muzzle = sim.muzzle(a, aim);
          if (Math.hypot(aim.x - muzzle.x, aim.y - muzzle.y, aim.z - muzzle.z) > FIREARMS[a.weapon].range) continue;
          if (sim.fireRay(a, muzzle, aim)?.collider.handle !== enemy.collider.handle) continue;
          brain.aim = aim;
          target = enemy.id;
          break;
        }
        if (target !== null) break;
      }
      if (target !== brain.target) {
        brain.nextAttack = Math.max(brain.nextAttack, sim.time + 0.3);
        brain.burstUntil = 0;
      }
      brain.target = target;
    }
    if (!enemies.some((enemy) => enemy.id === brain.target)) {
      brain.target = null;
      brain.burstUntil = 0;
      brain.state = "watching";
      continue;
    }
    const ammo = sim.ammunition(a);
    if (ammo.ammo === 0) sim.reloadActor(a);
    if (ammo.reload > 0 || sim.isDisrupted(a)) {
      brain.state = ammo.reload > 0 ? "reloading" : "suppressed";
      brain.burstUntil = 0;
      brain.nextAttack = Math.max(brain.nextAttack, sim.time + 0.4);
      continue;
    }
    if (sim.time >= brain.nextAttack) {
      brain.burstUntil = sim.time + (a.weapon === "gun" ? 0.26 : 0.06);
      brain.nextAttack = sim.time + (a.weapon === "rifle" ? 2.4 : 0.9);
    }
    brain.fire = sim.time < brain.burstUntil;
    brain.state = brain.fire ? "firing" : "aiming";
  }
}
