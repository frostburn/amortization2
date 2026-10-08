import { AUTOMATIC_AIM, FIREARMS, RIFLE, distance2, type Vec2, type Vec3 } from "./config";
import type { Actor, Simulation } from "./simulation";

export type CoverBrain = {
  mode: "scope" | "sector";
  direction?: Vec2;
  aim: Vec3;
  target: number | null;
  nextThink: number;
  nextAttack: number;
  burstUntil: number;
  fire: boolean;
  state: "watching" | "aiming" | "firing" | "suppressed" | "reloading";
};

export const COVER_HALF_ANGLE = Math.PI / 3;

export function manualFire(sim: Simulation, a: Actor) {
  return a.kind === "player" && sim.selected.has(a.id) && sim.trigger &&
    sim.weapon !== "grenade" && sim.followsOrder(a, sim.weapon);
}

function coverBrain(sim: Simulation, a: Actor, aim: Vec3): CoverBrain {
  return { mode: "scope", aim, target: null, nextThink: sim.time,
    nextAttack: sim.time + 0.35 + (a.id - 1) * 0.08,
    burstUntil: 0, fire: false, state: "watching" };
}

/** A direction, rather than a marked victim: stays useful as enemies enter it. */
export function orderCoverFire(sim: Simulation, point: Vec2) {
  for (const a of sim.active) {
    const p = a.body.translation(), length = distance2(p, point);
    if (length < 0.5) continue;
    a.cover = { ...coverBrain(sim, a, { ...point, y: p.y + 0.25 }), mode: "sector",
      direction: { x: (point.x - p.x) / length, z: (point.z - p.z) / length } };
    a.path = [];
    a.moveTarget = undefined;
    sim.mission?.bridge?.cancel(a);
    a.braced = true;
    a.braceTime = 0;
    a.firing = false;
  }
}

/** Temporary support, without changing selection, stance or movement orders. */
export function startCoverFire(sim: Simulation, operator: Actor) {
  for (const a of sim.squad) {
    if (a === operator || a.dead || a.cover?.mode === "sector") continue;
    const p = a.body.translation();
    a.cover = coverBrain(sim, a, { x: p.x + Math.sin(a.yaw) * 20, y: p.y + 0.42, z: p.z + Math.cos(a.yaw) * 20 });
    a.firing = false;
  }
}

export function stopCoverFire(sim: Simulation) {
  for (const a of sim.squad) {
    if (a.cover?.mode !== "scope") continue;
    a.firing = false;
    a.cover = undefined;
  }
}

export function updateCoverFire(sim: Simulation) {
  const enemies = sim.actors.filter((a) => a.kind === "enemy" && !a.dead);
  for (const a of sim.squad) {
    const brain = a.cover;
    if (!brain || a.dead || sim.sniping && a === sim.rifleOperator) continue;
    if (brain.mode === "scope" && !sim.sniping) continue;
    brain.fire = false;
    // Direct fire temporarily owns the selected weapons. Reacquire on release.
    if (manualFire(sim, a)) {
      brain.nextThink = sim.time;
      brain.burstUntil = 0;
      continue;
    }
    if (sim.isDisrupted(a)) {
      brain.state = "suppressed";
      brain.burstUntil = 0;
      continue;
    }
    if (brain.state === "suppressed") brain.nextThink = sim.time;
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
        if (brain.direction) {
          const length = distance2(p, q) || 1;
          if (((q.x - p.x) * brain.direction.x + (q.z - p.z) * brain.direction.z) / length < Math.cos(COVER_HALF_ANGLE)) continue;
        }
        const heights = enemy.flight ? [0] : a.weapon === "gun" || a.weapon === "minigun"
          ? [AUTOMATIC_AIM.bodyOffset, 0.25] : [0.25, AUTOMATIC_AIM.bodyOffset];
        for (const height of heights) {
          const aim = { x: q.x, y: q.y + height, z: q.z };
          const muzzle = sim.muzzle(a, aim);
          if (Math.hypot(aim.x - muzzle.x, aim.y - muzzle.y, aim.z - muzzle.z) > FIREARMS[a.weapon].range) continue;
          const hit = sim.fireRay(a, muzzle, aim);
          if (hit?.collider.handle !== enemy.collider.handle) continue;
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
      if (brain.direction) {
        const p = a.body.translation();
        brain.aim = { x: p.x + brain.direction.x * 20, y: p.y + 0.25, z: p.z + brain.direction.z * 20 };
      }
      continue;
    }
    const ammo = sim.ammunition(a);
    if (ammo.ammo === 0) sim.reloadActor(a);
    if (ammo.reload > 0) {
      brain.state = "reloading";
      brain.burstUntil = 0;
      brain.nextAttack = Math.max(brain.nextAttack, sim.time + 0.4);
      continue;
    }
    if (sim.time >= brain.nextAttack && (a.weapon !== "rifle" || a.braceTime >= RIFLE.settle)) {
      brain.burstUntil = sim.time + (a.weapon === "gun" ? 0.26 : a.weapon === "minigun" ? 1.1 : 0.06);
      brain.nextAttack = sim.time + (a.weapon === "rifle" ? 2.4 : brain.mode === "sector" && a.weapon === "pistol" ? 0.5 : a.weapon === "minigun" ? 1.4 : 0.9);
    }
    brain.fire = sim.time < brain.burstUntil;
    brain.state = brain.fire ? "firing" : "aiming";
  }
}
