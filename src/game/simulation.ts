import RAPIER from "@dimforge/rapier3d-compat";
import {
  BLAST_RADIUS,
  FORMATION_SPACING,
  GRAVITY,
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  MAGAZINE,
  RIFLE,
  ROBOT_MODELS,
  RELOAD_SECONDS,
  SHOT_INTERVAL,
  STEP,
  clamp,
  distance2,
  grenadeVelocity,
  type Vec2,
  type Vec3,
  type RobotModel,
  type Weapon,
} from "./config";
import { findPath, segmentClear } from "./navigation";
import { RANGES, type RangeId, type TargetKind } from "./ranges";

export type ActorKind = "player" | TargetKind;
export interface Actor {
  id: number;
  kind: ActorKind;
  model: RobotModel | null;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  spawn: Vec3;
  hp: number;
  maxHp: number;
  stability: number;
  yaw: number;
  ammo: number;
  reload: number;
  grenadeCooldown: number;
  shotWait: number;
  firing: boolean;
  braced: boolean;
  braceTime: number;
  path: Vec2[];
  moveTarget?: Vec2;
  hitTime: number;
  dead: boolean;
  recoil: number;
  previous: Vec3;
  previousRotation: { x: number; y: number; z: number; w: number };
  killedBy?: Weapon;
}
export interface Prop {
  id: number;
  body: RAPIER.RigidBody;
  w: number;
  h: number;
  d: number;
  previous: Vec3;
  previousRotation: { x: number; y: number; z: number; w: number };
}
export interface Grenade {
  id: number;
  body: RAPIER.RigidBody;
  fuse: number;
  owner: number;
  previous: Vec3;
  bounceWait: number;
  lastVelocity: Vec3;
}
export type GameEvent =
  | {
      type: "shot";
      actor: number;
      weapon: "gun" | "rifle";
      from: Vec3;
      to: Vec3;
      hit: boolean;
      material: "metal" | "concrete";
      normal: Vec3;
    }
  | { type: "explosion"; position: Vec3; affected: number }
  | {
      type: "throw" | "bounce" | "reload" | "empty" | "down";
      position: Vec3;
      actor?: number;
      weapon?: "gun" | "rifle";
    }
  | { type: "drill"; message: string };

const vcopy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
export type MoveDestination = { actor: number; position: Vec2 };

export class Simulation {
  world!: RAPIER.World;
  actors: Actor[] = [];
  props: Prop[] = [];
  grenades: Grenade[] = [];
  events: GameEvent[] = [];
  selected = new Set([1]);
  aim: Vec3 = { x: -14, y: 1.2, z: -8 };
  trigger = false;
  sniping = false;
  weapon: Weapon = "gun";
  range: RangeId;
  time = 0;
  shots = 0;
  hits = 0;
  throws = 0;
  grenadeHits = 0;
  maxDisplacement = 0;
  drill = { gun: false, impulse: false, grenade: false, rifle: false };
  private lastGrenadier = 0;
  private rifleAim?: Vec3;
  private randomState = 1729;
  private nextId = 100;

  static async create(range: RangeId = "proving") {
    await RAPIER.init();
    return new Simulation(range);
  }
  private constructor(range: RangeId) {
    this.range = range;
    this.reset();
  }
  get layout() {
    return RANGES[this.range];
  }

  reset(range: RangeId = this.range) {
    this.range = range;
    this.world?.free();
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    this.actors = [];
    this.props = [];
    this.grenades = [];
    this.events = [];
    this.selected = new Set([range === "long" ? 4 : 1]);
    this.trigger = false;
    this.sniping = false;
    this.weapon = range === "long" ? "rifle" : "gun";
    this.aim =
      range === "long" ? { x: 58, y: 3.25, z: 0 } : { x: -14, y: 1.25, z: -8 };
    this.rifleAim = undefined;
    this.time = 0;
    this.shots = 0;
    this.hits = 0;
    this.throws = 0;
    this.grenadeHits = 0;
    this.maxDisplacement = 0;
    this.lastGrenadier = 0;
    this.randomState = 1729;
    this.nextId = 100;
    this.drill = { gun: false, impulse: false, grenade: false, rifle: false };
    const floor = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.5, 0),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(120, 0.5, 60).setFriction(0.8),
      floor,
    );
    for (const box of [...this.layout.barriers, ...this.layout.platforms]) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(box.x, box.h / 2, box.z),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(box.w / 2, box.h / 2, box.d / 2).setFriction(
          0.8,
        ),
        body,
      );
    }
    this.layout.players.forEach((p, i) =>
      this.addActor(i + 1, "player", p.x, p.z),
    );
    this.layout.targets.forEach((p, i) =>
      this.addActor(i + 10, p.kind, p.x, p.z, p.elevation),
    );
    for (const p of this.layout.props) {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(p.x, p.h / 2 + 0.01, p.z)
          .setLinearDamping(0.5)
          .setAngularDamping(2),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(p.w / 2, p.h / 2, p.d / 2)
          .setMass(p.mass)
          .setFriction(0.65)
          .setRestitution(0.05),
        body,
      );
      this.props.push({
        id: this.nextId++,
        body,
        w: p.w,
        h: p.h,
        d: p.d,
        previous: vcopy(body.translation()),
        previousRotation: { ...body.rotation() },
      });
    }
    // Populate scene-query acceleration structures before the first input event.
    this.world.step();
  }

  private addActor(
    id: number,
    kind: ActorKind,
    x: number,
    z: number,
    elevation = 0,
  ) {
    const player = kind === "player";
    const model: RobotModel | null = player
      ? id === 4
        ? "sniper"
        : "assault"
      : null;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, elevation + 0.98, z)
        .lockRotations()
        .setLinearDamping(player ? 0.3 : 1.5)
        .setAngularDamping(5)
        .setCcdEnabled(true),
    );
    const shape = player
      ? RAPIER.ColliderDesc.capsule(0.56, 0.37)
      : this.range === "long"
        ? RAPIER.ColliderDesc.cuboid(0.3, 0.96, 0.48)
        : RAPIER.ColliderDesc.cuboid(0.48, 0.96, 0.3);
    const collider = this.world.createCollider(
      shape
        .setMass(model ? ROBOT_MODELS[model].mass : kind === "plate" ? 90 : 48)
        .setFriction(player ? 0.3 : 0.42)
        .setRestitution(0),
      body,
    );
    const hp = model
      ? ROBOT_MODELS[model].hp
      : kind === "heavy"
        ? 420
        : kind === "moving"
          ? 168
          : 84;
    this.actors.push({
      id,
      kind,
      model,
      body,
      collider,
      spawn: { x, y: elevation + 0.98, z },
      hp,
      maxHp: hp,
      stability: 1,
      yaw:
        this.range === "long"
          ? player
            ? Math.PI / 2
            : -Math.PI / 2
          : player
            ? Math.PI
            : 0,
      ammo: model === "sniper" ? RIFLE.magazine : MAGAZINE,
      reload: 0,
      grenadeCooldown: 0,
      shotWait: 0,
      firing: false,
      braced: false,
      braceTime: 0,
      path: [],
      hitTime: -10,
      dead: false,
      recoil: 0,
      previous: { x, y: elevation + 0.98, z },
      previousRotation: { ...body.rotation() },
    });
  }

  random() {
    this.randomState ^= this.randomState << 13;
    this.randomState ^= this.randomState >>> 17;
    this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 4294967296;
  }
  get squad() {
    return this.actors.filter((a) => a.kind === "player");
  }
  get active() {
    return this.squad.filter((a) => this.selected.has(a.id) && !a.dead);
  }
  get primary() {
    return this.active[0] ?? this.squad[0];
  }
  get rifleOperator() {
    return this.active.find((a) => a.model === "sniper");
  }
  magazine(a: Actor) {
    return a.model === "sniper" ? RIFLE.magazine : MAGAZINE;
  }
  reloadDuration(a: Actor) {
    return a.model === "sniper" ? RIFLE.reload : RELOAD_SECONDS;
  }
  canUse(weapon: Weapon) {
    return (
      weapon === "grenade" ||
      this.active.some((a) => ROBOT_MODELS[a.model!].weapon === weapon)
    );
  }
  chooseWeapon(weapon: Weapon) {
    if (!this.canUse(weapon)) return false;
    if (weapon !== "rifle") this.endSniping();
    if (this.weapon === "rifle") this.rifleAim = vcopy(this.aim);
    if (weapon === "rifle" && this.rifleAim) this.aim = vcopy(this.rifleAim);
    this.weapon = weapon;
    this.trigger = false;
    for (const a of this.squad) a.firing = false;
    return true;
  }
  private matchWeapon() {
    if (
      this.weapon !== "grenade" &&
      !this.canUse(this.weapon) &&
      this.active.length
    )
      this.chooseWeapon(ROBOT_MODELS[this.primary.model!].weapon);
  }
  get grenadeThrower(): Actor | undefined {
    const ready = this.active.filter((a) => a.grenadeCooldown === 0);
    return ready.find((a) => a.id > this.lastGrenadier) ?? ready[0];
  }
  get grenadeCooldown() {
    const active = this.active;
    return active.length
      ? Math.min(...active.map((a) => a.grenadeCooldown))
      : 0;
  }
  get destroyed() {
    return this.actors.filter((a) => a.kind !== "player" && a.dead).length;
  }

  select(id: number, additive = false) {
    if (id === 5)
      this.selected = new Set(
        this.squad.filter((a) => !a.dead).map((a) => a.id),
      );
    else if (additive) {
      if (this.selected.has(id) && this.selected.size > 1)
        this.selected.delete(id);
      else this.selected.add(id);
    } else this.selected = new Set([id]);
    this.release();
    this.matchWeapon();
  }

  selectGroup(ids: number[]) {
    const living = this.squad.filter((a) => !a.dead && ids.includes(a.id));
    // An empty box leaves the current group available for the next command.
    if (living.length) this.selected = new Set(living.map((a) => a.id));
    this.release();
    this.matchWeapon();
  }

  release() {
    this.trigger = false;
    this.sniping = false;
    for (const a of this.squad) {
      a.firing = false;
      a.braced = false;
      a.braceTime = 0;
    }
  }
  setBrace(braced: boolean) {
    if (!braced) this.endSniping();
    for (const a of this.active) {
      if (a.braced !== braced) a.braceTime = 0;
      a.braced = braced;
    }
  }
  toggleSniping() {
    if (this.sniping) {
      this.endSniping();
      return false;
    }
    const operator = this.weapon === "rifle" && this.rifleOperator;
    if (!operator) return false;
    this.sniping = true;
    this.trigger = false;
    operator.firing = false;
    operator.braced = true;
    operator.braceTime = 0;
    return true;
  }
  endSniping() {
    if (!this.sniping) return;
    this.sniping = false;
    this.trigger = false;
    const operator = this.squad.find((a) => a.model === "sniper")!;
    operator.braced = false;
    operator.braceTime = 0;
    operator.firing = false;
  }
  private navigationBoxes(includeTargets = true) {
    return [
      ...this.layout.barriers,
      ...this.layout.platforms,
      ...this.props.map((p) => ({
        x: p.body.translation().x,
        z: p.body.translation().z,
        w: p.w,
        d: p.d,
      })),
      ...(includeTargets
        ? this.actors
            .filter((a) => a.kind !== "player" && !a.dead)
            .map((a) => ({
              x: a.body.translation().x,
              z: a.body.translation().z,
              w: this.range === "long" ? 0.6 : 0.96,
              d: this.range === "long" ? 0.96 : 0.6,
            }))
        : []),
    ];
  }

  moveDestinations(point: Vec2): MoveDestination[] {
    const active = this.active;
    if (!active.length) return [];
    const BOUNDS = this.layout.bounds;
    const half = FORMATION_SPACING / 2;
    const triangleRadius = FORMATION_SPACING / Math.sqrt(3);
    // Stable slots prevent robots trading places while a move is being steered.
    const offsets =
      active.length === 4
        ? [
            { x: -half, z: half },
            { x: -half, z: -half },
            { x: half, z: -half },
            { x: half, z: half },
          ]
        : active.length === 3
          ? [
              { x: -half, z: triangleRadius / 2 },
              { x: 0, z: -triangleRadius },
              { x: half, z: triangleRadius / 2 },
            ]
          : active.map((_, i) => ({
              x: (i - (active.length - 1) / 2) * 1.65,
              z: 0,
            }));
    const extentX = Math.max(...offsets.map((p) => Math.abs(p.x)));
    const extentZ = Math.max(...offsets.map((p) => Math.abs(p.z)));
    const minX = BOUNDS.left + 1 + extentX,
      maxX = BOUNDS.right - 1 - extentX;
    const minZ = BOUNDS.back + 1 + extentZ,
      maxZ = BOUNDS.front - 1 - extentZ;
    const requested = {
      x: clamp(point.x, minX, maxX),
      z: clamp(point.z, minZ, maxZ),
    };
    const boxes = this.navigationBoxes();
    const free = (p: Vec2) =>
      boxes.every(
        (b) =>
          Math.abs(p.x - b.x) >= b.w / 2 + extentX + 0.55 ||
          Math.abs(p.z - b.z) >= b.d / 2 + extentZ + 0.55,
      );
    let center = requested;
    if (!free(center)) {
      // The nearest clear footprint lies on an expanded obstacle edge or corner.
      const xs = new Set([requested.x, minX, maxX]),
        zs = new Set([requested.z, minZ, maxZ]);
      for (const b of boxes)
        for (const sign of [-1, 1]) {
          xs.add(clamp(b.x + sign * (b.w / 2 + extentX + 0.57), minX, maxX));
          zs.add(clamp(b.z + sign * (b.d / 2 + extentZ + 0.57), minZ, maxZ));
        }
      let best = Infinity;
      for (const x of xs)
        for (const z of zs) {
          const candidate = { x, z },
            cost = (x - requested.x) ** 2 + (z - requested.z) ** 2;
          if (cost < best && free(candidate)) {
            center = candidate;
            best = cost;
          }
        }
      if (!Number.isFinite(best)) return [];
    }
    return active.map((actor, i) => ({
      actor: actor.id,
      position: { x: center.x + offsets[i].x, z: center.z + offsets[i].z },
    }));
  }

  move(point: Vec2, queue = false) {
    this.endSniping();
    const boxes = this.navigationBoxes();
    for (const target of this.moveDestinations(point)) {
      const actor = this.actors.find((a) => a.id === target.actor)!;
      const start =
        queue && actor.path.length
          ? actor.path.at(-1)!
          : actor.body.translation();
      const path = findPath(
        start,
        target.position,
        boxes,
        0.55,
        this.layout.bounds,
      );
      actor.braced = false;
      actor.braceTime = 0;
      actor.moveTarget = target.position;
      actor.path = queue ? [...actor.path, ...path] : path;
    }
  }

  reloadSelected() {
    for (const a of this.active) this.reloadActor(a);
  }
  private reloadActor(a: Actor) {
    if (a.reload > 0 || a.ammo === this.magazine(a) || a.dead) return;
    a.reload = this.reloadDuration(a);
    a.firing = false;
    this.events.push({
      type: "reload",
      actor: a.id,
      weapon: a.model === "sniper" ? "rifle" : "gun",
      position: vcopy(a.body.translation()),
    });
  }

  muzzle(a: Actor, toward: Vec3 = this.aim): Vec3 {
    const p = a.body.translation();
    const dx = toward.x - p.x,
      dz = toward.z - p.z,
      length = Math.hypot(dx, dz) || 1;
    const reach = a.model === "sniper" ? 1.65 : 0.86;
    const dy = a.model === "sniper" ? toward.y - p.y - 0.42 : 0;
    const pitchedLength = Math.hypot(dx, dy, dz) || 1;
    return {
      x: p.x + (dx / pitchedLength) * reach + (dz / length) * 0.27,
      y: p.y + 0.42 + (dy / pitchedLength) * reach,
      z: p.z + (dz / pitchedLength) * reach - (dx / length) * 0.27,
    };
  }

  ray(
    from: Vec3,
    to: Vec3,
    exclude?: RAPIER.RigidBody,
    predicate?: (collider: RAPIER.Collider) => boolean,
  ) {
    const length = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
    if (length < 0.001) return null;
    return this.world.castRayAndGetNormal(
      new RAPIER.Ray(from, {
        x: (to.x - from.x) / length,
        y: (to.y - from.y) / length,
        z: (to.z - from.z) / length,
      }),
      length,
      true,
      undefined,
      undefined,
      undefined,
      exclude,
      predicate,
    );
  }

  rifleSpread(a: Actor) {
    return a.braced
      ? 0.0006 + (1 - clamp(a.braceTime / RIFLE.settle, 0, 1)) * 0.024
      : 0.04 + a.recoil * 0.055 + (1 - a.stability) * 0.02;
  }

  // Scope and shot share this direction: the visible sway is the rifle's actual aim.
  rifleDirection(a: Actor): Vec3 {
    const from = this.muzzle(a),
      dx = this.aim.x - from.x,
      dy = this.aim.y - from.y,
      dz = this.aim.z - from.z;
    const length = Math.hypot(dx, dy, dz) || 1,
      horizontal = Math.hypot(dx, dz) || 1,
      spread = this.rifleSpread(a),
      sway = Math.sin(this.time * 3.1 + a.id) * spread;
    const dir = {
      x: dx / length - (dz / horizontal) * sway,
      y: dy / length + Math.sin(this.time * 4.3 + a.id * 1.7) * spread * 0.65,
      z: dz / length + (dx / horizontal) * sway,
    };
    const norm = Math.hypot(dir.x, dir.y, dir.z);
    return { x: dir.x / norm, y: dir.y / norm, z: dir.z / norm };
  }

  shoot(a: Actor) {
    if (a.dead || a.ammo <= 0 || a.reload > 0) return;
    const rifle = a.model === "sniper";
    if (a.kind !== "player" || this.weapon !== (rifle ? "rifle" : "gun"))
      return;
    const from = this.muzzle(a);
    const delta = {
      x: this.aim.x - from.x,
      y: this.aim.y - from.y,
      z: this.aim.z - from.z,
    };
    const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
    const spread = a.braced
      ? 0.005
      : 0.008 + a.recoil * 0.011 + (a.path.length ? 0.014 : 0);
    const dir = rifle
      ? this.rifleDirection(a)
      : {
          x: delta.x / length + (this.random() - 0.5) * spread,
          y: delta.y / length + (this.random() - 0.5) * spread,
          z: delta.z / length + (this.random() - 0.5) * spread,
        };
    const norm = Math.hypot(dir.x, dir.y, dir.z);
    dir.x /= norm;
    dir.y /= norm;
    dir.z /= norm;
    const hit = this.world.castRayAndGetNormal(
      new RAPIER.Ray(from, dir),
      rifle ? RIFLE.range : 65,
      true,
      undefined,
      undefined,
      undefined,
      a.body,
    );
    const distance = hit?.timeOfImpact ?? (rifle ? RIFLE.range : 55);
    const to = {
      x: from.x + dir.x * distance,
      y: from.y + dir.y * distance,
      z: from.z + dir.z * distance,
    };
    const target =
      hit && this.actors.find((t) => t.collider.handle === hit.collider.handle);
    if (target && !target.dead) {
      this.damage(
        target,
        target.kind === "player" ? (rifle ? 35 : 6) : rifle ? RIFLE.damage : 14,
        {
          x: dir.x * (rifle ? 180 : 48),
          y: dir.y * (rifle ? 24 : 12),
          z: dir.z * (rifle ? 180 : 48),
        },
        to,
        rifle ? "rifle" : "gun",
      );
      if (target.kind !== "player") this.hits++;
    } else if (hit?.collider.parent()?.isDynamic()) {
      hit.collider
        .parent()!
        .applyImpulseAtPoint(
          { x: dir.x * 18, y: dir.y * 18, z: dir.z * 18 },
          to,
          true,
        );
    }
    a.ammo--;
    a.recoil = Math.min(1, a.recoil + (rifle && !a.braced ? 1 : 0.15));
    if (rifle) {
      a.stability = Math.max(0, a.stability - (a.braced ? 0.04 : 0.55));
      a.braceTime = 0;
    }
    this.shots++;
    const recoil = rifle ? (a.braced ? 12 : RIFLE.recoil) : a.braced ? 1 : 5;
    a.body.applyImpulse({ x: -dir.x * recoil, y: 0, z: -dir.z * recoil }, true);
    this.events.push({
      type: "shot",
      actor: a.id,
      weapon: rifle ? "rifle" : "gun",
      from,
      to,
      hit: !!target && target.kind !== "player",
      material:
        target || hit?.collider.parent()?.isDynamic() ? "metal" : "concrete",
      normal: hit ? vcopy(hit.normal) : { x: 0, y: 1, z: 0 },
    });
  }

  damage(
    a: Actor,
    amount: number,
    impulse: Vec3,
    point: Vec3,
    source?: Weapon,
  ) {
    const multiplier = a.braced ? 0.28 : 1;
    a.body.applyImpulseAtPoint(
      {
        x: impulse.x * multiplier,
        y: impulse.y * multiplier,
        z: impulse.z * multiplier,
      },
      point,
      true,
    );
    if (a.dead) return;
    a.hp = Math.max(0, a.hp - amount);
    a.hitTime = this.time;
    a.stability = Math.max(0, a.stability - (a.braced ? 0.05 : 0.16));
    if (a.hp <= 0) {
      if (a.model === "sniper") this.endSniping();
      a.dead = true;
      a.killedBy = source;
      a.firing = false;
      a.path = [];
      a.body.setEnabledRotations(true, true, true, true);
      a.body.applyTorqueImpulse(
        { x: impulse.z * 0.28, y: 0, z: -impulse.x * 0.28 },
        true,
      );
      a.body.setLinearDamping(1.2);
      this.events.push({
        type: "down",
        actor: a.id,
        position: vcopy(a.body.translation()),
      });
    }
  }

  grenadeOrigin(actor: Actor, point: Vec2): Vec3 {
    const p = actor.body.translation();
    const dx = point.x - p.x,
      dz = point.z - p.z,
      distance = Math.hypot(dx, dz) || 1;
    return {
      x: p.x + (dx / distance) * 0.7,
      y: p.y + 0.76,
      z: p.z + (dz / distance) * 0.7,
    };
  }

  throwGrenade(point: Vec2): boolean {
    const actor = this.grenadeThrower;
    if (!actor) return false;
    const from = this.grenadeOrigin(actor, point);
    const { velocity } = grenadeVelocity(from, point);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(from.x, from.y, from.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setAngvel({ x: 8, y: 5, z: 3 })
        .setLinearDamping(0.02)
        .setAngularDamping(0.6)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.ball(0.14)
        .setMass(0.65)
        .setRestitution(0.44)
        .setFriction(0.7),
      body,
    );
    this.grenades.push({
      id: this.nextId++,
      body,
      fuse: GRENADE_FUSE,
      owner: actor.id,
      previous: from,
      bounceWait: 0.1,
      lastVelocity: velocity,
    });
    actor.grenadeCooldown = GRENADE_COOLDOWN;
    this.lastGrenadier = actor.id;
    this.throws++;
    this.events.push({ type: "throw", actor: actor.id, position: from });
    return true;
  }

  blastExposure(origin: Vec3, actor: Actor): number {
    const p = actor.body.translation();
    let visible = 0;
    for (const y of [0.25, 0.75, 1.35]) {
      const sample = { x: p.x, y: p.y - 0.96 + y, z: p.z };
      const hit = this.ray(
        origin,
        sample,
        actor.body,
        (c) => !this.grenades.some((g) => g.body.handle === c.parent()?.handle),
      );
      if (!hit) visible++;
    }
    return visible / 3;
  }

  explode(grenade: Grenade) {
    const origin = vcopy(grenade.body.translation());
    origin.y = Math.max(0.18, origin.y);
    this.world.removeRigidBody(grenade.body);
    this.grenades = this.grenades.filter((g) => g !== grenade);
    let affected = 0;
    for (const a of this.actors) {
      const p = a.body.translation();
      const dx = p.x - origin.x,
        dz = p.z - origin.z,
        distance = Math.hypot(dx, p.y - origin.y, dz);
      if (distance >= BLAST_RADIUS) continue;
      const exposure = this.blastExposure(origin, a);
      if (!exposure) continue;
      const falloff = 1 - distance / BLAST_RADIUS;
      const strength = 550 * falloff * exposure;
      const wasAlive = !a.dead;
      this.damage(
        a,
        210 * Math.sqrt(falloff) * exposure,
        {
          x: (dx / Math.max(0.4, distance)) * strength,
          y: Math.min(85, strength * 0.18),
          z: (dz / Math.max(0.4, distance)) * strength,
        },
        p,
        "grenade",
      );
      if (a.kind !== "player" && wasAlive) {
        affected++;
        this.grenadeHits++;
      }
    }
    for (const p of this.props) {
      const position = p.body.translation();
      const distance = Math.hypot(
        position.x - origin.x,
        position.y - origin.y,
        position.z - origin.z,
      );
      if (distance >= BLAST_RADIUS || this.ray(origin, position, p.body))
        continue;
      const strength = 280 * (1 - distance / BLAST_RADIUS);
      p.body.applyImpulse(
        {
          x: ((position.x - origin.x) / Math.max(0.4, distance)) * strength,
          y: strength * 0.32,
          z: ((position.z - origin.z) / Math.max(0.4, distance)) * strength,
        },
        true,
      );
      p.body.applyTorqueImpulse(
        { x: strength * 0.1, y: 0.4, z: strength * 0.06 },
        true,
      );
    }
    this.events.push({ type: "explosion", position: origin, affected });
  }

  step() {
    this.time += STEP;
    for (const a of this.actors) {
      a.grenadeCooldown = Math.max(0, a.grenadeCooldown - STEP);
      a.previous = vcopy(a.body.translation());
      a.previousRotation = { ...a.body.rotation() };
      a.recoil = Math.max(0, a.recoil - STEP * 1.1);
      a.shotWait -= STEP;
      if (a.dead) continue;
      const velocity = a.body.linvel();
      a.braceTime =
        a.braced &&
        Math.hypot(velocity.x, velocity.z) < 0.3 &&
        a.stability > 0.8
          ? Math.min(RIFLE.settle, a.braceTime + STEP)
          : 0;
      if (this.time - a.hitTime > 0.35)
        a.stability = Math.min(1, a.stability + STEP * (a.braced ? 1.5 : 0.6));
      if (a.kind === "heavy")
        this.maxDisplacement = Math.max(
          this.maxDisplacement,
          distance2(a.body.translation(), a.spawn),
        );
      if (a.reload > 0) {
        a.reload -= STEP;
        if (a.reload <= 0) {
          a.reload = 0;
          a.ammo = this.magazine(a);
        }
      }
      if (a.kind === "player") {
        const selected = this.selected.has(a.id);
        const fire =
          selected &&
          this.trigger &&
          this.weapon === ROBOT_MODELS[a.model!].weapon &&
          a.reload === 0;
        a.firing = fire && a.ammo > 0;
        if (fire && a.shotWait <= 0 && a.ammo > 0) {
          this.shoot(a);
          a.shotWait =
            (a.model === "sniper" ? RIFLE.interval : SHOT_INTERVAL) +
            Math.max(-STEP, a.shotWait);
        }
        if (fire && a.ammo === 0) this.reloadActor(a);
        this.drive(a);
        if (selected) {
          const p = a.body.translation();
          const desired = Math.atan2(this.aim.x - p.x, this.aim.z - p.z);
          const diff = Math.atan2(
            Math.sin(desired - a.yaw),
            Math.cos(desired - a.yaw),
          );
          a.yaw += clamp(diff, -STEP * 9, STEP * 9);
        } else if (a.path[0]) {
          a.yaw = Math.atan2(
            a.path[0].x - a.body.translation().x,
            a.path[0].z - a.body.translation().z,
          );
        }
      } else if (a.kind === "moving" && this.time - a.hitTime > 0.8) {
        const p = a.body.translation(),
          vel = a.body.linvel();
        const desired =
          (a.spawn.x + Math.sin(this.time * 0.75) * 2.1 - p.x) * 2.4;
        a.body.applyImpulse(
          {
            x: clamp(desired - vel.x, -0.3, 0.3) * a.body.mass(),
            y: 0,
            z: clamp((a.spawn.z - p.z) * 2 - vel.z, -0.3, 0.3) * a.body.mass(),
          },
          true,
        );
      }
    }
    for (const p of this.props) {
      p.previous = vcopy(p.body.translation());
      p.previousRotation = { ...p.body.rotation() };
    }
    for (const g of this.grenades) {
      g.previous = vcopy(g.body.translation());
      g.lastVelocity = vcopy(g.body.linvel());
    }
    this.world.step();
    for (const g of [...this.grenades]) {
      g.fuse -= STEP;
      g.bounceWait -= STEP;
      const v = g.body.linvel();
      if (
        g.bounceWait <= 0 &&
        g.lastVelocity.y < -0.8 &&
        v.y > g.lastVelocity.y + 1.2
      ) {
        this.events.push({
          type: "bounce",
          position: vcopy(g.body.translation()),
        });
        g.bounceWait = 0.1;
      }
      if (g.fuse <= 0) this.explode(g);
    }
    this.checkDrills();
  }

  private drive(a: Actor) {
    const p = a.body.translation(),
      v = a.body.linvel();
    // Recover the assigned corner if another hull or an impact displaces an arrival.
    if (!a.path.length && a.moveTarget && distance2(p, a.moveTarget) > 0.15)
      a.path = findPath(
        p,
        a.moveTarget,
        this.navigationBoxes(),
        0.55,
        this.layout.bounds,
      );
    while (
      a.path.length &&
      distance2(p, a.path[0]) < (a.path.length === 1 ? 0.08 : 0.14)
    )
      a.path.shift();
    let dx = 0,
      dz = 0;
    if (a.path.length && !a.braced) {
      const target = a.path[0],
        distance = distance2(p, target) || 1;
      const speed = Math.min(a.firing ? 2.6 : 4.2, distance * 5);
      const forwardX = (target.x - p.x) / distance,
        forwardZ = (target.z - p.z) / distance;
      dx = forwardX * speed;
      dz = forwardZ * speed;
      ({ x: dx, z: dz } = this.walkVelocity(a, { x: dx, z: dz }));
    }
    // Finite acceleration preserves externally imparted velocity and permits lateral recovery.
    const acceleration = (a.braced ? 40 : 13) * (0.35 + a.stability * 0.65);
    const ix = dx - v.x,
      iz = dz - v.z,
      length = Math.hypot(ix, iz) || 1;
    const amount = Math.min(length, acceleration * STEP) * a.body.mass();
    if (p.y < 1.1)
      a.body.applyImpulse(
        { x: (ix / length) * amount, y: 0, z: (iz / length) * amount },
        true,
      );
  }

  private walkVelocity(a: Actor, preferred: Vec2): Vec2 {
    const BOUNDS = this.layout.bounds;
    const p = a.body.translation(),
      velocity = a.body.linvel();
    const speed = Math.hypot(preferred.x, preferred.z);
    const remaining = distance2(p, a.path[0]);
    const neighbours = this.actors
      .filter(
        (other) =>
          other !== a &&
          !other.dead &&
          distance2(p, other.body.translation()) < 5,
      )
      .map((other) => ({
        p: other.body.translation(),
        v: other.body.linvel(),
        player: other.kind === "player",
      }));
    if (!neighbours.length) return preferred;
    const boxes = this.navigationBoxes(false);
    let best: Vec2 = { x: 0, z: 0 },
      bestScore = speed * speed * 2.5;
    // A brief slow retreat can break a head-on jam when neither side can pass forwards.
    for (const scale of [1, 0.5])
      for (const angle of [
        0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90, 105, -105, 120,
        -120, 135, -135, 150, -150, 165, -165, 180,
      ]) {
        const radians = (angle * Math.PI) / 180;
        const candidate = {
          x:
            (preferred.x * Math.cos(radians) -
              preferred.z * Math.sin(radians)) *
            scale,
          z:
            (preferred.x * Math.sin(radians) +
              preferred.z * Math.cos(radians)) *
            scale,
        };
        // Predict only as far as this turn; the controller brakes and changes direction there.
        const horizon = Math.min(0.65, remaining / (speed * scale));
        const next = {
          x: p.x + candidate.x * Math.min(0.5, horizon),
          z: p.z + candidate.z * Math.min(0.5, horizon),
        };
        if (
          next.x < BOUNDS.left + 0.37 ||
          next.x > BOUNDS.right - 0.37 ||
          next.z < BOUNDS.back + 0.37 ||
          next.z > BOUNDS.front - 0.37 ||
          !segmentClear(p, next, boxes, 0.36)
        )
          continue;
        if (
          neighbours.some((other) => {
            const q = other.p,
              v = other.v;
            const rx = q.x - p.x,
              rz = q.z - p.z,
              vx = candidate.x - v.x,
              vz = candidate.z - v.z;
            const approach = rx * vx + rz * vz;
            if (approach <= 0) return false;
            // Targets have rectangular feet; a circular buffer can block a clear route corner.
            if (!other.player)
              return !segmentClear(
                { x: -rx, z: -rz },
                { x: -rx + vx * horizon, z: -rz + vz * horizon },
                [
                  {
                    x: 0,
                    z: 0,
                    w: this.range === "long" ? 0.6 : 0.96,
                    d: this.range === "long" ? 0.96 : 0.6,
                  },
                ],
                0.4,
              );
            const t = clamp(approach / (vx * vx + vz * vz || 1), 0, horizon);
            return Math.hypot(rx - vx * t, rz - vz * t) < 0.9;
          })
        )
          continue;
        const score =
          (candidate.x - preferred.x) ** 2 +
          (candidate.z - preferred.z) ** 2 +
          0.05 *
            ((candidate.x - velocity.x) ** 2 +
              (candidate.z - velocity.z) ** 2) +
          (angle < 0 ? 0.01 : 0);
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    return best;
  }

  private checkDrills() {
    const plates = this.actors.filter((a) => a.kind === "plate"),
      blast = this.actors.filter((a) => a.kind === "blast"),
      precision = this.actors.filter((a) => a.kind === "precision");
    const checks = {
      gun:
        plates.length > 0 &&
        plates.every((a) => a.dead && a.killedBy === "gun"),
      impulse: this.maxDisplacement >= 2,
      grenade:
        blast.length > 0 &&
        blast.every((a) => a.dead && a.killedBy === "grenade"),
      rifle:
        precision.length > 0 &&
        precision.every((a) => a.dead && a.killedBy === "rifle"),
    };
    const messages = {
      gun: "Firing drill complete. Six targets down.",
      impulse: "Displacement drill complete. Two metres of ground gained.",
      grenade: "Grenade bay cleared. Blast drill complete.",
      rifle: "Long-range drill complete. Three precision targets down.",
    };
    for (const key of ["gun", "impulse", "grenade", "rifle"] as const)
      if (checks[key] && !this.drill[key]) {
        this.drill[key] = true;
        this.events.push({ type: "drill", message: messages[key] });
      }
  }

  inspect() {
    return {
      range: this.range,
      aim: vcopy(this.aim),
      time: this.time,
      shots: this.shots,
      hits: this.hits,
      throws: this.throws,
      grenadeHits: this.grenadeHits,
      grenadeThrower: this.grenadeThrower?.id ?? null,
      grenadeCooldown: this.grenadeCooldown,
      destroyed: this.destroyed,
      maxDisplacement: this.maxDisplacement,
      drills: { ...this.drill },
      weapon: this.weapon,
      sniping: this.sniping,
      selected: [...this.selected],
      grenades: this.grenades.map((g) => ({
        id: g.id,
        owner: g.owner,
        fuse: g.fuse,
        position: vcopy(g.body.translation()),
      })),
      actors: this.actors.map((a) => ({
        id: a.id,
        kind: a.kind,
        model: a.model,
        hp: a.hp,
        maxHp: a.maxHp,
        stability: a.stability,
        killedBy: a.killedBy,
        ammo: a.ammo,
        reload: a.reload,
        grenadeCooldown: a.grenadeCooldown,
        braced: a.braced,
        braceProgress: a.braceTime / RIFLE.settle,
        shotWait: Math.max(0, a.shotWait),
        position: vcopy(a.body.translation()),
        path: a.path.map((v) => ({ ...v })),
        destination: a.moveTarget ? { ...a.moveTarget } : null,
      })),
    };
  }
}
