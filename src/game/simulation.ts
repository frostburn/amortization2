import RAPIER from "@dimforge/rapier3d-compat";
import {
  BLAST_RADIUS,
  AUTOMATIC_AIM,
  FIREARMS,
  FRIENDLY_FIRE,
  FORMATION_SPACING,
  GRAVITY,
  GRENADE_COOLDOWN,
  GRENADE_FUSE,
  PISTOL,
  MINIGUN,
  KINETIC,
  STAGGER,
  RIFLE,
  ROBOT_MODELS,
  STEP,
  HUMAN,
  clamp,
  distance2,
  grenadeVelocity,
  type Vec2,
  type Vec3,
  type RobotModel,
  type Weapon,
  type Firearm,
} from "./config";
import { CityLife } from "./civilians";
import { SecurityResponse, WATCH, type SecurityFlight } from "./security";
import { vehicleFootprint } from "./traffic";
import { dryGround } from "./city";
import { NavigationGrid, segmentClear } from "./navigation";
import { WalkTerrain, SurfaceNavigation, surfacePrism } from "./walk-surfaces";
import { RANGES, type RangeId, type TargetKind } from "./ranges";
import { ArenaCombat } from "./arena";
import { alertEnemies, type EnemyBrain } from "./enemies";
import { ReceivingMission, type Mission, type Contact } from "./missions";
import { CrossingMission } from "./crossing-mission";
import { HandlingMission } from "./handling-mission";
import { EscortMission } from "./escort-mission";
import { PriorityMission } from "./priority-mission";
import { RecoveryMission } from "./recovery-mission";
import type { HumanEscort } from "./human-escort";
import type { SquadHauling } from "./hauling";
import type { ReplayAction } from "./replay";
import { manualFire, orderCoverFire, startCoverFire, stopCoverFire, updateCoverFire, type CoverBrain } from "./cover";

export type ActorKind = "player" | "enemy" | "human" | TargetKind;
export interface Actor {
  id: number;
  kind: ActorKind;
  model: RobotModel | null;
  weapon: Firearm;
  weapons: readonly Weapon[];
  pistol: { ammo: number; reload: number; shotWait: number };
  ai?: EnemyBrain;
  flight?: SecurityFlight;
  cover?: CoverBrain;
  /** Cargo work assignment, including the walk to the grip. */
  haul?: number;
  escort?: number;
  human?: { name: string; coat: number; trim: number; hair: number; glasses?: boolean };
  deathTime?: number;
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
  spin: number;
  spooling: boolean;
  braced: boolean;
  braceTime: number;
  path: Vec2[];
  moveTarget?: Vec2;
  replanAt?: number;
  hitTime: number;
  stagger: number;
  staggerDuration: number;
  staggerGrace: number;
  knockback: Vec2;
  dead: boolean;
  recoil: number;
  previous: Vec3;
  previousRotation: { x: number; y: number; z: number; w: number };
  killedBy?: Weapon | "vehicle";
}
export interface Prop {
  id: number;
  body: RAPIER.RigidBody;
  w: number;
  h: number;
  d: number;
  style?: "tote" | "parcel" | "chest" | "equipment";
  previous: Vec3;
  previousRotation: { x: number; y: number; z: number; w: number };
}
export interface Grenade {
  id: number;
  body: RAPIER.RigidBody;
  fuse: number;
  owner: number;
  team: "player" | "enemy";
  previous: Vec3;
  bounceWait: number;
  lastVelocity: Vec3;
}
export type GameEvent =
  | {
      type: "shot";
      actor: number;
      weapon: Firearm;
      from: Vec3;
      to: Vec3;
      hit: boolean;
      impact: boolean;
      material: "metal" | "concrete" | "glass" | "soft";
      normal: Vec3;
    }
  | { type: "explosion"; position: Vec3; affected: number; team: "player" | "enemy" | "neutral"; vehicle?: number }
  | { type: "security"; phase: "dispatch" | "arrival" | "standdown"; position: Vec3; level: number }
  | { type: "bridge"; phase: "alarm" | "collapse"; position: Vec3 }
  | { type: "glass"; position: Vec3; normal: Vec3 }
  | { type: "cargo"; phase: "lift" | "drop" | "accept"; position: Vec3; heavy: boolean }
  | {
      type: "throw" | "bounce" | "reload" | "empty" | "down";
      position: Vec3;
      actor?: number;
      weapon?: Firearm;
    }
  | { type: "drill" | "wave"; message: string }
  | { type: "comms"; speaker: Contact; message: string };

const vcopy = (v: Vec3): Vec3 => ({ x: v.x, y: v.y, z: v.z });
export type MoveDestination = { actor: number; position: Vec2 };

export class Simulation {
  /** Optional development observers. Normal builds never attach a recorder. */
  onInput?: (action: ReplayAction) => void;
  onReset?: (phase: "before" | "after") => void;
  world!: RAPIER.World;
  actors: Actor[] = [];
  props: Prop[] = [];
  private lowCover = new Set<number>();
  grenades: Grenade[] = [];
  events: GameEvent[] = [];
  selected = new Set([1]);
  aim: Vec3 = { x: -14, y: 1.2, z: -8 };
  trigger = false;
  sniping = false;
  weapon: Weapon = "gun";
  range: RangeId;
  fourthModel: RobotModel;
  arena?: ArenaCombat;
  mission?: Mission;
  hauling?: SquadHauling;
  escort?: HumanEscort;
  city?: CityLife;
  terrain?: WalkTerrain;
  readonly surfaceColliders = new Map<number, string>();
  security?: SecurityResponse;
  time = 0;
  shots = 0;
  hits = 0;
  coverShots = 0;
  coverHits = 0;
  throws = 0;
  grenadeHits = 0;
  maxDisplacement = 0;
  drill = { gun: false, impulse: false, grenade: false, rifle: false };
  private lastGrenadier = 0;
  private rifleAim?: Vec3;
  private randomState = 1729;
  private nextId = 100;
  private navigation!: NavigationGrid | SurfaceNavigation;

  static async create(range: RangeId = "proving", fourthModel: RobotModel = "sniper") {
    await RAPIER.init();
    return new Simulation(range, fourthModel);
  }
  private constructor(range: RangeId, fourthModel: RobotModel) {
    this.range = range;
    this.fourthModel = fourthModel;
    this.reset();
  }
  get pistolsOnly() { return !!this.layout.pistolsOnly; }

  get layout() {
    return RANGES[this.range];
  }

  reset(range: RangeId = this.range, fourthModel: RobotModel = this.fourthModel) {
    this.onReset?.("before");
    this.range = range;
    this.fourthModel = fourthModel;
    this.mission = undefined;
    this.hauling = undefined;
    this.escort = undefined;
    this.security = undefined;
    this.terrain = this.layout.walkSurfaces ? new WalkTerrain(this.layout.walkSurfaces,
      this.layout.walkVolumes ?? [], [...this.layout.barriers, ...this.layout.platforms], this.layout.bounds) : undefined;
    this.navigation = this.terrain ? new SurfaceNavigation(this.terrain)
      : new NavigationGrid([...this.layout.barriers, ...this.layout.platforms], 0.55, this.layout.bounds);
    this.world?.free();
    this.world = new RAPIER.World({ x: 0, y: -GRAVITY, z: 0 });
    this.world.timestep = STEP;
    this.actors = [];
    this.props = [];
    this.lowCover.clear();
    this.surfaceColliders.clear();
    this.grenades = [];
    this.events = [];
    this.selected = new Set((range === "arena" || this.layout.city) ? [1, 2, 3, 4] : [range === "long" ? 4 : 1]);
    this.trigger = false;
    this.sniping = false;
    this.weapon = this.pistolsOnly ? "pistol" : range === "long" ? ROBOT_MODELS[fourthModel].weapon : "gun";
    this.aim =
      range === "long" ? { x: 58, y: 3.25, z: 0 }
        : range === "arena" ? { x: 0, y: 1.25, z: -14 }
        : { x: -14, y: 1.25, z: -8 };
    this.rifleAim = undefined;
    this.time = 0;
    this.shots = 0;
    this.hits = 0;
    this.coverShots = 0;
    this.coverHits = 0;
    this.throws = 0;
    this.grenadeHits = 0;
    this.maxDisplacement = 0;
    this.lastGrenadier = 0;
    this.randomState = 1729;
    this.nextId = 100;
    this.drill = { gun: false, impulse: false, grenade: false, rifle: false };
    const bounds = this.layout.bounds;
    const extent = { left: bounds.left - 24, right: bounds.right + 24, back: bounds.back - 24, front: bounds.front + 24 };
    for (const piece of dryGround(extent, this.layout.city?.water ?? [])) {
      const floor = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(
        (piece.left + piece.right) / 2, -0.5, (piece.back + piece.front) / 2));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid((piece.right - piece.left) / 2, 0.5,
        (piece.front - piece.back) / 2).setFriction(0.8), floor);
    }
    for (const water of this.layout.city?.water ?? []) if (water.harbor) {
      const bed = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(water.x, water.harbor.bed - 0.5, water.z));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(water.w / 2, 0.5, water.d / 2).setFriction(0.8), bed);
    }
    for (const box of [...this.layout.barriers, ...this.layout.platforms]) {
      if (box.navigationOnly || box.building) continue;
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.fixed().setTranslation(box.x, (box.y ?? 0) + box.h / 2, box.z),
      );
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(box.w / 2, box.h / 2, box.d / 2).setFriction(
          0.8,
        ),
        body,
      );
      if ((box.y ?? 0) + box.h < AUTOMATIC_AIM.height)
        this.lowCover.add(collider.handle);
    }
    for (const surface of [...this.layout.walkSurfaces ?? [], ...this.layout.walkVolumes ?? []]) {
      const mesh = surfacePrism(surface), body = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
      const collider = this.world.createCollider(RAPIER.ColliderDesc.trimesh(mesh.vertices, mesh.indices).setFriction(0.65), body);
      if (this.layout.walkSurfaces?.includes(surface)) this.surfaceColliders.set(collider.handle, surface.id);
      // Parapets are low cover relative to their deck. The assisted line must
      // still clear their actual geometry; the deck itself never qualifies.
      else if (surface.thickness < AUTOMATIC_AIM.height) this.lowCover.add(collider.handle);
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
        style: p.style,
        body,
        w: p.w,
        h: p.h,
        d: p.d,
        previous: vcopy(body.translation()),
        previousRotation: { ...body.rotation() },
      });
    }
    this.city = this.layout.city ? new CityLife(this, this.layout.city) : undefined;
    this.mission = range === "receiving" ? new ReceivingMission(this) : range === "crossing" ? new CrossingMission(this) : range === "handling" ? new HandlingMission(this) : range === "escort" ? new EscortMission(this) : range === "priority" ? new PriorityMission(this) : range === "recovery" ? new RecoveryMission(this) : undefined;
    this.security = this.city ? new SecurityResponse(this) : undefined;
    // Populate scene-query acceleration structures before the first input event.
    this.world.step();
    this.arena = range === "arena" ? new ArenaCombat(this) : undefined;
    this.onReset?.("after");
  }

  private addActor(
    id: number,
    kind: ActorKind,
    x: number,
    z: number,
    elevation = 0,
    enemyModel?: RobotModel,
  ) {
    const player = kind === "player";
    const robot = player || kind === "enemy";
    const model: RobotModel | null = robot
      ? enemyModel ?? (this.pistolsOnly ? "assault" : id === 4 || (id === 2 && this.fourthModel === "minigunner")
        ? this.fourthModel
        : "assault")
      : null;
    const yaw =
      this.range === "long"
        ? player
          ? Math.PI / 2
          : -Math.PI / 2
        : player
          ? Math.PI
          : 0;
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, elevation + 0.98, z)
        .setRotation({
          x: 0,
          y: Math.sin(yaw / 2),
          z: 0,
          w: Math.cos(yaw / 2),
        })
        .lockRotations()
        .setLinearDamping(robot ? 0.3 : 1.5)
        .setAngularDamping(5)
        .setCcdEnabled(true),
    );
    const shape = robot
      ? RAPIER.ColliderDesc.capsule(0.56, 0.37)
      : RAPIER.ColliderDesc.cuboid(0.48, 0.96, 0.3);
    const collider = this.world.createCollider(
      shape
        .setMass(model ? ROBOT_MODELS[model].mass : kind === "plate" ? 90 : 48)
        .setFriction(robot ? 0.3 : 0.42)
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
    const actor: Actor = {
      id,
      kind,
      model,
      weapon: this.pistolsOnly ? "pistol" : model ? ROBOT_MODELS[model].weapon : "gun",
      weapons: this.pistolsOnly ? ["pistol"] : model ? ROBOT_MODELS[model].weapons : [],
      pistol: { ammo: this.pistolsOnly || model === "sniper" ? PISTOL.magazine : 0, reload: 0, shotWait: 0 },
      body,
      collider,
      spawn: { x, y: elevation + 0.98, z },
      hp,
      maxHp: hp,
      stability: 1,
      yaw,
      ammo: this.pistolsOnly ? 0 : FIREARMS[model ? ROBOT_MODELS[model].weapon : "gun"].magazine,
      reload: 0,
      grenadeCooldown: 0,
      shotWait: 0,
      firing: false,
      spin: 0,
      spooling: false,
      braced: false,
      braceTime: 0,
      path: [],
      hitTime: -10,
      stagger: 0,
      staggerDuration: 0,
      staggerGrace: 0,
      knockback: { x: 0, z: 0 },
      dead: false,
      recoil: 0,
      previous: { x, y: elevation + 0.98, z },
      previousRotation: { ...body.rotation() },
    };
    this.actors.push(actor);
    return actor;
  }

  addEnemy(model: RobotModel, position: Vec2) {
    return this.addActor(this.nextId++, "enemy", position.x, position.z, position.y ?? 0, model);
  }
  addHuman(position: Vec2, appearance?: Actor["human"]) {
    const a = this.addActor(this.nextId++, "human", position.x, position.z);
    this.world.removeCollider(a.collider, true);
    a.collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(HUMAN.height / 2 - HUMAN.radius, HUMAN.radius)
      .setMass(HUMAN.mass).setFriction(.3).setRestitution(0), a.body);
    a.body.setTranslation({ ...position, y: HUMAN.height / 2 }, true);
    a.spawn = a.previous = { ...a.body.translation() };
    a.human = appearance;
    a.hp = a.maxHp = HUMAN.hp;
    a.weapons = []; a.ammo = a.pistol.ammo = 0;
    return a;
  }
  addSecurityDrone(position: Vec3) {
    const a = this.addActor(this.nextId++, "enemy", position.x, position.z, position.y - .98, "assault");
    this.world.removeCollider(a.collider, true);
    a.collider = this.world.createCollider(RAPIER.ColliderDesc.cylinder(WATCH.halfHeight, WATCH.radius)
      .setMass(WATCH.mass).setFriction(.6).setRestitution(.08), a.body);
    a.body.setLinearDamping(.12);
    a.weapon = "pistol"; a.weapons = ["pistol"];
    a.pistol.ammo = PISTOL.magazine;
    a.hp = a.maxHp = WATCH.hp;
    return a;
  }
  retireEnemy(actor: Actor) {
    if (actor.kind !== "enemy") return;
    this.world.removeRigidBody(actor.body);
    this.actors = this.actors.filter((a) => a !== actor);
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
  ammunition(a: Actor, weapon: Firearm = a.weapon) {
    return weapon === "pistol" ? a.pistol : a;
  }
  magazine(a: Actor, weapon: Firearm = a.weapon) {
    return FIREARMS[weapon].magazine;
  }
  reloadDuration(a: Actor, weapon: Firearm = a.weapon) {
    return FIREARMS[weapon].reload;
  }
  supports(a: Actor, weapon: Weapon) {
    return a.weapons.includes(weapon);
  }
  followsOrder(a: Actor, weapon: Weapon) {
    return weapon === "gun" || weapon === "minigun"
      ? this.supports(a, "gun") || this.supports(a, "minigun")
      : this.supports(a, weapon);
  }
  get closeWeapon(): Firearm {
    if (this.pistolsOnly) return "pistol";
    return this.weapon === "pistol" && this.canUse("pistol") ? "pistol" : this.closeWeapons[0] ?? "gun";
  }
  get closeWeapons(): Firearm[] {
    return (["minigun", "gun", "pistol"] as const).filter((weapon) => this.canUse(weapon) &&
      (weapon !== "gun" || !this.canUse("minigun")));
  }
  get nextCloseWeapon(): Firearm {
    const close = this.closeWeapons;
    const index = close.indexOf(this.weapon === "gun" && this.canUse("minigun") ? "minigun" : this.weapon as Firearm);
    return close[(index + 1) % close.length] ?? "gun";
  }
  canUse(weapon: Weapon) {
    return this.active.some((a) => this.supports(a, weapon));
  }
  chooseWeapon(weapon: Weapon) {
    if (!this.canUse(weapon)) return false;
    this.onInput?.({ type: "weapon", weapon });
    if (weapon !== "rifle") this.endSniping();
    if (this.weapon === "rifle") this.rifleAim = vcopy(this.aim);
    if (weapon === "rifle" && this.rifleAim) this.aim = vcopy(this.rifleAim);
    this.weapon = weapon;
    if (weapon !== "grenade")
      for (const a of this.active)
        if (this.followsOrder(a, weapon))
          a.weapon = weapon === "gun" || weapon === "minigun" ? ROBOT_MODELS[a.model!].weapon : weapon;
    this.trigger = false;
    for (const a of this.squad) {
      a.firing = false;
      a.spin = 0;
      a.spooling = false;
    }
    return true;
  }
  private matchWeapon() {
    if (
      !this.canUse(this.weapon) &&
      this.active.length
    )
      this.chooseWeapon(this.pistolsOnly ? "pistol" : ROBOT_MODELS[this.primary.model!].weapon);
  }
  get grenadeThrower(): Actor | undefined {
    const ready = this.active.filter((a) => this.supports(a, "grenade") && a.grenadeCooldown === 0 && !this.isDisrupted(a));
    return ready.find((a) => a.id > this.lastGrenadier) ?? ready[0];
  }
  get grenadeCooldown() {
    const active = this.active.filter((a) => this.supports(a, "grenade"));
    return active.length
      ? Math.min(...active.map((a) => Math.max(a.grenadeCooldown, a.stagger / (a.braced ? STAGGER.bracedRecovery : 1))))
      : 0;
  }
  get destroyed() {
    return this.actors.filter((a) => a.kind !== "player" && a.dead).length;
  }

  select(id: number, additive = false) {
    if (id !== 5 && !this.squad.some(a => a.id === id && !a.dead)) return;
    this.onInput?.({ type: "select", id, additive });
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
    this.onInput?.({ type: "group", ids: [...ids] });
    const living = this.squad.filter((a) => !a.dead && ids.includes(a.id));
    // An empty box leaves the current group available for the next command.
    if (living.length) this.selected = new Set(living.map((a) => a.id));
    this.release();
    this.matchWeapon();
  }

  release() {
    this.onInput?.({ type: "release" });
    this.trigger = false;
    this.endSniping();
    for (const a of this.squad) {
      a.firing = false;
      a.spin = 0;
      a.spooling = false;
      if (a.cover?.mode !== "sector") {
        a.braced = false;
        a.braceTime = 0;
      }
    }
  }
  setBrace(braced: boolean) {
    this.onInput?.({ type: "brace", enabled: braced });
    if (!braced) this.endSniping();
    for (const a of this.active) {
      const enabled = braced || a.cover?.mode === "sector";
      if (a.braced !== enabled) a.braceTime = 0;
      a.braced = enabled;
    }
  }
  coverSector(point: Vec2) {
    if (this.mission?.stopped) return;
    this.onInput?.({ type: "cover", point: { ...point } });
    this.endSniping();
    this.trigger = false;
    orderCoverFire(this, point);
  }
  ceasefire() {
    if (this.mission?.stopped) return;
    this.onInput?.({ type: "ceasefire" });
    this.endSniping();
    this.trigger = false;
    for (const a of this.active) {
      a.cover = undefined;
      a.firing = a.spooling = a.braced = false;
      a.braceTime = 0;
    }
  }
  toggleSniping() {
    if (this.sniping) {
      this.endSniping();
      return false;
    }
    const operator = this.weapon === "rifle" && this.rifleOperator;
    if (!operator) return false;
    this.onInput?.({ type: "scope", enabled: true });
    this.sniping = true;
    this.trigger = false;
    operator.firing = false;
    if (operator.cover) operator.cover.fire = false;
    operator.braced = true;
    operator.braceTime = 0;
    startCoverFire(this, operator);
    return true;
  }
  endSniping() {
    if (!this.sniping) return;
    this.onInput?.({ type: "scope", enabled: false });
    this.sniping = false;
    this.trigger = false;
    stopCoverFire(this);
    const operator = this.squad.find((a) => a.model === "sniper");
    if (operator) {
      operator.braced = operator.cover?.mode === "sector";
      operator.braceTime = 0;
      operator.firing = false;
    }
  }
  private navigationBoxes(includeTargets = true) {
    return [
      ...this.layout.barriers,
      ...this.layout.platforms,
      ...this.dynamicNavigationBoxes(includeTargets),
    ];
  }
  private dynamicNavigationBoxes(includeTargets = true, actor?: Actor) {
    return [
      ...(this.city?.vehicles ?? []).filter(c => !c.hp || c.driveHp === 0 || c.state === "stranded").map(vehicleFootprint),
      ...(this.mission?.obstacles ?? []),
      ...this.props.filter(p => p.body.isEnabled() && (!actor || p.id !== actor.haul || this.hauling?.loadFor(actor)?.state === "approaching")).map((p) => ({
        x: p.body.translation().x,
        z: p.body.translation().z,
        w: p.w,
        d: p.d,
        y: p.body.translation().y - p.h / 2, h: p.h,
      })),
      ...(includeTargets
        ? this.actors
            .filter((a) => !a.model && a.kind !== "human" && !a.dead)
            .map((a) => ({
              x: a.body.translation().x,
              z: a.body.translation().z,
              w: this.range === "long" ? 0.6 : 0.96,
              d: this.range === "long" ? 0.96 : 0.6,
              y: a.body.translation().y - .96, h: 1.92,
            }))
        : []),
    ];
  }

  moveDestinations(point: Vec2): MoveDestination[] {
    const active = this.active;
    if (!active.length) return [];
    const hauling = this.hauling?.destinations(point);
    if (hauling) return hauling;
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
    const requestedHeight = this.terrain?.resolve({ ...requested, y: point.y }).y;
    const boxes = this.navigationBoxes();
    const dynamic = this.terrain ? this.dynamicNavigationBoxes() : [];
    const free = (p: Vec2) => {
      if (this.terrain) {
        const center = this.terrain.resolve({ ...p, y: requestedHeight });
        return Math.abs(center.y - requestedHeight!) < .6 && offsets.every(offset => {
          const slot = this.terrain!.resolve({ x: p.x + offset.x, z: p.z + offset.z, y: center.y });
          return Math.abs(slot.y - center.y) <= Math.hypot(offset.x, offset.z) * .3 + .05 &&
            this.terrain!.canStand(slot, .55, dynamic);
        });
      }
      return boxes.every(
        (b) =>
          Math.abs(p.x - b.x) >= b.w / 2 + extentX + 0.55 ||
          Math.abs(p.z - b.z) >= b.d / 2 + extentZ + 0.55,
      );
    };
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
      for (const s of this.layout.walkSurfaces ?? []) {
        xs.add(s.x); zs.add(s.z);
        for (const sign of [-1, 1]) {
          xs.add(clamp(s.x + sign * (s.w / 2 - extentX - .75), minX, maxX));
          zs.add(clamp(s.z + sign * (s.d / 2 - extentZ - .75), minZ, maxZ));
        }
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
      position: this.terrain ? this.terrain.resolve({ x: center.x + offsets[i].x,
        z: center.z + offsets[i].z, y: requestedHeight }) : { x: center.x + offsets[i].x, z: center.z + offsets[i].z },
    }));
  }

  move(point: Vec2, queue = false) {
    if (this.mission?.stopped) return;
    this.onInput?.({ type: "move", point: { ...point }, queued: queue });
    this.endSniping();
    for (const load of this.hauling?.loads ?? []) {
      if (!load.carriers.some(a => this.selected.has(a.id))) continue;
      this.hauling!.move(load, point, queue);
    }
    for (const target of this.moveDestinations(point)) {
      const actor = this.actors.find((a) => a.id === target.actor)!;
      if (actor.haul) continue;
      actor.escort = this.hauling?.loads.find(l => l.carriers.some(a => this.selected.has(a.id)))?.prop.id;
      actor.cover = undefined;
      actor.braced = false;
      actor.braceTime = 0;
      this.navigate(actor, target.position, queue);
    }
  }
  navigate(actor: Actor, point: Vec2, queue = false, bridgePass = false) {
    const current = this.walkingPoint(actor);
    const start = queue ? this.mission?.bridge?.queuedGoal(actor) ?? actor.path.at(-1) ?? current : current;
    const path = this.navigation.findPath(start, point, this.dynamicNavigationBoxes(true, actor));
    if (!bridgePass && this.mission?.bridge?.route(actor, path, queue)) return;
    actor.replanAt = this.time;
    actor.moveTarget = path.at(-1);
    actor.path = queue ? [...actor.path, ...path] : path;
  }

  walkingPoint(actor: Actor): Vec3 {
    const p = actor.body.translation();
    return { x: p.x, y: p.y - (actor.kind === "human" ? HUMAN.height / 2 : .93), z: p.z };
  }
  walkingHeight(point: Vec2) { return this.terrain?.resolve(point).y ?? 0; }

  haulCargo(id?: number) { return this.hauling?.command(id) ?? null; }
  escortHuman() { return this.escort?.command() ?? null; }

  reloadSelected() {
    this.onInput?.({ type: "reload" });
    for (const a of this.active) {
      if (this.weapon !== "grenade" && !this.followsOrder(a, this.weapon)) continue;
      const weapon = this.weapon === "grenade" || this.weapon === "gun" || this.weapon === "minigun" ? a.weapon : this.weapon;
      if (this.supports(a, weapon)) this.reloadActor(a, weapon);
    }
  }
  reloadActor(a: Actor, weapon: Firearm = a.weapon) {
    if (!this.supports(a, weapon)) return;
    const state = this.ammunition(a, weapon);
    if (state.reload > 0 || state.ammo === this.magazine(a, weapon) || a.dead) return;
    state.reload = this.reloadDuration(a, weapon);
    a.firing = false;
    a.spooling = false;
    this.events.push({
      type: "reload",
      actor: a.id,
      weapon,
      position: vcopy(a.body.translation()),
    });
  }

  actorAim(a: Actor): Vec3 {
    if (manualFire(this, a) ||
        this.sniping && a === this.rifleOperator) return this.aim;
    return a.cover?.aim ?? a.ai?.aim ?? this.aim;
  }

  /** Raise a player's low aim only when static low cover actually obstructs
   * the intended point and the assisted line clears it. */
  clearsLowCover(a: Actor, aim: Vec3, raised: Vec3) {
    const from = this.muzzle(a, aim), direct = this.fireRay(a, from, aim);
    if (!direct || !this.lowCover.has(direct.collider.handle) ||
      direct.timeOfImpact >= Math.hypot(aim.x - from.x, aim.y - from.y, aim.z - from.z) - 0.05) return false;
    const upper = this.muzzle(a, raised), hit = this.fireRay(a, upper, raised);
    return !hit || hit.timeOfImpact >= Math.hypot(raised.x - upper.x, raised.y - upper.y, raised.z - upper.z) - 0.05 ||
      this.actors.some(target => !target.dead && target.collider.handle === hit.collider.handle);
  }
  muzzle(a: Actor, toward: Vec3 = this.actorAim(a), weapon: Firearm = a.weapon): Vec3 {
    const p = a.body.translation();
    if (a.flight) {
      const dy = toward.y - p.y + .28, dx = toward.x - p.x, dz = toward.z - p.z;
      const length = Math.hypot(dx, dy, dz) || 1;
      return { x: p.x + dx / length * .65, y: p.y - .28 + dy / length * .65, z: p.z + dz / length * .65 };
    }
    const dx = toward.x - p.x,
      dz = toward.z - p.z,
      length = Math.hypot(dx, dz) || 1;
    const reach = FIREARMS[weapon].muzzle;
    const dy = toward.y - p.y - 0.42;
    const pitchedLength = Math.hypot(dx, dy, dz) || 1;
    return {
      x: p.x + (dx / pitchedLength) * reach + (dz / length) * 0.27,
      y: p.y + 0.42 + (dy / pitchedLength) * reach,
      z: p.z + (dz / pitchedLength) * reach - (dx / length) * 0.27,
    };
  }

  /** Nominal firearm line before spread, clipped by cover and weapon reach. */
  aimTrace(a: Actor) {
    const from = this.muzzle(a);
    const aim = this.actorAim(a);
    const dx = aim.x - from.x,
      dy = aim.y - from.y,
      dz = aim.z - from.z;
    const length = Math.hypot(dx, dy, dz) || 1;
    const reach = Math.min(length, FIREARMS[a.weapon].range);
    const end = {
      x: from.x + (dx / length) * reach,
      y: from.y + (dy / length) * reach,
      z: from.z + (dz / length) * reach,
    };
    const hit = this.fireRay(a, from, end);
    const distance = hit?.timeOfImpact ?? reach;
    return {
      from,
      to: {
        x: from.x + (dx / length) * distance,
        y: from.y + (dy / length) * distance,
        z: from.z + (dz / length) * distance,
      },
    };
  }

  team(a: Actor) {
    return a.kind === "player" || a.kind === "human" ? "player" : "enemy";
  }

  /** Preview, optical aim and shots share the equipped weapon's friendly-fire policy. */
  fireRay(a: Actor, from: Vec3, to: Vec3, weapon: Firearm = a.weapon) {
    if (FRIENDLY_FIRE[weapon]) return this.ray(from, to, a.body);
    const allies = new Set(this.actors.filter((other) => this.team(other) === this.team(a)).map((other) => other.collider.handle));
    return this.ray(from, to, a.body, (collider) => !allies.has(collider.handle));
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
      ? (1 - clamp(a.braceTime / RIFLE.settle, 0, 1)) * 0.024
      : 0.04 + a.recoil * 0.055 + (1 - a.stability) * 0.02;
  }

  // Settling, recoil and stability affect the shot around the fixed sight line.
  rifleDirection(a: Actor, toward: Vec3 = this.actorAim(a)): Vec3 {
    const from = this.muzzle(a),
      dx = toward.x - from.x,
      dy = toward.y - from.y,
      dz = toward.z - from.z;
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

  shoot(a: Actor, weapon: Firearm = a.weapon) {
    if (this.mission?.stopped) return;
    const state = this.ammunition(a, weapon);
    if (a.dead || a.haul || this.isDisrupted(a) || state.ammo <= 0 || state.reload > 0 || state.shotWait > 0 || (weapon === "minigun" && a.spin < 1)) return;
    const covering = a.kind === "player" && !!a.cover && !manualFire(this, a);
    const automaticOrder = (this.weapon === "gun" || this.weapon === "minigun") &&
      (weapon === "gun" || weapon === "minigun");
    if (!this.supports(a, weapon) || (a.kind === "player" && !covering &&
      this.weapon !== weapon && !automaticOrder)) return;
    const spec = FIREARMS[weapon], rifle = weapon === "rifle", pistol = weapon === "pistol";
    const aim = this.actorAim(a);
    const from = this.muzzle(a, aim, weapon);
    // Recheck at the shot, not just the next AI think: civilians can cross a
    // lane and targets can duck behind scenery between acquisition ticks.
    if (covering) {
      const target = this.actors.find(target => target.id === a.cover!.target && !target.dead);
      if (!target || this.fireRay(a, from, aim, weapon)?.collider.handle !== target.collider.handle) return;
    }
    const delta = {
      x: aim.x - from.x,
      y: aim.y - from.y,
      z: aim.z - from.z,
    };
    const length = Math.hypot(delta.x, delta.y, delta.z) || 1;
    const speed = Math.hypot(a.body.linvel().x, a.body.linvel().z);
    const spread = a.braced ? 0 : (0.005 + a.recoil * 0.005 + (a.path.length ? 0.006 : 0))
      + Math.min(0.006, speed * 0.001)
      + (a.kind === "enemy" ? 0.012 : pistol ? 0.004 : weapon === "minigun" && !a.braced ? 0.006 : 0);
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
    const hit = this.fireRay(a, from, {
      x: from.x + dir.x * spec.range,
      y: from.y + dir.y * spec.range,
      z: from.z + dir.z * spec.range,
    }, weapon);
    const distance = hit?.timeOfImpact ?? spec.range;
    const to = {
      x: from.x + dir.x * distance,
      y: from.y + dir.y * distance,
      z: from.z + dir.z * distance,
    };
    const target =
      hit && this.actors.find((t) => t.collider.handle === hit.collider.handle);
    const hitOpponent = !!target && !target.dead && this.team(target) !== this.team(a);
    const glass = !!hit && !!this.city?.windows.hit(hit.collider.handle, to, hit.normal);
    const fixture = !!hit && !glass && !!this.mission?.damageFixture(hit.collider.handle, spec.damage);
    if (!glass && !fixture && target && !target.dead) {
      if (a.kind === "player" && target.kind === "enemy") alertEnemies(this, this.walkingPoint(a));
      this.damage(
        target,
        spec.damage,
        {
          x: dir.x * KINETIC.impulse[weapon],
          y: dir.y * (rifle ? 24 : pistol ? 6 : 12),
          z: dir.z * KINETIC.impulse[weapon],
        },
        to,
        weapon,
        this.team(a),
      );
      if (a.kind === "player" && hitOpponent) {
        if (covering) this.coverHits++;
        else this.hits++;
      }
    } else if (!glass && !fixture && hit && this.city?.neutral(hit.collider.handle)) {
      const cart = this.city.neutral(hit.collider.handle)!;
      const strength = KINETIC.impulse[weapon] * (rifle ? 1.5 : 1);
      if (!("path" in cart && cart.team === "enemy" && this.team(a) === "enemy" && !FRIENDLY_FIRE[weapon]))
        this.city.damage(cart, spec.damage, { x: dir.x * strength,
        y: (cart.model === "KITE" ? dir.y : Math.max(0, dir.y) + (rifle ? 0.6 : 0.55)) * strength, z: dir.z * strength }, to, this.team(a), from);
    } else if (!glass && !fixture && hit?.collider.parent()?.isDynamic()) {
      // Break the grip before the shot impulse can transfer into PORTER's hull.
      if (rifle) {
        const porter = this.city?.porters.find(p => p.grip && p.cargo.body.handle === hit.collider.parent()!.handle);
        if (porter) {
          if (a.kind === "player") this.security?.report(to, porter.id);
          this.city!.workers.release(porter);
        }
      }
      hit.collider
        .parent()!
        .applyImpulseAtPoint(
          { x: dir.x * 18, y: dir.y * 18, z: dir.z * 18 },
          to,
          true,
        );
    }
    this.city?.disturb(from, to);
    state.ammo--;
    state.shotWait = spec.interval + Math.max(-STEP, state.shotWait);
    a.recoil = Math.min(1, a.recoil + (rifle && !a.braced ? 1 : 0.15));
    if (rifle) {
      a.stability = Math.max(0, a.stability - (a.braced ? 0.04 : 0.55));
      a.braceTime = 0;
    }
    if (a.kind === "player") {
      if (covering) this.coverShots++;
      else this.shots++;
    }
    else if (this.arena) this.arena.enemyShots++;
    else if (this.mission) this.mission.enemyShots++;
    const recoil = rifle ? (a.braced ? 12 : RIFLE.recoil) : a.braced ? 1 : pistol || weapon === "minigun" ? 8 : 5;
    a.body.applyImpulse({ x: -dir.x * recoil, y: 0, z: -dir.z * recoil }, true);
    this.events.push({
      type: "shot",
      actor: a.id,
      weapon,
      from,
      to,
      hit: hitOpponent,
      impact: !!hit,
      material:
        glass ? "glass" : target?.kind === "human" ? "soft" : fixture || target || hit?.collider.parent()?.isDynamic() ? "metal" : "concrete",
      normal: hit ? vcopy(hit.normal) : { x: 0, y: 1, z: 0 },
    });
  }

  damage(
    a: Actor,
    amount: number,
    impulse: Vec3,
    point: Vec3,
    source?: Weapon | "vehicle",
    responsible?: "player" | "enemy",
  ) {
    if (responsible === "player" && amount > 0 && !a.dead) this.security?.attacked(a);
    const bullet = source === "gun" || source === "minigun" || source === "pistol";
    const multiplier = a.braced ? (bullet ? KINETIC.bracedBullet : 0.28) : 1;
    const applied = { x: impulse.x * multiplier, y: impulse.y * multiplier, z: impulse.z * multiplier };
    if (!a.dead) {
      const mass = a.body.mass();
      const previous = a.model ? a.knockback : a.body.linvel();
      const limit = source === "minigun" ? KINETIC.minigunMaxSpeed : KINETIC.maxSpeed;
      // A weaker hit must not brake momentum already imparted by the minigun.
      const maxSpeed = Math.max(limit, Math.hypot(previous.x, previous.z));
      const retainedLimit = Math.max(limit, Math.hypot(a.knockback.x, a.knockback.z));
      const next = { x: previous.x + applied.x / mass, z: previous.z + applied.z / mass };
      const speed = Math.hypot(next.x, next.z);
      if (speed > maxSpeed) {
        next.x *= maxSpeed / speed;
        next.z *= maxSpeed / speed;
      }
      applied.x = (next.x - previous.x) * mass;
      applied.z = (next.z - previous.z) * mass;
      // Passive targets need an actual-speed cap. Their lane controller must
      // retain only the impact, not mistake its own walking velocity for it.
      a.knockback = a.model ? next : {
        x: a.knockback.x + applied.x / mass,
        z: a.knockback.z + applied.z / mass,
      };
      const retainedSpeed = Math.hypot(a.knockback.x, a.knockback.z);
      if (retainedSpeed > retainedLimit) {
        a.knockback.x *= retainedLimit / retainedSpeed;
        a.knockback.z *= retainedLimit / retainedSpeed;
      }
    }
    a.body.applyImpulseAtPoint(applied, point, true);
    if (a.dead) return;
    a.hp = Math.max(0, a.hp - amount);
    a.hitTime = this.time;
    a.stability = Math.max(0, a.stability - (bullet ? a.braced ? 0.012 : 0.025 : a.braced ? 0.05 : 0.16));
    // A volley gives discrete staggers rather than restarting the stun on every
    // round. Rifle/blast shocks can override the brief ordinary-hit grace.
    if (!bullet || (a.stagger === 0 && a.staggerGrace === 0)) {
      a.stagger = Math.max(a.stagger, STAGGER.duration[source ?? "rifle"]);
      a.staggerDuration = a.stagger;
      a.braceTime = 0;
      a.firing = a.spooling = false;
      if (a.ai) {
        a.ai.fire = false;
        a.ai.burstUntil = 0;
        if (a.ai.state !== "entering") a.ai.state = "suppressed";
      }
      if (a.cover) {
        a.cover.fire = false;
        a.cover.burstUntil = 0;
        a.cover.state = "suppressed";
      }
    }
    if (a.hp <= 0) {
      if (a.kind === "player" && a.model === "sniper") this.endSniping();
      a.dead = true;
      this.selected.delete(a.id);
      a.stagger = a.staggerDuration = a.staggerGrace = 0;
      a.deathTime = this.time;
      if (a.kind === "enemy" && this.arena) this.arena.kills++;
      a.killedBy = source;
      a.firing = false;
      a.spin = 0;
      a.spooling = false;
      a.cover = undefined;
      a.path = [];
      // Hand the visible facing to physics before toppling. Living robots may
      // have turned since spawning; interpolation must start from that pose too.
      const rotation = {
        x: 0,
        y: Math.sin(a.yaw / 2),
        z: 0,
        w: Math.cos(a.yaw / 2),
      };
      a.body.setRotation(rotation, true);
      a.previousRotation = { ...rotation };
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

  throwGrenade(point: Vec2, actor = this.grenadeThrower): boolean {
    if (!actor || actor.dead || this.isDisrupted(actor) || actor.grenadeCooldown > 0 || !this.supports(actor, "grenade")) return false;
    if (actor.kind === "player") this.onInput?.({ type: "grenade", point: { ...point }, actor: actor.id });
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
      team: this.team(actor),
      previous: from,
      bounceWait: 0.1,
      lastVelocity: velocity,
    });
    actor.grenadeCooldown = GRENADE_COOLDOWN;
    if (actor.kind === "player") {
      this.lastGrenadier = actor.id;
      this.throws++;
    }
    this.events.push({ type: "throw", actor: actor.id, position: from });
    return true;
  }

  blastExposure(origin: Vec3, actor: Actor, source?: RAPIER.RigidBody): number {
    const p = actor.body.translation();
    let visible = 0;
    for (const y of actor.flight ? [-.15, 0, .15] : [.25, .75, 1.35]) {
      const sample = { x: p.x, y: p.y + (actor.flight ? y : -.96 + y), z: p.z };
      const hit = this.ray(
        origin,
        sample,
        actor.body,
        (c) => (!source || c.parent()?.handle !== source.handle) && !this.grenades.some((g) => g.body.handle === c.parent()?.handle),
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
    this.applyBlast(origin, grenade.team);
  }

  explodeVehicle(body: RAPIER.RigidBody, id: number) {
    const origin = vcopy(body.translation());
    origin.y = Math.max(0.18, origin.y);
    body.applyImpulse({ x: 0, y: body.mass() * 1.8, z: 0 }, true);
    body.applyTorqueImpulse({ x: body.mass() * 0.18, y: 0, z: body.mass() * 0.12 }, true);
    this.applyBlast(origin, "neutral", body, id);
  }

  /** Source hull emits pressure but remains physical cover for subsequent blasts. */
  private applyBlast(origin: Vec3, team: "player" | "enemy" | "neutral", source?: RAPIER.RigidBody, vehicle?: number) {
    let affected = 0;
    for (const a of this.actors) {
      if (!FRIENDLY_FIRE.grenade && this.team(a) === team) continue;
      const p = a.body.translation();
      const dx = p.x - origin.x,
        dz = p.z - origin.z,
        distance = Math.hypot(dx, p.y - origin.y, dz);
      if (distance >= BLAST_RADIUS) continue;
      const exposure = this.blastExposure(origin, a, source);
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
        vehicle === undefined ? "grenade" : "vehicle",
        team === "neutral" ? undefined : team,
      );
      if (wasAlive && team !== "neutral" && (team === "player" ? a.kind !== "player" : a.kind === "player")) {
        affected++;
        if (team === "player") this.grenadeHits++;
      }
    }
    for (const p of this.props) {
      const position = p.body.translation();
      const distance = Math.hypot(
        position.x - origin.x,
        position.y - origin.y,
        position.z - origin.z,
      );
      if (distance >= BLAST_RADIUS || this.ray(origin, position, p.body, c => !source || c.parent()?.handle !== source.handle))
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
    this.city?.blast(origin, source, team);
    this.city?.windows.blast(origin, source);
    this.events.push({ type: "explosion", position: origin, affected, team, ...(vehicle === undefined ? {} : { vehicle }) });
  }

  isDisrupted(a: Actor) {
    return !a.dead && a.stagger > 0;
  }

  step() {
    if (this.mission?.stopped) return;
    this.time += STEP;
    this.arena?.update();
    this.hauling?.update();
    this.escort?.update();
    this.mission?.updateCombat();
    this.security?.update();
    updateCoverFire(this);
    for (const a of this.actors) {
      a.grenadeCooldown = Math.max(0, a.grenadeCooldown - STEP);
      a.previous = vcopy(a.body.translation());
      a.previousRotation = { ...a.body.rotation() };
      a.recoil = Math.max(0, a.recoil - STEP * 1.1);
      a.shotWait = Math.max(-STEP, a.shotWait - STEP);
      a.pistol.shotWait = Math.max(-STEP, a.pistol.shotWait - STEP);
      if (a.dead) {
        a.spin = 0;
        a.spooling = false;
        a.firing = false;
        continue;
      }
      const wasStaggered = this.isDisrupted(a);
      a.stagger = Math.max(0, a.stagger - STEP * (a.braced ? STAGGER.bracedRecovery : 1));
      a.staggerGrace = wasStaggered && a.stagger === 0
        ? STAGGER.grace : Math.max(0, a.staggerGrace - STEP);
      const drag = Math.exp(-KINETIC.drag * STEP);
      a.knockback.x *= drag;
      a.knockback.z *= drag;
      const velocity = a.body.linvel();
      a.braceTime =
        a.braced &&
        !this.isDisrupted(a) &&
        Math.hypot(velocity.x, velocity.z) < 0.3 &&
        a.stability > 0.8
          ? Math.min(RIFLE.settle, a.braceTime + STEP)
          : 0;
      if (!this.isDisrupted(a))
        a.stability = Math.min(1, a.stability + STEP * (a.braced ? 1.5 : 0.8));
      if (a.kind === "heavy")
        this.maxDisplacement = Math.max(
          this.maxDisplacement,
          distance2(a.body.translation(), a.spawn),
        );
      for (const weapon of [a.model ? ROBOT_MODELS[a.model].weapon : "gun", "pistol"] as const) {
        const state = this.ammunition(a, weapon);
        if (state.reload > 0) {
          state.reload = Math.max(0, state.reload - STEP);
          if (state.reload === 0) state.ammo = this.magazine(a, weapon);
        }
      }
      if (a.kind === "player" || a.kind === "enemy" || a.kind === "human") {
        const selected = a.kind === "player" && this.selected.has(a.id);
        const state = this.ammunition(a);
        const fire =
          (a.kind === "enemy"
            ? !!a.ai?.fire
            : selected && this.trigger && this.weapon !== "grenade" && this.followsOrder(a, this.weapon) || !!a.cover?.fire) &&
          state.reload === 0 && !a.haul && !this.isDisrupted(a);
        a.spooling = a.weapon === "minigun" && fire && state.ammo > 0;
        if (a.weapon === "minigun") {
          const previousSpin = a.spin;
          a.spin = clamp(a.spin + STEP * (a.spooling ? 1 / MINIGUN.windUp : -1 / MINIGUN.coast), 0, 1);
          if (a.spin > 1 - 1e-8) a.spin = 1;
          if (a.spin === 1 && previousSpin < 1) state.shotWait = Math.max(0, state.shotWait);
        } else a.spin = 0;
        a.firing = fire && state.ammo > 0 && (a.weapon !== "minigun" || a.spin === 1);
        if (a.firing && state.shotWait <= 0) {
          this.shoot(a);
        }
        if (fire && state.ammo === 0) this.reloadActor(a);
        if (a.flight) this.security?.fly(a);
        else this.drive(a);
        const gripping = a.haul && this.hauling?.loadFor(a)?.state !== "approaching";
        if (!gripping && (selected || a.cover || (a.kind === "enemy" && a.ai?.target))) {
          const p = a.body.translation();
          const aim = this.actorAim(a);
          const desired = Math.atan2(aim.x - p.x, aim.z - p.z);
          const diff = Math.atan2(
            Math.sin(desired - a.yaw),
            Math.cos(desired - a.yaw),
          );
          a.yaw += clamp(diff, -STEP * 9, STEP * 9);
        } else if (!gripping && a.path[0]) {
          a.yaw = Math.atan2(
            a.path[0].x - a.body.translation().x,
            a.path[0].z - a.body.translation().z,
          );
        }
      } else if (a.kind === "moving" && !this.isDisrupted(a)) {
        const p = a.body.translation(),
          vel = a.body.linvel();
        const desired =
          (a.spawn.x + Math.sin(this.time * 0.75) * 2.1 - p.x) * 2.4;
        a.body.applyImpulse(
          {
            x: clamp(desired + a.knockback.x - vel.x, -0.3, 0.3) * a.body.mass(),
            y: 0,
            z: clamp((a.spawn.z - p.z) * 2 + a.knockback.z - vel.z, -0.3, 0.3) * a.body.mass(),
          },
          true,
        );
      }
    }
    this.city?.update();
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
    this.mission?.updateObjectives();
  }

  private drive(a: Actor) {
    if (this.hauling?.drive(a)) return;
    const p = a.body.translation(),
      v = a.body.linvel();
    // Recover the assigned corner if another hull or an impact displaces an arrival.
    const recoveryGoal = this.mission?.bridge?.waitingGoal(a) ?? a.moveTarget;
    const foot = this.walkingPoint(a);
    if (!a.path.length && recoveryGoal && (distance2(p, recoveryGoal) > 0.15 || this.terrain &&
        Math.abs(foot.y - (recoveryGoal.y ?? 0)) > .22) && this.time >= (a.replanAt ?? 0)) {
      a.path = this.navigation.findPath(this.terrain ? foot : p, recoveryGoal, this.dynamicNavigationBoxes(true, a));
      // Failed recovery must not repeat an unreachable search every physics tick.
      a.replanAt = this.time + (a.path.length ? 0 : 0.5);
    }
    // Local yielding may carry a robot past a planned turn. Advance to a visible
    // waypoint instead of doubling back into a squadmate already at that corner.
    if (a.path.length > 1) {
      const boxes = this.navigationBoxes();
      while (a.path.length > 1 && (this.terrain
        ? this.terrain.segmentClear(foot, a.path[1], .55, this.dynamicNavigationBoxes(true, a))
        : segmentClear(p, a.path[1], boxes))) a.path.shift();
    }
    while (
      a.path.length &&
      distance2(p, a.path[0]) < (a.path.length === 1 ? 0.08 : 0.14) &&
      (!this.terrain || Math.abs(foot.y - (a.path[0].y ?? 0)) < .22)
    )
      a.path.shift();
    let dx = 0,
      dz = 0;
    if (a.path.length && !a.braced && !this.isDisrupted(a)) {
      const target = a.path[0],
        distance = distance2(p, target) || 1;
      const speed = Math.min(this.escort?.movementSpeed(a) ?? this.hauling?.escortSpeed(a, target) ?? (a.kind === "human" ? HUMAN.walkSpeed : a.model === "minigunner" ? a.firing || a.spooling ? 1.9 : 3.2 : a.firing ? 2.6 : 4.2), distance * 5);
      const forwardX = (target.x - p.x) / distance,
        forwardZ = (target.z - p.z) / distance;
      dx = forwardX * speed;
      dz = forwardZ * speed;
      ({ x: dx, z: dz } = this.walkVelocity(a, { x: dx, z: dz }));
    }
    // Finite acceleration preserves externally imparted velocity and permits lateral recovery.
    const acceleration = (a.braced ? 40 : 13) * (0.35 + a.stability * 0.65);
    const ix = dx + a.knockback.x - v.x,
      iz = dz + a.knockback.z - v.z,
      length = Math.hypot(ix, iz) || 1;
    const amount = Math.min(length, acceleration * STEP) * a.body.mass();
    const support = this.terrain && this.ray(p, { ...p, y: p.y - 1.13 }, a.body,
      collider => collider.parent()?.isFixed() ?? false);
    if (this.terrain ? !!support && support.normal.y > .6 : p.y < 1.1)
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
    const collecting = this.hauling?.loadFor(a)?.state === "approaching";
    const neighbours = this.actors
      .filter(
        (other) =>
          other !== a &&
          (!other.dead || !!other.model || other.kind === "human") &&
          // During collection, wrecks yield through real hull contacts rather
          // than steering away forever from a grip occupied by a fallen hand.
          !(collecting && other.dead) &&
          Math.abs(other.body.translation().y - p.y) < 1.3 &&
          distance2(p, other.body.translation()) < 5,
      )
      .map((other) => {
        // Disabled capsules can lie across an aisle. Their rotated footprint
        // still blocks walking even though they no longer have movement intent.
        const wreck = other.dead && (!!other.model || other.kind === "human");
        const q = wreck ? other.body.rotation() : null;
        return {
          p: other.body.translation(), v: other.body.linvel(),
          player: (!!other.model || other.kind === "human") && !wreck && !other.flight,
          w: other.flight ? WATCH.radius * 2 : q ? 0.74 + 1.12 * Math.abs(2 * (q.x * q.y - q.w * q.z)) : this.range === "long" ? 0.6 : 0.96,
          d: other.flight ? WATCH.radius * 2 : q ? 0.74 + 1.12 * Math.abs(2 * (q.w * q.x + q.y * q.z)) : this.range === "long" ? 0.96 : 0.6,
        };
      });
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
        // Score first: once a safe preferred velocity wins, most alternatives
        // cannot improve it. Avoid their expensive surface/support queries.
        const score =
          (candidate.x - preferred.x) ** 2 +
          (candidate.z - preferred.z) ** 2 +
          0.05 * ((candidate.x - velocity.x) ** 2 + (candidate.z - velocity.z) ** 2) +
          (angle < 0 ? 0.01 : 0);
        if (score >= bestScore) continue;
        // Predict only as far as this turn; the controller brakes and changes direction there.
        const horizon = Math.min(0.65, remaining / (speed * scale));
        const next = {
          x: p.x + candidate.x * Math.min(0.5, horizon),
          z: p.z + candidate.z * Math.min(0.5, horizon),
        };
        if (
          (next.x < BOUNDS.left + 0.37 && next.x <= p.x) ||
          (next.x > BOUNDS.right - 0.37 && next.x >= p.x) ||
          (next.z < BOUNDS.back + 0.37 && next.z <= p.z) ||
          (next.z > BOUNDS.front - 0.37 && next.z >= p.z) ||
          !(this.terrain ? this.terrain.segmentClear(this.walkingPoint(a), next, .36,
            this.dynamicNavigationBoxes(false, a)) : segmentClear(p, next, boxes, 0.36))
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
                    w: other.w,
                    d: other.d,
                  },
                ],
                0.4,
              );
            const t = clamp(approach / (vx * vx + vz * vz || 1), 0, horizon);
            return Math.hypot(rx - vx * t, rz - vz * t) < 0.9;
          })
        )
          continue;
        if (score < bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    return best;
  }

  private checkDrills() {
    if (this.range === "concourse") return;
    const plates = this.actors.filter((a) => a.kind === "plate"),
      blast = this.actors.filter((a) => a.kind === "blast"),
      precision = this.actors.filter((a) => a.kind === "precision");
    const checks = {
      gun:
        plates.length > 0 &&
        plates.every((a) => a.dead && (a.killedBy === "gun" || a.killedBy === "minigun")),
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
      fourthModel: this.fourthModel,
      arena: this.arena?.inspect() ?? null,
      mission: this.mission?.inspect() ?? null,
      hauling: this.hauling?.inspect() ?? null,
      escort: this.escort?.inspect() ?? null,
      city: this.city?.inspect() ?? null,
      security: this.security?.inspect() ?? null,
      aim: vcopy(this.aim),
      time: this.time,
      shots: this.shots,
      hits: this.hits,
      coverShots: this.coverShots,
      coverHits: this.coverHits,
      friendlyFire: { ...FRIENDLY_FIRE },
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
        team: g.team,
        fuse: g.fuse,
        position: vcopy(g.body.translation()),
      })),
      actors: this.actors.map((a) => ({
        id: a.id,
        kind: a.kind,
        model: a.flight ? "WATCH" : a.model,
        weapon: a.weapon,
        hauling: a.haul ?? null,
        escort: a.escort ?? null,
        weapons: [...a.weapons],
        pistol: { ...a.pistol, shotWait: Math.max(0, a.pistol.shotWait) },
        ai: a.ai ? { squad: a.ai.squad, state: a.ai.state, target: a.ai.target, gate: a.ai.gate, aim: { ...a.ai.aim } } : null,
        cover: a.cover ? { mode: a.cover.mode, state: a.cover.state, target: a.cover.target, aim: { ...a.cover.aim }, direction: a.cover.direction ? { ...a.cover.direction } : null } : null,
        hp: a.hp,
        maxHp: a.maxHp,
        stability: a.stability,
        knockback: { ...a.knockback },
        velocity: vcopy(a.body.linvel()),
        disrupted: this.isDisrupted(a),
        stagger: a.stagger,
        staggerGrace: a.staggerGrace,
        killedBy: a.killedBy,
        ammo: a.ammo,
        reload: a.reload,
        grenadeCooldown: a.grenadeCooldown,
        braced: a.braced,
        firing: a.firing,
        spin: a.spin,
        spooling: a.spooling,
        braceProgress: a.braceTime / RIFLE.settle,
        shotWait: Math.max(0, a.shotWait),
        position: vcopy(a.body.translation()),
        rotation: { ...a.body.rotation() },
        yaw: a.yaw,
        path: a.path.map((v) => ({ ...v })),
        destination: a.moveTarget ? { ...a.moveTarget } : null,
      })),
    };
  }
}
