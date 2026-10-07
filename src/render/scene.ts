import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  BLAST_RADIUS,
  AUTOMATIC_AIM,
  FORMATION_SPACING,
  FIREARMS,
  GRAVITY,
  GRENADE_FUSE,
  clamp,
  grenadeVelocity,
  type BoxSpec,
  type Vec2,
  type Vec3,
} from "../game/config";
import type {
  Actor,
  GameEvent,
  MoveDestination,
  Simulation,
} from "../game/simulation";
import { CityView } from "./city";
import { CartFleet } from "./carts";
import { KiteFleet } from "./kites";
import { PorterFleet, makeTote } from "./porters";
import { SniperView } from "./scope";
import { ARENA_ENTRIES } from "../game/ranges";
import { TACTICAL_CAMERA_OFFSET, tacticalHalfHeight, tacticalPan } from "./tactical-camera";

const MINT = 0x9be6cd,
  AMBER = 0xd3a24f,
  ORANGE = 0xad5431;
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const unitSphere = new THREE.IcosahedronGeometry(1, 1);
const material = (color: number, metalness = 0, roughness = 0.8) =>
  new THREE.MeshStandardMaterial({ color, roughness, metalness });
const metal = material(0x38464a, 0.55, 0.6);
const dark = material(0x1e2729, 0.45, 0.7);
const silver = material(0x7e8885, 0.65, 0.4);
const yellow = material(AMBER, 0.1, 0.7);
const shell = material(0x557d78, 0.4, 0.55);
const sniperShell = material(0x97aaa0, 0.5, 0.45);
const minigunShell = material(0x9b8753, 0.5, 0.5);
const orange = material(ORANGE, 0.25, 0.7);
const pale = material(0xc8c5ae, 0.1, 0.8);
const glow = new THREE.MeshBasicMaterial({ color: MINT });
const targetPaint = new THREE.MeshBasicMaterial({ color: 0xefd3a0 });

function box(
  parent: THREE.Object3D,
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material = metal,
) {
  const mesh = new THREE.Mesh(unitBox, mat);
  mesh.scale.set(w, h, d);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinder(
  parent: THREE.Object3D,
  radius: number,
  length: number,
  x: number,
  y: number,
  z: number,
  mat: THREE.Material = metal,
) {
  const mesh = new THREE.Mesh(unitCylinder, mat);
  mesh.scale.set(radius, length, radius);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function labelTexture(
  text: string,
  color = "#222b2c",
  background?: string,
  size = 80,
) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = `800 ${size}px "Arial Narrow", sans-serif`;
  canvas.width = Math.ceil(ctx.measureText(text).width + size * 0.4);
  canvas.height = Math.ceil(size * 1.4);
  if (background) {
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${size}px "Arial Narrow", sans-serif`;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
function label(
  parent: THREE.Object3D,
  text: string,
  width: number,
  height: number,
  x: number,
  y: number,
  z: number,
  floor = false,
  color?: string,
) {
  const texture = labelTexture(text, color);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  mesh.position.set(x, y, z);
  if (floor) mesh.rotation.x = -Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

type ActorVisual = {
  root: THREE.Group;
  torso: THREE.Group;
  legs: THREE.Group[];
  ring: THREE.Mesh;
  flash: THREE.Mesh;
  health: THREE.Sprite;
  bipod?: THREE.Group;
  primaryGun?: THREE.Group;
  pistol?: THREE.Group;
  barrels?: THREE.Group;
  dead: boolean;
};
type Particle = {
  p: THREE.Vector3;
  v: THREE.Vector3;
  life: number;
  max: number;
  size: number;
  color: THREE.Color;
  smoke: boolean;
};
type Trail = { mesh: THREE.Mesh; life: number };

export class RangeScene {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera = new THREE.OrthographicCamera(-30, 30, 15, -15, 0.1, 400);
  scope = new SniperView();
  private sun!: THREE.DirectionalLight;
  private environment = new THREE.Group();
  private cityView?: CityView;
  private cartFleet?: CartFleet;
  private kiteFleet?: KiteFleet;
  private porterFleet?: PorterFleet;
  private environmentLabels = new THREE.Group();
  private dynamic = new THREE.Group();
  private actors = new Map<number, ActorVisual>();
  private props = new Map<number, THREE.Group>();
  private grenades = new Map<number, THREE.Group>();
  private grenadeHazards = new Map<number, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>();
  private entryMarkers = new Map<number, THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>>();
  private particles: Particle[] = [];
  private particleMesh = new THREE.InstancedMesh(
    unitSphere,
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    400,
  );
  private trails: Trail[] = [];
  private flashes = new Map<number, number>();
  private blastRings: { mesh: THREE.Mesh; age: number }[] = [];
  private bulletMarks = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.047, 7),
    new THREE.MeshBasicMaterial({
      color: 0x222827,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
    180,
  );
  private markIndex = 0;
  private dummy = new THREE.Object3D();
  private cameraTarget = new THREE.Vector3(0, 0, -2.5);
  private cameraOffset = new THREE.Vector3().copy(TACTICAL_CAMERA_OFFSET);
  private zoom = 1;
  private raycaster = new THREE.Raycaster();
  private groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private aiming = new THREE.Group();
  private aimRing = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.28, 32),
    new THREE.MeshBasicMaterial({
      color: MINT,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    }),
  );
  private aimTicks = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.Float32BufferAttribute([
        -0.46, 0, 0, -0.32, 0, 0, 0.32, 0, 0, 0.46, 0, 0,
        0, -0.46, 0, 0, -0.32, 0, 0, 0.32, 0, 0, 0.46, 0,
      ], 3),
    ),
    new THREE.LineBasicMaterial({ color: MINT, depthTest: false }),
  );
  private aimGround = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.25, 32),
    new THREE.MeshBasicMaterial({
      color: MINT, transparent: true, opacity: 0.35,
      depthWrite: false, depthTest: false,
    }),
  );
  private aimHeight = new THREE.Line(
    new THREE.BufferGeometry().setAttribute(
      "position", new THREE.BufferAttribute(new Float32Array(6), 3),
    ),
    new THREE.LineBasicMaterial({
      color: MINT, transparent: true, opacity: 0.55,
      depthWrite: false, depthTest: false,
    }),
  );
  private aimGuides = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute(
      "position", new THREE.BufferAttribute(new Float32Array(4 * 6), 3),
    ),
    new THREE.LineBasicMaterial({
      color: MINT, transparent: true, opacity: 0.45, depthWrite: false,
    }),
  );
  private blastPreview = new THREE.Mesh(
    new THREE.RingGeometry(BLAST_RADIUS - 0.03, BLAST_RADIUS, 64),
    new THREE.MeshBasicMaterial({
      color: AMBER,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    }),
  );
  private arc = new THREE.Line(
    new THREE.BufferGeometry(),
    new THREE.LineDashedMaterial({
      color: 0xf5c572,
      dashSize: 0.25,
      gapSize: 0.13,
      transparent: true,
      opacity: 0.85,
    }),
  );
  private destinations = new THREE.Group();
  private destinationMarkers: {
    root: THREE.Group;
    ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
    number: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  }[] = [];
  private destinationOutline = new THREE.LineLoop(
    new THREE.BufferGeometry().setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(12), 3),
    ),
    new THREE.LineBasicMaterial({
      color: MINT,
      transparent: true,
      opacity: 0.25,
      depthWrite: false,
      depthTest: false,
    }),
  );
  private destinationPreview: MoveDestination[] | null = null;
  private destinationAge = 99;
  private lightFlash = new THREE.PointLight(0xffd699, 0, 8, 2);
  reducedMotion = false;
  auxLabels = true;
  private shake = 0;
  private resizeObserver: ResizeObserver;

  static async create(canvas: HTMLCanvasElement, sim: Simulation) {
    const texture = await new THREE.TextureLoader().loadAsync(
      `${import.meta.env.BASE_URL}textures/concrete.webp`,
    );
    return new RangeScene(canvas, sim, texture);
  }

  private constructor(
    public canvas: HTMLCanvasElement,
    public sim: Simulation,
    private texture: THREE.Texture,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.03;
    this.renderer.info.autoReset = false;
    this.scene.background = new THREE.Color(0x242d30);
    this.scene.fog = new THREE.Fog(0x242d30, 90, 145);
    this.scene.add(new THREE.HemisphereLight(0xd4e8ec, 0x44423a, 2.0));
    const sun = new THREE.DirectionalLight(0xffe5be, 3.2);
    this.sun = sun;
    sun.position.set(-18, 38, 15);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -36;
    sun.shadow.camera.right = 36;
    sun.shadow.camera.top = 32;
    sun.shadow.camera.bottom = -32;
    sun.shadow.camera.far = 95;
    sun.shadow.normalBias = 0.035;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 3;
    this.scene.add(
      sun,
      sun.target,
      this.environment,
      this.environmentLabels,
      this.dynamic,
      this.particleMesh,
      this.bulletMarks,
      this.lightFlash,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.count = 0;
    this.bulletMarks.count = 0;
    this.aimRing.rotation.x = this.blastPreview.rotation.x = -Math.PI / 2;
    this.aimGround.rotation.x = -Math.PI / 2;
    this.aimRing.add(this.aimTicks);
    this.aimGuides.frustumCulled = this.aimHeight.frustumCulled = false;
    this.aimGuides.geometry.setDrawRange(0, 0);
    this.aimRing.renderOrder = this.aimTicks.renderOrder = 10;
    this.aiming.add(
      this.aimRing, this.aimGround, this.aimHeight, this.aimGuides,
      this.blastPreview, this.arc,
    );
    const ringGeometry = new THREE.RingGeometry(0.42, 0.48, 32);
    for (let id = 1; id <= 4; id++) {
      const root = new THREE.Group();
      const ring = new THREE.Mesh(
        ringGeometry,
        new THREE.MeshBasicMaterial({
          color: MINT,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
          depthTest: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      ring.renderOrder = 10;
      root.add(ring);
      const number = label(
        root,
        String(id),
        0.5,
        0.58,
        0,
        0.075,
        0,
        true,
        "#ffffff",
      );
      number.material.depthTest = false;
      number.renderOrder = 11;
      this.destinationMarkers.push({ root, ring, number });
      this.destinations.add(root);
    }
    this.destinationOutline.frustumCulled = false;
    this.destinationOutline.renderOrder = 9;
    this.destinations.add(this.destinationOutline);
    this.scene.add(this.aiming, this.destinations);
    this.destinations.visible = false;
    this.buildEnvironment(texture);
    this.configureRangeLighting();
    this.resetDynamic();
    this.resetCamera();
    this.resize();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
  }

  private buildEnvironment(tex: THREE.Texture) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(13, 10);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x888b84,
      map: tex,
      roughness: 0.97,
    });
    if (this.sim.city) {
      tex.repeat.set(30, 26);
      floorMat.dispose();
      this.cityView = new CityView(this.sim.city.district, tex, this.renderer.getContext().getContextAttributes()?.antialias ?? false);
      this.environment.add(this.cityView.root);
      return;
    }
    const wallTex = tex.clone();
    wallTex.repeat.set(2, 1);
    const concrete = new THREE.MeshStandardMaterial({
      color: 0xa7a69b,
      map: wallTex,
      roughness: 0.94,
    });
    if (this.sim.range === "long") {
      tex.repeat.set(30, 7);
      this.buildLongRange(floorMat, concrete);
      this.batchEnvironment();
      return;
    }
    if (this.sim.range === "arena") {
      tex.repeat.set(22, 16);
      this.buildArena(floorMat, concrete);
      return;
    }
    box(this.environment, 72, 0.7, 52, 0, -0.38, -3, floorMat);
    box(this.environment, 67, 0.3, 5.6, 0, -0.16, 18.3, material(0x707874));
    for (const b of this.sim.layout.barriers) this.makeBarrier(b, concrete);
    for (let x = -33; x <= 33; x += 5.5) {
      box(this.environment, 0.32, 3.9, 0.4, x, 1.95, -27.0, concrete);
      box(this.environment, 0.55, 0.15, 1.25, x, 3.95, -27.35, metal);
    }
    // Back wall service pipes and vent cabinets.
    for (const h of [2.9, 3.25]) {
      const pipe = cylinder(this.environment, 0.12, 19, 9, h, -26.85);
      pipe.rotation.z = Math.PI / 2;
    }
    for (const x of [1, 7, 13, 19])
      box(this.environment, 0.16, 0.72, 0.3, x, 3.06, -26.75, silver);
    for (const x of [-19, 18]) {
      box(this.environment, 2.1, 1.2, 0.35, x, 1.7, -26.83, metal);
      for (let i = 0; i < 7; i++)
        box(
          this.environment,
          1.7,
          0.06,
          0.04,
          x,
          1.28 + i * 0.13,
          -26.63,
          dark,
        );
    }
    label(
      this.environmentLabels,
      "PROVING GROUND",
      10.5,
      2.0,
      -5,
      2.6,
      -26.92,
      false,
      "#283230",
    );
    label(
      this.environmentLabels,
      "FUTURES CONTRACT",
      5,
      0.65,
      -5,
      1.5,
      -26.91,
      false,
      "#404841",
    );
    for (const x of [-20, -8, 6, 21]) {
      for (let z = -16; z < 7; z += 1.5)
        box(this.environment, 0.09, 0.012, 0.8, x, 0.013, z, yellow);
    }
    for (const z of [6.5, -1, -7, -13]) {
      for (const x of [-19.5, -15, -10.5])
        box(this.environment, 0.8, 0.014, 0.055, x, 0.013, z, yellow);
    }
    for (const [x, num, text] of [
      [-14, "01", "BALLISTICS"],
      [-1, "02", "DISPLACEMENT"],
      [14, "03", "FRAGMENTS"],
    ] as const) {
      label(this.environmentLabels, num, 3.2, 1.8, x, 0.023, 5.7, true, "#c7994a");
      label(this.environmentLabels, text, 8, 0.7, x, 0.026, 7.2, true, "#d8c796");
    }
    label(
      this.environmentLabels,
      "FIRING LINE",
      6.5,
      0.7,
      -13.5,
      0.035,
      12.4,
      true,
      "#c5ccbc",
    );
    for (let x = -21; x <= 21; x += 0.7) {
      const stripe = box(
        this.environment,
        0.35,
        0.018,
        0.55,
        x,
        0.025,
        8.5,
        yellow,
      );
      stripe.rotation.y = -0.5;
    }
    for (const x of [-7.3, 6.7]) {
      box(this.environment, 0.42, 0.015, 31, x, 0.03, -2, dark);
      for (let z = -17; z < 13; z += 0.22)
        box(this.environment, 0.37, 0.035, 0.065, x, 0.046, z, silver);
    }
    // Subtle slab joints across the training surface.
    const joint = material(0x5e6662);
    for (let x = -33; x < 33; x += 5.5)
      box(this.environment, 0.014, 0.007, 48, x, 0.007, -3, joint);
    for (let z = -27; z < 21; z += 5.5)
      box(this.environment, 66, 0.007, 0.014, 0, 0.007, z, joint);
    // Range lights, guard rails, and equipment outside the walkable yard.
    for (const x of [-34.6, 34.6])
      for (const z of [-14, 3, 12]) {
        cylinder(this.environment, 0.11, 5.4, x, 2.7, z);
        box(this.environment, 0.7, 0.38, 0.4, x, 5.3, z, dark);
        box(this.environment, 0.58, 0.24, 0.03, x, 5.28, z + 0.22, pale);
        box(this.environment, 0.65, 0.22, 0.65, x, 0.1, z, concrete);
      }
    for (const x of [-34, 34]) {
      const rail = cylinder(this.environment, 0.035, 46, x, 2.9, -3, yellow);
      rail.rotation.x = Math.PI / 2;
      for (let z = -25; z < 21; z += 3)
        cylinder(this.environment, 0.03, 0.7, x, 2.58, z, yellow);
    }
    this.batchEnvironment();
  }

  private buildLongRange(floor: THREE.Material, concrete: THREE.Material) {
    box(this.environment, 148, 0.7, 36, 54, -0.38, 0, floor);
    box(this.environment, 8, 0.3, 18, -4, -0.16, 0, material(0x707874));
    for (const b of this.sim.layout.barriers) this.makeBarrier(b, concrete);
    for (const platform of this.sim.layout.platforms) {
      this.makeBarrier(platform, concrete);
      const sign = label(
        this.environmentLabels,
        `+${platform.h} m`,
        2.4,
        0.55,
        platform.x - platform.w / 2 - 0.03,
        platform.h / 2,
        platform.z,
        false,
        "#d8c796",
      );
      sign.rotation.y = -Math.PI / 2;
      box(
        this.environment,
        0.04,
        0.08,
        platform.d,
        platform.x - platform.w / 2 - 0.02,
        platform.h - 0.04,
        platform.z,
        yellow,
      );
    }
    for (let x = 2; x <= 96; x += 2.5)
      for (const z of [-6, -1.5, 1.5, 6])
        box(this.environment, 1.1, 0.012, 0.045, x, 0.02, z, yellow);
    for (let z = -8; z <= 8; z += 0.65) {
      const stripe = box(
        this.environment,
        0.55,
        0.018,
        0.28,
        0,
        0.025,
        z,
        yellow,
      );
      stripe.rotation.y = -0.45;
    }
    label(
      this.environmentLabels,
      "04 / LONG RANGE",
      16,
      1.1,
      12,
      0.035,
      -5,
      true,
      "#d8c796",
    );
    label(
      this.environmentLabels,
      "FIRING LINE",
      7,
      0.6,
      -3.5,
      0.035,
      7,
      true,
      "#c5ccbc",
    );
    for (const [i, target] of this.sim.layout.targets.entries()) {
      const distance = (i + 1) * 30;
      label(
        this.environmentLabels,
        `${distance} m`,
        5,
        1.4,
        target.x,
        0.03,
        7.1,
        true,
        "#c7994a",
      );
      const plate = label(
        this.environmentLabels,
        `${distance} m`,
        2.8,
        0.5,
        target.x + 0.6,
        (target.elevation ?? 0) + 2.6,
        target.z,
        false,
        "#d8c796",
      );
      plate.rotation.y = -Math.PI / 2;
      for (const z of [-7.8, 7.8]) {
        cylinder(this.environment, 0.055, 2.3, target.x, 1.15, z, silver);
        box(this.environment, 0.25, 0.08, 0.35, target.x, 2.25, z, yellow);
      }
    }
    for (let x = -16; x < 126; x += 6) {
      box(this.environment, 0.025, 0.007, 32, x, 0.009, 0, dark);
      box(this.environment, 0.22, 3, 0.4, x, 1.5, -16.0, concrete);
    }
    for (const z of [-3, 3])
      box(this.environment, 144, 0.007, 0.016, 54, 0.009, z, dark);
    label(
      this.environmentLabels,
      "PRECISION / BRACE BEFORE FIRING",
      18,
      0.8,
      88,
      2.2,
      -15.95,
      false,
      "#283230",
    );
  }

  private buildArena(floorMat: THREE.Material, concrete: THREE.Material) {
    box(this.environment, 118, 0.7, 85, 0, -0.38, 0, floorMat);
    for (const b of this.sim.layout.barriers) this.makeBarrier(b, concrete);
    for (let x = -54; x <= 54; x += 6)
      box(this.environment, 0.02, 0.006, 80, x, 0.012, 0, dark);
    for (let z = -36; z <= 36; z += 6)
      box(this.environment, 112, 0.006, 0.02, 0, 0.012, z, dark);
    label(this.environmentLabels, "ARENA / LIVE FIRE", 13, 0.9, 0, 0.032, 32, true, "#d2bd8e");
    for (const gate of ARENA_ENTRIES) {
      label(this.environmentLabels, gate.name, 5, 0.7,
        gate.x + gate.dx * 2.4, 0.032, gate.z + gate.dz * 2.4, true, "#c99b5b");
      for (const side of [-1, 1]) {
        const x = gate.x + gate.dz * side * 4.8,
          z = gate.z - gate.dx * side * 4.8;
        cylinder(this.environment, 0.1, 2.2, x, 1.1, z, metal);
        box(this.environment, 0.24, 0.12, 0.24, x, 2.2, z, yellow);
      }
    }
    this.batchEnvironment();
    // Keep the entrance pulse separate from the static geometry batches.
    ARENA_ENTRIES.forEach((gate, i) => {
      const marker = new THREE.Mesh(new THREE.RingGeometry(2.8, 2.94, 48),
        new THREE.MeshBasicMaterial({ color: AMBER, transparent: true, opacity: 0.25, depthWrite: false }));
      marker.rotation.x = -Math.PI / 2;
      marker.position.set(gate.x, 0.043, gate.z);
      this.environment.add(marker);
      this.entryMarkers.set(i, marker);
    });
  }

  private configureRangeLighting() {
    const long = this.sim.range === "long";
    this.scene.fog = new THREE.Fog(0x242d30, 240, 340);
    const district = this.sim.city?.district;
    const centerX = district ? (district.bounds.left + district.bounds.right) / 2 : 0;
    const centerZ = district ? (district.bounds.back + district.bounds.front) / 2 : 0;
    this.sun.position.set(long ? 10 : centerX - 18, long ? 70 : 38, long ? 30 : centerZ + 15);
    this.sun.target.position.set(long ? 45 : centerX, 0, centerZ);
    const camera = this.sun.shadow.camera;
    const cityExtent = district ? Math.hypot(district.ground.right - district.ground.left,
      district.ground.front - district.ground.back) / 2 : 0;
    camera.left = -(district ? cityExtent : long ? 90 : this.sim.range === "arena" ? 76 : 46);
    camera.right = -camera.left;
    camera.top = district ? cityExtent : long ? 70 : this.sim.range === "arena" ? 60 : 40;
    camera.bottom = -camera.top;
    camera.far = district ? cityExtent * 2 + 80 : 230;
    // The city shadow frustum covers much more ground per texel; offset the
    // receiver enough to avoid self-shadow speckling on broad building walls.
    this.sun.shadow.normalBias = this.sim.city ? 0.1 : 0.035;
    camera.updateProjectionMatrix();
  }

  resetEnvironment() {
    const shared = new Set<THREE.Material>([
      metal,
      dark,
      silver,
      yellow,
      shell,
      sniperShell,
      minigunShell,
      orange,
      pale,
      glow,
      targetPaint,
    ]);
    const materials = new Set<THREE.Material>();
    for (const group of [this.environment, this.environmentLabels]) group.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      o.geometry.dispose();
      const list = Array.isArray(o.material) ? o.material : [o.material];
      list.forEach((m) => materials.add(m));
    });
    for (const m of materials)
      if (!shared.has(m)) {
        const map = (m as THREE.MeshStandardMaterial).map;
        if (map && map !== this.texture) map.dispose();
        m.dispose();
      }
    this.environment.clear();
    this.cityView = undefined;
    this.environmentLabels.clear();
    this.entryMarkers.clear();
    this.buildEnvironment(this.texture);
    this.configureRangeLighting();
  }

  private makeBarrier(b: BoxSpec, concrete: THREE.Material) {
    if (b.style === "crate") {
      const crate = this.makeCrate(b.w, b.h, b.d);
      crate.position.set(b.x, b.h / 2, b.z);
      this.environment.add(crate);
      return;
    }
    box(this.environment, b.w, b.h, b.d, b.x, b.h / 2, b.z, concrete);
    if (b.style === "barrier") {
      box(
        this.environment,
        b.w + 0.12,
        0.14,
        b.d + 0.12,
        b.x,
        b.h,
        b.z,
        concrete,
      );
      if (b.w > b.d)
        for (let x = b.x - b.w / 2 + 0.25; x < b.x + b.w / 2 - 0.1; x += 0.55) {
          const stripe = box(
            this.environment,
            0.23,
            0.23,
            0.025,
            x,
            b.h - 0.2,
            b.z + b.d / 2 + 0.017,
            yellow,
          );
          stripe.rotation.z = -0.45;
        }
    }
  }

  private makeCrate(w: number, h: number, d: number): THREE.Group {
    const group = new THREE.Group();
    box(group, w, h, d, 0, 0, 0, metal);
    for (const x of [-w / 2, w / 2])
      box(group, 0.1, h + 0.04, d + 0.04, x, 0, 0, silver);
    for (const y of [-h / 2 + 0.08, h / 2 - 0.08])
      box(group, w, 0.11, d + 0.05, 0, y, 0, silver);
    for (const sign of [-1, 1]) {
      const beam = box(
        group,
        Math.hypot(w * 0.8, h * 0.75),
        0.065,
        0.035,
        0,
        0,
        d / 2 + 0.032,
        dark,
      );
      beam.rotation.z = sign * Math.atan2(h * 0.75, w * 0.8);
    }
    box(group, 0.25, 0.16, 0.025, w * 0.22, h * 0.12, d / 2 + 0.04, yellow);
    return group;
  }

  private batchEnvironment() {
    this.environment.updateMatrixWorld(true);
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    this.environment.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material))
        return;
      const geos = batches.get(object.material) ?? [];
      const geometry = object.geometry.clone().applyMatrix4(object.matrixWorld);
      geos.push(geometry);
      batches.set(object.material, geos);
    });
    this.environment.clear();
    for (const [mat, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        const mesh = new THREE.Mesh(merged, mat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.environment.add(mesh);
      }
      for (const geometry of geometries) geometry.dispose();
    }
  }

  private makeActor(a: Actor): ActorVisual {
    const root = new THREE.Group(),
      model = new THREE.Group(),
      torso = new THREE.Group();
    root.add(model);
    model.position.y = -0.96;
    const legs: THREE.Group[] = [];
    const friend = a.kind === "player";
    const sniper = a.model === "sniper";
    const minigunner = a.model === "minigunner";
    const bodyMat = friend ? sniper ? sniperShell : minigunner ? minigunShell : shell : orange;
    let bipod: THREE.Group | undefined;
    let primaryGun: THREE.Group | undefined, pistol: THREE.Group | undefined;
    let barrels: THREE.Group | undefined;
    if (sniper) model.scale.x = 0.74;
    if (a.model || a.kind === "heavy") {
      for (const x of [-0.24, 0.24]) {
        const leg = new THREE.Group();
        leg.position.set(x, 0.8, 0);
        model.add(leg);
        legs.push(leg);
        box(leg, 0.25, 0.36, 0.28, 0, -0.18, 0, bodyMat);
        box(leg, 0.2, 0.34, 0.23, 0, -0.52, 0, dark);
        box(leg, 0.31, 0.17, 0.52, 0, -0.71, 0.09, metal);
        const knee = cylinder(leg, 0.14, 0.28, 0, -0.37, 0.04, silver);
        knee.rotation.z = Math.PI / 2;
        box(leg, 0.17, 0.18, 0.045, 0, -0.5, 0.14, bodyMat);
      }
      box(model, 0.63, 0.27, 0.4, 0, 0.83, 0, dark);
      torso.position.y = 1.05;
      model.add(torso);
      box(torso, 0.74, 0.55, 0.44, 0, 0.24, 0, bodyMat);
      box(torso, 0.54, 0.2, 0.08, 0, 0.35, 0.25, pale);
      box(torso, 0.4, 0.42, 0.23, 0, 0.24, -0.3, dark);
      if (minigunner) {
        box(torso, 0.95, 0.23, 0.52, 0, 0.45, 0, bodyMat);
        const pack = cylinder(torso, 0.32, 0.7, 0, 0.22, -0.47, metal);
        pack.rotation.z = Math.PI / 2;
        for (let i = 0; i < 5; i++) box(torso, 0.1, 0.12, 0.1, 0.48, 0.14 + i * 0.08, -0.2 + i * 0.1, yellow);
      }
      box(torso, 0.42, 0.3, 0.35, 0, 0.7, 0.02, bodyMat);
      box(torso, 0.34, 0.065, 0.03, 0, 0.73, 0.207, friend ? glow : pale);
      for (const sign of [-1, 1]) {
        const shoulder = box(
          torso,
          0.27,
          0.25,
          0.4,
          sign * 0.5,
          0.39,
          0,
          bodyMat,
        );
        shoulder.rotation.z = sign * 0.16;
        box(torso, 0.18, 0.35, 0.2, sign * 0.53, 0.14, 0.12, dark);
        box(torso, 0.2, 0.19, 0.35, sign * 0.48, 0.02, 0.32, bodyMat);
      }
      if (a.model) {
        primaryGun = new THREE.Group();
        torso.add(primaryGun);
        box(
          primaryGun,
          sniper ? 0.16 : 0.22,
          sniper ? 0.17 : 0.2,
          sniper ? 0.72 : 0.63,
          0.28,
          0.3,
          sniper ? 0.61 : 0.47,
          dark,
        );
        const barrel = cylinder(
          primaryGun,
          sniper ? 0.043 : 0.052,
          sniper ? 0.85 : 0.4,
          0.28,
          0.3,
          sniper ? 1.28 : 0.66,
          silver,
        );
        barrel.rotation.x = Math.PI / 2;
        if (minigunner) {
          primaryGun.remove(barrel);
          const housing = cylinder(primaryGun, 0.19, 0.36, 0.28, 0.3, 0.48, metal);
          housing.rotation.x = Math.PI / 2;
          barrels = new THREE.Group();
          barrels.position.set(0.28, 0.3, 0.83);
          primaryGun.add(barrels);
          for (let i = 0; i < 6; i++) {
            const angle = i * Math.PI / 3;
            const tube = cylinder(barrels, 0.035, 0.7, Math.cos(angle) * 0.11, Math.sin(angle) * 0.11, 0, silver);
            tube.rotation.x = Math.PI / 2;
          }
          for (const z of [-0.23, 0.27]) {
            const collar = cylinder(barrels, 0.155, 0.07, 0, 0, z, dark);
            collar.rotation.x = Math.PI / 2;
          }
          this.batchRigidPart(barrels);
          box(primaryGun, 0.2, 0.13, 0.2, 0.28, 0.51, 0.42, yellow);
        } else if (sniper) {
          box(primaryGun, 0.12, 0.28, 0.2, 0.28, 0.11, 0.56, metal);
          const optic = cylinder(primaryGun, 0.085, 0.36, 0.28, 0.49, 0.6, dark);
          optic.rotation.x = Math.PI / 2;
          const lens = cylinder(primaryGun, 0.065, 0.02, 0.28, 0.49, 0.79, friend ? glow : targetPaint);
          lens.rotation.x = Math.PI / 2;
          bipod = new THREE.Group();
          for (const sign of [-1, 1]) {
            const leg = cylinder(
              bipod,
              0.025,
              0.38,
              0.28 + sign * 0.12,
              0.06,
              1.04,
              silver,
            );
            leg.rotation.z = sign * 0.5;
          }
          primaryGun.add(bipod);
          this.batchRigidPart(bipod);
          pistol = new THREE.Group();
          torso.add(pistol);
          box(pistol, 0.16, 0.15, 0.35, 0.28, 0.3, 0.46, dark);
          box(pistol, 0.12, 0.23, 0.13, 0.28, 0.14, 0.35, metal);
          const tip = cylinder(pistol, 0.027, 0.12, 0.28, 0.3, 0.6, silver);
          tip.rotation.x = Math.PI / 2;
          this.batchRigidPart(pistol);
        } else {
          box(primaryGun, 0.3, 0.27, 0.26, 0.38, 0.17, 0.38, metal);
          box(primaryGun, 0.09, 0.12, 0.13, 0.28, 0.47, 0.61, dark);
        }
        this.batchRigidPart(primaryGun);
        cylinder(torso, 0.013, 0.44, -0.25, 0.87, -0.2, dark);
      }
    } else {
      box(model, 1.15, 0.15, 0.8, 0, 0.075, 0, metal);
      box(model, 0.13, 0.58, 0.16, 0, 0.43, 0, silver);
      torso.position.y = 0.92;
      model.add(torso);
      box(torso, 0.8, 0.9, 0.23, 0, 0.18, 0, orange);
      box(torso, 0.4, 0.35, 0.2, 0, 0.8, 0, orange);
      for (const x of [-0.49, 0.49])
        box(torso, 0.18, 0.45, 0.17, x, 0.22, 0, orange);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.16, 0.18, 24),
        targetPaint,
      );
      ring.position.set(0, 0.28, 0.124);
      torso.add(ring);
      box(torso, 0.04, 0.38, 0.012, 0, 0.28, 0.13, dark);
      box(torso, 0.38, 0.04, 0.012, 0, 0.28, 0.13, dark);
    }
    // Keep animated joints separate; batch rigid pieces by material within each joint.
    for (const part of [torso, ...legs, model]) this.batchRigidPart(part);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.74, 0.79, 40),
      new THREE.MeshBasicMaterial({
        color: MINT,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    this.dynamic.add(ring);
    const flash = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.2),
      new THREE.MeshBasicMaterial({ color: 0xffdc9c }),
    );
    flash.scale.set(0.65, 0.65, 2);
    flash.position.set(0.28, 0.3, sniper ? 1.76 : 1.24);
    torso.add(flash);
    flash.visible = false;
    const healthTexture = labelTexture(
      "━━━━━━━━━━━━",
      friend ? "#a8e6d4" : "#e3a078",
      undefined,
      110,
    );
    const health = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: healthTexture,
        transparent: true,
        depthTest: false,
      }),
    );
    health.scale.set(1.2, 0.15, 1);
    this.dynamic.add(health);
    health.visible = false;
    this.dynamic.add(root);
    return { root, torso, legs, ring, flash, health, bipod, primaryGun, pistol, barrels, dead: false };
  }

  private batchRigidPart(group: THREE.Group) {
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    for (const child of [...group.children]) {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material))
        continue;
      child.updateMatrix();
      const geometries = batches.get(child.material) ?? [];
      geometries.push(child.geometry.clone().applyMatrix4(child.matrix));
      batches.set(child.material, geometries);
      if (![unitBox, unitCylinder, unitSphere].includes(child.geometry))
        child.geometry.dispose();
      group.remove(child);
    }
    for (const [mat, geometries] of batches) {
      const merged = mergeGeometries(geometries);
      if (merged) {
        merged.userData.owned = true;
        const mesh = new THREE.Mesh(merged, mat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      for (const geometry of geometries) geometry.dispose();
    }
  }

  private disposeActor(visual: ActorVisual) {
    visual.root.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry.userData.owned) object.geometry.dispose();
    });
    visual.health.material.map?.dispose();
    visual.health.material.dispose();
    visual.ring.geometry.dispose();
    (visual.ring.material as THREE.Material).dispose();
    visual.flash.geometry.dispose();
    (visual.flash.material as THREE.Material).dispose();
    visual.root.removeFromParent();
    visual.ring.removeFromParent();
    visual.health.removeFromParent();
  }

  resetDynamic() {
    this.cartFleet?.dispose();
    this.cartFleet = undefined;
    this.kiteFleet?.dispose();
    this.kiteFleet = undefined;
    this.porterFleet?.dispose();
    this.porterFleet = undefined;
    for (const visual of this.actors.values()) this.disposeActor(visual);
    // Props retain their shared primitive geometry and materials.
    this.dynamic.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry.userData.owned) object.geometry.dispose();
    });
    this.dynamic.clear();
    this.actors.clear();
    this.props.clear();
    this.grenades.clear();
    for (const marker of this.grenadeHazards.values()) {
      marker.geometry.dispose();
      marker.material.dispose();
    }
    this.grenadeHazards.clear();
    if (this.sim.city) {
      this.cartFleet = new CartFleet(this.sim.city.carts);
      this.dynamic.add(this.cartFleet.root);
      this.kiteFleet = new KiteFleet(this.sim.city.kites);
      this.dynamic.add(this.kiteFleet.root);
      this.porterFleet = new PorterFleet(this.sim.city.porters);
      this.dynamic.add(this.porterFleet.root);
    }
    for (const a of this.sim.actors) this.actors.set(a.id, this.makeActor(a));
    for (const p of this.sim.props) {
      const group = p.style === "tote" ? makeTote() : this.makeCrate(p.w, p.h, p.d);
      this.batchRigidPart(group);
      this.dynamic.add(group);
      this.props.set(p.id, group);
    }
    for (const trail of this.trails) {
      this.scene.remove(trail.mesh);
      (trail.mesh.material as THREE.Material).dispose();
    }
    this.trails = [];
    for (const ring of this.blastRings) {
      this.scene.remove(ring.mesh);
      ring.mesh.geometry.dispose();
      (ring.mesh.material as THREE.Material).dispose();
    }
    this.blastRings = [];
    this.particles = [];
    this.particleMesh.count = 0;
    this.markIndex = 0;
    this.bulletMarks.count = 0;
    this.flashes.clear();
    this.destinationAge = 99;
    this.destinationPreview = null;
    this.destinations.visible = false;
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.renderer.setSize(rect.width, rect.height, false);
    const aspect = rect.width / Math.max(1, rect.height);
    const half = tacticalHalfHeight(this.sim.range, aspect, this.zoom);
    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.updateProjectionMatrix();
    this.updateCamera();
  }
  private updateCamera() {
    // Orthographic zoom can bring the camera below aircraft, clipping them and
    // starting pick rays behind them. Back up along the same viewing direction.
    const flightCeiling = Math.max(0, ...(this.sim.city?.district.flights ?? []).map(f => f.altitude));
    this.camera.position
      .copy(this.cameraOffset)
      .multiplyScalar(Math.max(1 / this.zoom, (flightCeiling + 6) / this.cameraOffset.y))
      .add(this.cameraTarget);
    this.camera.lookAt(this.cameraTarget);
    this.camera.updateMatrixWorld();
  }
  zoomBy(delta: number) {
    if (this.sim.sniping) {
      this.scope.zoomBy(delta);
      return;
    }
    this.zoom = clamp(
      this.zoom * Math.exp(-delta * 0.001),
      0.65,
      this.sim.range === "long" ? 5 : 2.8,
    );
    this.resize();
  }
  pan(dx: number, dz: number) {
    const b = this.sim.layout.bounds;
    const ground = tacticalPan(dx, dz);
    this.cameraTarget.x = clamp(this.cameraTarget.x + ground.x, b.left, b.right);
    this.cameraTarget.z = clamp(this.cameraTarget.z + ground.z, b.back, b.front);
    this.updateCamera();
  }
  center(onlyIfClose = false) {
    if (onlyIfClose && this.zoom < 1.5) return;
    const p = (
      this.sim.weapon === "rifle"
        ? (this.sim.rifleOperator ?? this.sim.primary)
        : this.sim.primary
    ).body.translation();
    this.cameraTarget.set(p.x, 0, p.z);
    this.updateCamera();
  }
  resetCamera() {
    this.cameraTarget.set(
      this.sim.range === "long" ? 54 : 0,
      0,
      this.sim.range === "proving" ? -3 : 0,
    );
    this.zoom = 1;
    this.resize();
  }

  pick(
    clientX: number,
    clientY: number,
    grenade = false,
  ): { aim: Vec3; ground: Vec3; actor?: number } | null {
    if (this.sim.sniping) return null;
    const rect = this.canvas.getBoundingClientRect();
    this.raycaster.setFromCamera(
      new THREE.Vector2(
        ((clientX - rect.left) / rect.width) * 2 - 1,
        (-(clientY - rect.top) / rect.height) * 2 + 1,
      ),
      this.camera,
    );
    const ground = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.groundPlane, ground))
      return null;
    const origin = this.raycaster.ray.origin,
      dir = this.raycaster.ray.direction;
    const hit = this.sim.ray(origin, origin.clone().addScaledVector(dir, this.camera.far));
    const actor =
      hit &&
      this.sim.actors.find((a) => a.collider.handle === hit.collider.handle);
    const automatic = this.sim.weapon === "gun" || this.sim.weapon === "minigun";
    let aim: Vec3 = { x: ground.x, y: automatic ? AUTOMATIC_AIM.height : 1.25, z: ground.z };
    if (!grenade && hit && actor) {
      aim = origin.clone().addScaledVector(dir, hit.timeOfImpact);
      // Hovering a leg must not dip an automatic burst back into low cover.
      // Elevated targets retain their own height, including shots above this floor.
      if (automatic && !actor.dead) {
        const p = actor.body.translation(), upperBody = p.y + AUTOMATIC_AIM.bodyOffset;
        if (aim.y < upperBody)
          aim = { x: p.x, y: upperBody, z: p.z };
      }
    } else if (!grenade && hit && this.sim.city?.neutral(hit.collider.handle))
      aim = origin.clone().addScaledVector(dir, hit.timeOfImpact);
    else if (!grenade && hit && this.sim.props.some(p => p.body.handle === hit.collider.parent()?.handle))
      // Loose cargo keeps its physical hitbox when dropped. Aim at its actual
      // surface instead of applying the empty-ground height used to clear cover.
      aim = origin.clone().addScaledVector(dir, hit.timeOfImpact);
    else if (!grenade && hit && this.sim.weapon === "rifle")
      aim = origin.clone().addScaledVector(dir, hit.timeOfImpact);
    return { aim, ground, actor: actor?.id };
  }
  project(position: Vec3) {
    const p = new THREE.Vector3(position.x, position.y, position.z).project(
        this.sim.sniping ? this.scope.camera : this.camera,
      ),
      r = this.canvas.getBoundingClientRect();
    return {
      x: r.left + ((p.x + 1) * r.width) / 2,
      y: r.top + ((1 - p.y) * r.height) / 2,
    };
  }
  get listenerPosition() {
    const operator = this.sim.sniping && this.sim.rifleOperator;
    if (!operator) return this.camera.position;
    const p = operator.body.translation();
    return { x: p.x, y: p.y + 0.65, z: p.z };
  }
  get listenerRight() {
    const camera = this.sim.sniping ? this.scope.camera : this.camera;
    return { x: camera.matrixWorld.elements[0], z: camera.matrixWorld.elements[2] };
  }
  inspectCamera() {
    return { target: { x: this.cameraTarget.x, y: this.cameraTarget.y, z: this.cameraTarget.z },
      zoom: this.zoom, halfHeight: this.camera.top, right: this.listenerRight };
  }
  markMove() {
    this.destinationPreview = null;
    this.destinationAge = 0;
  }
  previewMove(targets: MoveDestination[]) {
    this.destinationPreview = targets;
    this.destinationAge = 0;
  }
  cancelMovePreview() {
    this.destinationPreview = null;
  }

  private updateDestinations(delta: number) {
    const active = this.sim.active;
    const targets =
      this.destinationPreview ??
      active.flatMap((a) =>
        a.moveTarget ? [{ actor: a.id, position: a.moveTarget }] : [],
      );
    if (this.destinationPreview || active.some((a) => a.path.length))
      this.destinationAge = 0;
    else this.destinationAge += delta;
    this.destinations.visible = targets.length > 0 && this.destinationAge < 1.5;
    if (!this.destinations.visible) return;
    const fade = Math.max(0, 1 - this.destinationAge / 1.5);
    const color = this.destinationPreview ? AMBER : MINT;
    for (const marker of this.destinationMarkers) marker.root.visible = false;
    for (const target of targets) {
      const marker = this.destinationMarkers[target.actor - 1];
      marker.root.visible = true;
      marker.root.position.set(target.position.x, 0, target.position.z);
      for (const mesh of [marker.ring, marker.number]) {
        mesh.material.color.setHex(color);
        mesh.material.opacity = fade * 0.9;
      }
    }
    const p = targets.map((t) => t.position);
    const triangle =
      p.length === 3 &&
      p.every(
        (point, i) =>
          Math.abs(
            Math.hypot(point.x - p[(i + 1) % 3].x, point.z - p[(i + 1) % 3].z) -
              FORMATION_SPACING,
          ) < 0.001,
      );
    this.destinationOutline.visible =
      triangle ||
      (p.length === 4 &&
        Math.abs(p[0].x - p[1].x) < 0.001 &&
        Math.abs(p[1].z - p[2].z) < 0.001 &&
        Math.abs(p[2].x - p[3].x) < 0.001 &&
        Math.abs(p[3].z - p[0].z) < 0.001 &&
        Math.abs(Math.abs(p[0].x - p[2].x) - FORMATION_SPACING) < 0.001 &&
        Math.abs(Math.abs(p[0].z - p[2].z) - FORMATION_SPACING) < 0.001);
    if (this.destinationOutline.visible) {
      const positions =
        this.destinationOutline.geometry.getAttribute("position");
      p.forEach((point, i) => positions.setXYZ(i, point.x, 0.055, point.z));
      this.destinationOutline.geometry.setDrawRange(0, p.length);
      positions.needsUpdate = true;
      this.destinationOutline.material.color.setHex(color);
      this.destinationOutline.material.opacity = fade * 0.25;
    }
  }

  updateAim(ground: Vec3, visible: boolean) {
    this.aiming.visible = visible;
    if (!visible) return;
    const grenade = this.sim.weapon === "grenade";
    this.aimRing.scale.setScalar(grenade ? 1.6 : 1);
    this.aimRing.material.depthTest = grenade;
    this.aimTicks.visible = this.aimGround.visible = this.aimHeight.visible =
      this.aimGuides.visible = !grenade;
    const actor = this.sim.grenadeThrower;
    this.blastPreview.visible = this.arc.visible = grenade && !!actor;
    if (!grenade) {
      const aim = this.sim.aim;
      this.aimRing.position.copy(aim);
      this.aimRing.quaternion.copy(this.camera.quaternion);
      this.aimGround.position.set(aim.x, 0.07, aim.z);
      const height = this.aimHeight.geometry.getAttribute("position");
      height.setXYZ(0, aim.x, 0.07, aim.z);
      height.setXYZ(1, aim.x, aim.y, aim.z);
      height.needsUpdate = true;
      const guides = this.aimGuides.geometry.getAttribute("position");
      let count = 0;
      for (const operator of this.sim.active) {
        if (
          !this.sim.followsOrder(operator, this.sim.weapon)
        )
          continue;
        const { from, to } = this.sim.aimTrace(operator);
        guides.setXYZ(count++, from.x, from.y, from.z);
        guides.setXYZ(count++, to.x, to.y, to.z);
      }
      this.aimGuides.geometry.setDrawRange(0, count);
      guides.needsUpdate = true;
      return;
    }
    this.aimRing.position.set(ground.x, 0.07, ground.z);
    this.aimRing.rotation.set(-Math.PI / 2, 0, 0);
    if (!actor) return;
    const from = this.sim.grenadeOrigin(actor, ground);
    const { velocity, duration } = grenadeVelocity(from, ground);
    const points = [new THREE.Vector3(from.x, from.y, from.z)];
    for (
      let t = 0.055;
      t < Math.min(GRENADE_FUSE, duration + 0.2);
      t += 0.055
    ) {
      const next = new THREE.Vector3(
        from.x + velocity.x * t,
        from.y + velocity.y * t - (GRAVITY * t * t) / 2,
        from.z + velocity.z * t,
      );
      const last = points.at(-1)!;
      const hit = this.sim.ray(last, next, actor.body);
      if (hit) {
        const direction = next.clone().sub(last).normalize();
        points.push(last.clone().addScaledVector(direction, hit.timeOfImpact));
        break;
      }
      points.push(next);
      if (next.y <= 0.14) break;
    }
    this.arc.geometry.dispose();
    this.arc.geometry = new THREE.BufferGeometry().setFromPoints(points);
    this.arc.computeLineDistances();
    const end = points.at(-1)!;
    this.blastPreview.position.set(end.x, 0.07, end.z);
    this.aimRing.position.set(end.x, 0.08, end.z);
  }

  inspectAim() {
    const guides = this.aimGuides.geometry.getAttribute("position");
    return {
      visible: this.aiming.visible,
      target: this.aimRing.position.toArray(),
      ground: this.aimGround.position.toArray(),
      guides: this.aiming.visible && this.aimGuides.visible
        ? Array.from(guides.array).slice(
            0, this.aimGuides.geometry.drawRange.count * 3,
          )
        : [],
      operators: this.sim.active.map((a) => ({
        id: a.id,
        pitch: this.actors.get(a.id)!.torso.rotation.x,
      })),
    };
  }

  inspectLabels() {
    const markers = this.destinationMarkers.filter((m) => this.destinations.visible && m.root.visible);
    return {
      enabled: this.auxLabels,
      worldCount: this.environmentLabels.children.length,
      worldVisible: this.environmentLabels.visible,
      formationRings: markers.length,
      formationNumbers: markers.filter((m) => m.number.visible).length,
    };
  }

  event(e: GameEvent) {
    if (e.type === "shot") {
      const from = new THREE.Vector3(e.from.x, e.from.y, e.from.z),
        to = new THREE.Vector3(e.to.x, e.to.y, e.to.z);
      const length = from.distanceTo(to);
      const mesh = new THREE.Mesh(
        unitCylinder,
        new THREE.MeshBasicMaterial({
          color: this.sim.actors.find((a) => a.id === e.actor)?.kind === "enemy" ? 0xf59a68 : 0xffd17a,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      mesh.position.copy(from).add(to).multiplyScalar(0.5);
      mesh.scale.set(0.013, length, 0.013);
      mesh.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 1, 0),
        to.clone().sub(from).normalize(),
      );
      this.scene.add(mesh);
      this.trails.push({ mesh, life: 0.055 });
      this.flashes.set(e.actor, 0.048);
      this.lightFlash.position.copy(from);
      this.lightFlash.intensity = 2;
      this.emit(
        e.to,
        e.material === "metal" ? 9 : 5,
        e.material === "metal" ? 0xffc168 : 0x9e9b86,
        2.7,
        false,
        0.05,
      );
      this.dummy.position.set(
        e.to.x + e.normal.x * 0.013,
        e.to.y + e.normal.y * 0.013,
        e.to.z + e.normal.z * 0.013,
      );
      this.dummy.quaternion.setFromUnitVectors(
        new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(e.normal.x, e.normal.y, e.normal.z),
      );
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      // Decals on static concrete only: targets and crates can move.
      if (e.material === "concrete") {
        this.bulletMarks.setMatrixAt(this.markIndex % 180, this.dummy.matrix);
        this.markIndex++;
        this.bulletMarks.count = Math.min(180, this.markIndex);
        this.bulletMarks.instanceMatrix.needsUpdate = true;
      }
    } else if (e.type === "explosion") {
      this.emit(e.position, 30, 0xffb661, 11, false, 0.1);
      this.emit(e.position, 35, 0x8e8a79, 4.2, true, 0.6);
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.96, 1, 64),
        new THREE.MeshBasicMaterial({
          color: 0xe5ce9c,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(e.position.x, 0.07, e.position.z);
      this.scene.add(ring);
      this.blastRings.push({ mesh: ring, age: 0 });
      this.lightFlash.position.set(
        e.position.x,
        e.position.y + 1,
        e.position.z,
      );
      this.lightFlash.intensity = 35;
      this.shake = this.reducedMotion ? 0 : 0.11;
    } else if (e.type === "down")
      this.emit(e.position, 8, 0x848679, 1.8, false, 0.09);
  }

  private emit(
    position: Vec3,
    count: number,
    color: number,
    speed: number,
    smoke: boolean,
    size: number,
  ) {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= 400) this.particles.shift();
      const angle = Math.random() * Math.PI * 2,
        velocity = speed * (0.3 + Math.random() * 0.7),
        life = smoke ? 0.65 + Math.random() * 0.8 : 0.13 + Math.random() * 0.32;
      this.particles.push({
        p: new THREE.Vector3(
          position.x,
          Math.max(0.08, position.y),
          position.z,
        ),
        v: new THREE.Vector3(
          Math.cos(angle) * velocity,
          Math.random() * velocity * 0.8 + 0.5,
          Math.sin(angle) * velocity,
        ),
        life,
        max: life,
        size: size * (0.5 + Math.random()),
        color: new THREE.Color(color),
        smoke,
      });
    }
  }

  render(alpha: number, delta: number, elapsed: number, paused = false) {
    this.renderer.info.reset();
    this.updateCamera();
    this.cityView?.update(this.sim, this.sim.sniping ? this.scope.camera : this.camera, paused ? 0 : delta);
    this.cartFleet?.update(alpha, paused ? 0 : delta, this.sim.time);
    this.kiteFleet?.update(alpha, paused ? 0 : delta);
    this.porterFleet?.update(alpha);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - delta * 0.6);
    }
    for (const [id, visual] of this.actors)
      if (!this.sim.actors.some((a) => a.id === id)) {
        this.disposeActor(visual);
        this.actors.delete(id);
        this.flashes.delete(id);
      }
    for (const [id, marker] of this.entryMarkers) {
      const pending = this.sim.arena && this.sim.arena.phase !== "active" && this.sim.arena.phase !== "defeat";
      marker.material.opacity = pending && this.sim.arena!.entries.includes(id)
        ? 0.45 + Math.sin(elapsed * 6) * 0.25 : 0.12;
    }
    for (const a of this.sim.actors) {
      if (!this.actors.has(a.id)) this.actors.set(a.id, this.makeActor(a));
      const v = this.actors.get(a.id)!;
      const p = a.body.translation();
      v.root.position.set(
        THREE.MathUtils.lerp(a.previous.x, p.x, alpha),
        THREE.MathUtils.lerp(a.previous.y, p.y, alpha),
        THREE.MathUtils.lerp(a.previous.z, p.z, alpha),
      );
      if (a.dead) {
        const q = a.body.rotation();
        v.root.quaternion
          .set(
            a.previousRotation.x,
            a.previousRotation.y,
            a.previousRotation.z,
            a.previousRotation.w,
          )
          .slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
      } else {
        v.root.rotation.set(0, a.yaw, 0);
      }
      const velocity = a.body.linvel(),
        speed = Math.hypot(velocity.x, velocity.z);
      const stagger = this.sim.isDisrupted(a) ? a.stagger / a.staggerDuration : 0;
      const stride = a.dead || a.braced || stagger > 0 ? 0 : Math.min(0.5, speed * 0.12);
      v.legs.forEach((leg, i) => {
        leg.rotation.x = Math.sin(elapsed * 10 + i * Math.PI) * stride;
      });
      const aim = this.sim.actorAim(a);
      const aimingFirearm = a.model === "sniper" || !!a.cover || a.kind === "enemy" || (
        this.sim.selected.has(a.id) && this.sim.weapon !== "grenade" && this.sim.followsOrder(a, this.sim.weapon)
      );
      v.torso.rotation.x = a.dead
        ? 0
        : aimingFirearm
          ? -Math.atan2(
              aim.y - p.y - 0.42,
              Math.hypot(aim.x - p.x, aim.z - p.z),
            ) -
            a.recoil * 0.13
          : a.braced
            ? -0.12
            : -a.recoil * 0.13;
      if (v.primaryGun) v.primaryGun.visible = a.weapon !== "pistol";
      if (v.pistol) v.pistol.visible = a.weapon === "pistol";
      if (v.bipod) v.bipod.visible = a.braced && a.weapon === "rifle" && !a.dead;
      if (v.barrels && !a.dead) v.barrels.rotation.z += delta * a.spin * Math.PI * 10;
      v.flash.position.z = FIREARMS[a.weapon].muzzle;
      v.torso.rotation.z = a.dead
        ? 0
        : Math.sin(elapsed * 35) * (1 - a.stability) * 0.1;
      if (stagger > 0) {
        const length = Math.hypot(a.knockback.x, a.knockback.z) || 1;
        const forward = (a.knockback.x * Math.sin(a.yaw) + a.knockback.z * Math.cos(a.yaw)) / length;
        const sideways = (a.knockback.x * Math.cos(a.yaw) - a.knockback.z * Math.sin(a.yaw)) / length;
        v.torso.rotation.x += stagger * forward * 0.28;
        v.torso.rotation.z -= stagger * sideways * 0.23;
      }
      v.ring.visible =
        !a.dead && (a.kind === "enemy" || (a.kind === "player" && this.sim.selected.has(a.id)));
      v.ring.position.set(v.root.position.x, 0.047, v.root.position.z);
      (v.ring.material as THREE.MeshBasicMaterial).color.set(
        stagger > 0 ? 0xffd28a : a.kind === "enemy" ? a.ai?.state === "aiming" || a.firing ? 0xef9a64 : ORANGE : a.braced ? AMBER : MINT,
      );
      v.ring.scale.setScalar(stagger > 0 ? 1 + stagger * 0.2 : a.kind === "enemy" && a.ai?.state === "aiming" ? 1.05 + Math.sin(elapsed * 9) * 0.12 : 1);
      v.health.visible =
        !a.dead &&
        (a.kind === "enemy" || (a.hp < a.maxHp &&
        (this.sim.time - a.hitTime < 4 || a.kind === "player")));
      v.health.position.set(
        v.root.position.x,
        v.root.position.y + 1.25,
        v.root.position.z,
      );
      v.health.scale.x = Math.max(0.1, (a.hp / a.maxHp) * 1.3);
      const flash = (this.flashes.get(a.id) ?? 0) - delta;
      this.flashes.set(a.id, flash);
      v.flash.visible = flash > 0 && !a.dead;
    }
    for (const p of this.sim.props) {
      const visual = this.props.get(p.id)!;
      const position = p.body.translation(),
        q = p.body.rotation();
      visual.position.set(
        THREE.MathUtils.lerp(p.previous.x, position.x, alpha),
        THREE.MathUtils.lerp(p.previous.y, position.y, alpha),
        THREE.MathUtils.lerp(p.previous.z, position.z, alpha),
      );
      visual.quaternion
        .set(
          p.previousRotation.x,
          p.previousRotation.y,
          p.previousRotation.z,
          p.previousRotation.w,
        )
        .slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
    }
    for (const [id, visual] of this.grenades)
      if (!this.sim.grenades.some((g) => g.id === id)) {
        this.dynamic.remove(visual);
        this.grenades.delete(id);
        const hazard = this.grenadeHazards.get(id);
        if (hazard) {
          hazard.removeFromParent();
          hazard.geometry.dispose();
          hazard.material.dispose();
          this.grenadeHazards.delete(id);
        }
      }
    for (const g of this.sim.grenades) {
      if (!this.grenades.has(g.id)) {
        const group = new THREE.Group();
        const body = new THREE.Mesh(unitSphere, yellow);
        body.scale.set(0.16, 0.19, 0.16);
        group.add(body);
        box(group, 0.07, 0.15, 0.04, 0.02, 0.2, 0, silver);
        const marker = new THREE.Mesh(unitSphere, glow);
        marker.scale.setScalar(0.045);
        marker.position.y = 0.27;
        group.add(marker);
        this.dynamic.add(group);
        this.grenades.set(g.id, group);
        if (g.team === "enemy") {
          const hazard = new THREE.Mesh(new THREE.RingGeometry(BLAST_RADIUS - 0.07, BLAST_RADIUS, 64),
            new THREE.MeshBasicMaterial({ color: 0xef9a64, transparent: true, opacity: 0.5, depthWrite: false, depthTest: false }));
          hazard.rotation.x = -Math.PI / 2;
          this.dynamic.add(hazard);
          this.grenadeHazards.set(g.id, hazard);
        }
      }
      const visual = this.grenades.get(g.id)!;
      const position = g.body.translation(),
        q = g.body.rotation();
      visual.position.set(
        THREE.MathUtils.lerp(g.previous.x, position.x, alpha),
        THREE.MathUtils.lerp(g.previous.y, position.y, alpha),
        THREE.MathUtils.lerp(g.previous.z, position.z, alpha),
      );
      visual.quaternion.set(q.x, q.y, q.z, q.w);
      visual.children[2].visible =
        Math.sin(g.fuse * (g.fuse < 0.6 ? 35 : 18)) > 0;
      const hazard = this.grenadeHazards.get(g.id);
      if (hazard) {
        hazard.position.set(position.x, 0.075, position.z);
        hazard.material.opacity = 0.45 + Math.sin(g.fuse * 14) * 0.2;
      }
    }
    for (const t of this.trails) {
      t.life -= delta;
      (t.mesh.material as THREE.MeshBasicMaterial).opacity =
        Math.max(0, t.life / 0.055) * 0.8;
    }
    this.trails = this.trails.filter((t) => {
      if (t.life > 0) return true;
      this.scene.remove(t.mesh);
      (t.mesh.material as THREE.Material).dispose();
      return false;
    });
    this.particles = this.particles.filter((p) => p.life > 0);
    this.particleMesh.count = this.particles.length;
    this.particles.forEach((p, i) => {
      p.life -= delta;
      p.p.addScaledVector(p.v, delta);
      p.v.y -= (p.smoke ? -0.6 : 10) * delta;
      p.v.multiplyScalar(Math.exp(-delta * (p.smoke ? 2.2 : 0.8)));
      if (p.p.y < 0.05) {
        p.p.y = 0.05;
        p.v.y *= -0.2;
        p.v.x *= 0.8;
        p.v.z *= 0.8;
      }
      this.dummy.position.copy(p.p);
      this.dummy.quaternion.identity();
      this.dummy.scale.setScalar(
        Math.max(
          0.001,
          p.size * (p.smoke ? 1.5 - p.life / p.max : p.life / p.max),
        ),
      );
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(i, this.dummy.matrix);
      this.particleMesh.setColorAt(
        i,
        p.color
          .clone()
          .multiplyScalar(p.smoke ? 0.5 + (0.5 * p.life) / p.max : 1),
      );
    });
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor)
      this.particleMesh.instanceColor.needsUpdate = true;
    for (const b of this.blastRings) {
      b.age += delta;
      b.mesh.scale.setScalar(0.2 + b.age * 15);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.5 - b.age,
      );
    }
    this.blastRings = this.blastRings.filter((b) => {
      if (b.age < 0.5) return true;
      this.scene.remove(b.mesh);
      b.mesh.geometry.dispose();
      (b.mesh.material as THREE.Material).dispose();
      return false;
    });
    this.updateDestinations(delta);
    this.lightFlash.intensity *= Math.exp(-delta * 22);
    const operator = this.sim.rifleOperator;
    const visual = operator && this.actors.get(operator.id);
    // Allies can intercept rifle shots, so only the operator is hidden in scope.
    const sniping = this.scope.render(
      this.renderer,
      this.scene,
      this.sim,
      visual
        ? [
            visual.root,
            visual.ring,
            visual.health,
            this.aiming,
            this.destinations,
          ]
        : [],
      !paused,
    );
    if (!sniping) this.renderer.render(this.scene, this.camera);
  }
}
