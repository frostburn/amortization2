import { AUTOMATIC_AIM, RIFLE, clamp, distance2, type Vec2, type Vec3 } from "./config";
import { segmentClear } from "./navigation";
import type { Actor, Simulation } from "./simulation";

export type EnemyBrain = {
  squad: number;
  gate: string;
  rally: Vec2;
  flank: number;
  target: number | null;
  aim: Vec3;
  state: "holding" | "entering" | "advancing" | "aiming" | "firing" | "suppressed" | "reloading";
  nextThink: number;
  nextRoute: number;
  routeTarget?: Vec3;
  nextAttack: number;
  entryUntil: number;
  nextGrenade: number;
  burstUntil: number;
  visible: boolean;
  fire: boolean;
};

export type EnemyProfile = {
  brace: boolean;
  grenades: boolean;
  automaticBurst: number;
  attackInterval: number;
  noticeRange?: number;
  leash?: number;
  reactionTime?: number;
  pistolRange?: number;
};

/** Shared combat intentions; encounters own spawning, objectives and difficulty. */
export function updateEnemy(sim: Simulation, a: Actor, living: Actor[], profile: EnemyProfile) {
  const brain = a.ai!, now = sim.time;
  brain.fire = false;
  if (sim.isDisrupted(a)) {
    if (brain.state !== "entering") brain.state = "suppressed";
    brain.burstUntil = 0;
    return;
  }
  const candidates = profile.noticeRange === undefined ? living : living.filter(target =>
    distance2(a.body.translation(), target.body.translation()) <= profile.noticeRange! + (a.hp < a.maxHp ? 8 : 0));
  if (!candidates.length) {
    brain.target = null;
    brain.visible = false;
    brain.burstUntil = 0;
    a.braced = false;
    if (brain.state !== "holding" && distance2(a.body.translation(), brain.rally) > 0.7)
      sim.navigate(a, brain.rally);
    brain.state = "holding";
    return;
  }
  if (brain.state === "holding") {
    brain.state = "advancing";
    brain.nextThink = now;
    brain.nextAttack = Math.max(brain.nextAttack, now + (profile.reactionTime ?? 1));
  }
  if (brain.state === "suppressed") brain.nextThink = now;
  if (brain.state === "entering") {
    if (distance2(a.body.translation(), brain.rally) > 0.7 && now < brain.entryUntil) return;
    brain.state = "advancing";
    brain.nextAttack = Math.max(brain.nextAttack, now + 0.8);
  }
  if (now >= brain.nextThink) {
    brain.nextThink = now + 0.15;
    const p = a.body.translation();
    const target = candidates.reduce((best, candidate) => {
      const score = (actor: Actor) => distance2(p, actor.body.translation()) - (actor.id === brain.target ? 2 : 0);
      return score(candidate) < score(best) ? candidate : best;
    });
    if (brain.target !== target.id) {
      brain.target = target.id;
      brain.nextAttack = Math.max(brain.nextAttack, now + (profile.reactionTime ?? (a.model === "sniper" ? 1.3 : 0.7)));
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
    const heights = a.weapon === "gun" || a.weapon === "minigun"
      ? [AUTOMATIC_AIM.bodyOffset, 0.25] : [0.25, AUTOMATIC_AIM.bodyOffset];
    for (const height of heights) {
      const aim = { x: q.x, y: q.y + height, z: q.z };
      if (sim.fireRay(a, sim.muzzle(a, aim), aim)?.collider.handle === target.collider.handle) {
        brain.aim = aim;
        brain.visible = true;
        break;
      }
    }
    const state = sim.ammunition(a);
    if (profile.grenades && a.model === "assault" &&
        now >= brain.nextGrenade && distance > 10 && distance < 24 &&
        !sim.grenades.some((g) => g.team === "enemy") &&
        living.filter((other) => distance2(q, other.body.translation()) < 4).length >= 2 &&
        sim.actors.filter(other => other.kind === "enemy" && !other.dead).every((other) => distance2(q, other.body.translation()) > 8)) {
      if (sim.throwGrenade({ ...q, y: sim.walkingHeight(sim.walkingPoint(target)) }, a)) {
        brain.nextGrenade = now + 8;
        brain.nextAttack = now + 0.8;
        brain.burstUntil = 0;
      }
    }
    if (state.reload > 0) {
      brain.state = "reloading";
      brain.burstUntil = 0;
      brain.nextAttack = Math.max(brain.nextAttack, now + 0.5);
    } else if (brain.visible && distance < (a.weapon === "rifle" ? 80 : a.weapon === "pistol" ? profile.pistolRange ?? 24 : 38)) {
      a.braced = profile.brace;
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
        const foot = sim.walkingPoint(target);
        // Rotating the candidate ring around a stationary target can alternate
        // between opposite sides of cover before either flank is reached.
        const continuing = sim.terrain && a.path.length > 0 && a.moveTarget && brain.routeTarget &&
          distance2(foot, brain.routeTarget) < 3 && Math.abs(foot.y - brain.routeTarget.y) < .5;
        const goal = continuing ? a.moveTarget! : firingPosition(sim, a, target, profile);
        if (!continuing) brain.routeTarget = foot;
        sim.navigate(a, goal);
      }
    }
  }
  const state = sim.ammunition(a);
  if (brain.state === "aiming" && now >= brain.nextAttack &&
      (a.weapon !== "rifle" || a.braceTime >= RIFLE.settle)) {
    brain.burstUntil = now + (a.weapon === "gun" ? profile.automaticBurst : 0.06);
    brain.nextAttack = now + (a.weapon === "rifle" ? 2.4 : profile.attackInterval);
  }
  brain.fire = brain.visible && now < brain.burstUntil && brain.state !== "suppressed" && state.reload === 0;
  if (brain.fire) brain.state = "firing";
  if (state.ammo === 0) sim.reloadActor(a);
}

function firingPosition(sim: Simulation, a: Actor, target: Actor, profile: EnemyProfile): Vec2 {
  const p = a.body.translation(), q = target.body.translation();
  const bearing = Math.atan2(p.x - q.x, p.z - q.z);
  const radius = a.weapon === "rifle" ? 45 : a.weapon === "pistol" ? 12 : 30;
  const b = sim.layout.bounds;
  const solids = [...sim.layout.barriers, ...sim.layout.platforms,
    ...sim.props.map((prop) => ({ x: prop.body.translation().x, z: prop.body.translation().z, w: prop.w, d: prop.d }))];
  let best: Vec2 = profile.leash === undefined ? sim.walkingPoint(target) : { ...a.ai!.rally }, bestScore = Infinity;
  for (const offset of [0, 0.65, -0.65, 1.2, -1.2, 1.8, -1.8]) {
    const angle = bearing + a.ai!.flank + offset;
    const raw = { x: clamp(q.x + Math.sin(angle) * radius, b.left + 1, b.right - 1),
      z: clamp(q.z + Math.cos(angle) * radius, b.back + 1, b.front - 1) };
    const goal: Vec2 = sim.terrain ? sim.terrain.resolve({ ...raw, y: sim.walkingPoint(a).y }) : raw;
    if (profile.leash !== undefined && distance2(goal, a.ai!.rally) > profile.leash) continue;
    if (sim.terrain ? !sim.terrain.canStand({ ...goal, y: goal.y ?? 0 }) : !segmentClear(goal, goal, solids, 0.6)) continue;
    const hit = sim.fireRay(a, { ...goal, y: (goal.y ?? 0) + 1.4 }, { ...q, y: q.y + 0.25 });
    const visible = hit?.collider.handle === target.collider.handle;
    const score = distance2(p, goal) + Math.abs(offset) * 2 + (visible ? 0 : 18);
    if (score < bestScore) { bestScore = score; best = goal; }
  }
  return best;
}

