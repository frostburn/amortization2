import * as THREE from "three";
import { BUILDING_KIT, type BuildingSpec, type CityDistrict } from "../game/city";
import type { Simulation } from "../game/simulation";
import { batchRigid, block, panel, surface, tube } from "./primitives";
import { WaterView } from "./water";
import { makeStreets } from "./streets";
import { makeDeliveryPad } from "./kites";

type BuildingView = { spec: BuildingSpec; root: THREE.Group; materials: THREE.MeshStandardMaterial[];
  bounds: THREE.Box3; shutter?: THREE.Mesh; opacity: number; closed: number };

type Opening = { x: number; y: number; w: number; h: number };
/** Exterior wall faces around actual openings, with recessed panes and frame rings. */
function facade(w: number, h: number, openings: Opening[], wall: THREE.Material, frame: THREE.Material, glass: THREE.Material) {
  const root = new THREE.Group();
  const levels = [...new Set([0, h, ...openings.flatMap(o => [o.y - o.h / 2, o.y + o.h / 2])])].sort((a, b) => a - b);
  for (let i = 1; i < levels.length; i++) {
    const bottom = levels[i - 1], top = levels[i];
    const gaps = openings.filter(o => o.y - o.h / 2 <= bottom && o.y + o.h / 2 >= top).sort((a, b) => a.x - b.x);
    let left = -w / 2;
    for (const gap of [...gaps, { x: w / 2, w: 0 }]) {
      const right = gap.x - gap.w / 2;
      if (right > left) panel(root, right - left, top - bottom, (left + right) / 2, (top + bottom) / 2, 0, wall);
      left = Math.max(left, gap.x + gap.w / 2);
    }
  }
  for (const o of openings) {
    const border = 0.14;
    for (const side of [-1, 1]) {
      block(root, o.w, border, 0.12, o.x, o.y + side * (o.h - border) / 2, 0.06, frame);
      block(root, border, o.h - border * 2, 0.12, o.x + side * (o.w - border) / 2, o.y, 0.06, frame);
    }
    panel(root, o.w - border * 2, o.h - border * 2, o.x, o.y, 0.04, glass);
  }
  return root;
}

// A small reusable kit: repeated window bays, storefront, service roof and shutter.
export function makeBuilding(spec: BuildingSpec, shared?: Map<string, THREE.MeshStandardMaterial>, coverage = true): BuildingView {
  const paint = (color: number, metalness = 0, roughness = 0.85) => {
    const key = `${color}/${metalness}/${roughness}`;
    const mat = shared?.get(key) ?? surface(color, metalness, roughness);
    // MSAA coverage gives a smooth single-surface fade while retaining depth
    // writes, without transparency sorting or noisy hashed fragments.
    mat.alphaToCoverage = coverage;
    shared?.set(key, mat); return mat;
  };
  const kit = BUILDING_KIT[spec.prefab], root = new THREE.Group();
  const wall = paint(({ brick: 0x9a7667, sand: 0xb8ad92, slate: 0x7d8a88 })[spec.finish]);
  wall.shadowSide = THREE.DoubleSide;
  const frame = paint(0x49585b, 0.4), glass = paint(0x354c52, 0.5, 0.35);
  const trim = paint(0xd0c9b2), accent = paint(spec.accent), roof = paint(0x656d6b);
  const materials = [wall, frame, glass, trim, accent, roof];
  const { w, h, d } = kit, front = d / 2;
  const windows: Opening[] = [];
  const sideWindows: Opening[] = [];
  for (let f = 0; f < kit.floors; f++) {
    for (const x of [-7.5, -3.75, 0, 3.75, 7.5].filter(x => Math.abs(x) + 1.18 < w / 2))
      windows.push({ x, y: 2 + f * 3.35, w: 2.35, h: 2.1 });
    for (const x of [-d / 4, d / 4]) sideWindows.push({ x, y: 2 + f * 3.35, w: 2.35, h: 2.1 });
  }
  const shop = spec.prefab === "shop";
  const frontWindows = windows.filter(o => o.y !== 2 || (!shop && o.x !== 0));
  frontWindows.push({ x: 0, y: 1.5, w: 2.5, h: 3 });
  if (shop) for (const x of [-5.5, 5.5]) frontWindows.push({ x, y: 1.625, w: 6.7, h: 2.85 });
  if (spec.prefab === "depot") {
    frontWindows.length = 0;
    for (const x of [-5.5, 5.5]) frontWindows.push({ x, y: 2.1, w: 6.2, h: 4.2 });
  }
  for (const side of [-1, 1]) {
    const face = facade(w, h, side === 1 ? frontWindows : windows, wall, frame, glass);
    face.position.z = side * front; face.rotation.y = side === 1 ? 0 : Math.PI; root.add(face);
    const end = facade(d, h, sideWindows, wall, frame, glass);
    end.position.x = side * w / 2; end.rotation.y = side * Math.PI / 2; root.add(end);
  }
  block(root, w, 0.12, d, 0, 0.06, 0, wall);
  block(root, w + 0.25, 0.32, d + 0.25, 0, h + 0.16, 0, trim);
  block(root, w - 0.7, 0.18, d - 0.7, 0, h + 0.37, 0, roof);
  for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) {
    block(root, 0.32, h, 0.12, x, h / 2, front + 0.09, trim);
    block(root, 0.32, h, 0.12, x, h / 2, -front - 0.09, trim);
  }
  block(root, 0.09, 2.72, 0.05, 0, 1.5, front + 0.11, trim);
  if (shop) {
    block(root, 16.8, 0.18, 2, 0, 3.45, front + 0.6, accent);
    block(root, 16.8, 0.5, 0.13, 0, 3.15, front + 1.55, accent);
    for (const x of [-5.5, 5.5]) {
      for (const shelf of [0.7, 1.2, 1.7])
        block(root, 5.5, 0.09, 0.1, x, shelf, front + 0.145, accent);
    }
  }
  if (spec.prefab === "depot") {
    block(root, w - 0.6, 0.5, 0.2, 0, 4.85, front + 0.12, accent);
    for (const x of [-5.5, 5.5]) for (let y = 0.6; y < 4.2; y += 0.6)
      block(root, 5.9, 0.055, 0.03, x, y, front + 0.065, frame);
    for (const z of [-5.5, 0, 5.5]) {
      const rooflight = block(root, w - 1, 0.14, 2, 0, h + 0.65, z, glass);
      rooflight.rotation.x = 0.22;
    }
  } else if (spec.prefab === "civic") {
    block(root, 11.5, 0.3, 2.2, 0, 3.55, front + 0.75, accent);
    for (const x of [-10.2, 10.2]) block(root, 0.55, h - 0.4, 0.28, x, (h - 0.4) / 2, front + 0.14, trim);
    const clock = tube(root, 0.75, 0.08, 0, 7.85, front + 0.12, trim, 24); clock.rotation.x = Math.PI / 2;
    block(root, 0.08, 0.48, 0.025, 0, 8.02, front + 0.17, frame);
    block(root, 0.42, 0.08, 0.025, 0.16, 7.85, front + 0.17, frame);
  } else if (spec.prefab === "pump") {
    tube(root, 0.32, h + 1.8, -4.9, (h + 1.8) / 2, -4.7, frame, 12);
    tube(root, 0.48, 0.15, -4.9, h + 1.8, -4.7, accent, 12);
    const pipe = tube(root, 0.16, 5.5, -4.9, 0.7, 0, accent); pipe.rotation.x = Math.PI / 2;
    block(root, 1.6, 0.7, 0.18, -3.8, 1.6, front + 0.1, frame);
  }
  const serviceZ = spec.prefab === "depot" ? -7.5 : -1.2;
  for (const x of [-w * 0.227, w * 0.227]) {
    block(root, 2.2, 0.9, 1.7, x, h + 0.9, serviceZ, frame);
    block(root, 1.9, 0.12, 1.4, x, h + 1.42, serviceZ, roof);
    for (let i = -3; i <= 3; i++) block(root, 1.8, 0.08, 0.07, x, h + 1.49, serviceZ + i * 0.16, trim);
  }
  batchRigid(root);
  let shutter: THREE.Mesh | undefined;
  if (spec.prefab === "shop" && !spec.backdrop) {
    // Separate articulated part; never bake it into the static facade.
    shutter = block(root, 16.3, 1, 0.12, 0, 3, front + 0.33, roof);
    shutter.visible = false;
  }
  root.position.set(spec.x, 0, spec.z); root.rotation.y = spec.turn * Math.PI / 2;
  return { spec, root, materials, shutter, opacity: 1, closed: 0,
    bounds: new THREE.Box3().setFromObject(root) };
}

export class CityView {
  root = new THREE.Group();
  private buildings: BuildingView[];
  private signals: { mesh: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; axis: number }[] = [];
  private water: WaterView[];
  private ray = new THREE.Ray();
  private intersection = new THREE.Vector3();
  constructor(district: CityDistrict, texture: THREE.Texture, private coverage = true) {
    const ground = new THREE.Group(), paving = surface(0x9c9f94);
    paving.map = texture;
    const white = surface(0xd3cdbc), dark = surface(0x344347, 0.4);
    const leaf = surface(0x566f53), earth = surface(0x737767);
    const extent = district.ground;
    block(ground, extent.right - extent.left, 0.16, extent.front - extent.back,
      (extent.left + extent.right) / 2, -0.1, (extent.back + extent.front) / 2, earth);
    ground.add(makeStreets(district, texture));
    // Pad paint sits above paving; keep it out of the baked street surfaces.
    for (const pad of district.pads) this.root.add(makeDeliveryPad(pad));
    for (const f of district.furniture) {
      if (f.fixture === "signal") {
        tube(ground, 0.035, 1.65, f.x, 0.825, f.z, dark);
        const mat = new THREE.MeshBasicMaterial({ color: 0x8cb6a0 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.32, 0.1), mat);
        mesh.position.set(f.x, 1.7, f.z);
        if (f.axis) mesh.rotation.y = Math.PI / 2;
        this.root.add(mesh); this.signals.push({ mesh, axis: f.axis });
      } else if (f.fixture === "lamp") {
        tube(ground, 0.075, f.h, f.x, f.h / 2, f.z, dark);
        block(ground, 1.2, 0.12, 0.25, f.x + Math.sign(f.x) * 0.5, f.h - 0.05, f.z, dark);
        block(ground, 0.9, 0.04, 0.19, f.x + Math.sign(f.x) * 0.5, f.h - 0.13, f.z, white);
      } else if (f.fixture === "planter") {
        block(ground, f.w, f.h, f.d, f.x, f.h / 2, f.z, paving);
        block(ground, f.w - 0.2, 0.2, f.d - 0.2, f.x, f.h - 0.07, f.z, leaf);
      } else {
        block(ground, f.w, 0.12, f.d, f.x, 0.48, f.z, dark);
        block(ground, 0.15, 0.4, f.d, f.x - Math.sign(f.x) * 0.3, 0.69, f.z, dark);
        for (const dz of [-0.85, 0.85]) block(ground, 0.5, 0.45, 0.12, f.x, 0.225, f.z + dz, dark);
      }
    }
    batchRigid(ground); this.root.add(ground);
    this.water = district.water.map(spec => new WaterView(spec));
    this.water.forEach(w => this.root.add(w.root));
    const background = new THREE.Group(), shared = new Map<string, THREE.MeshStandardMaterial>();
    this.buildings = [];
    for (const spec of district.buildings) {
      const building = makeBuilding(spec, spec.backdrop ? shared : undefined, coverage);
      if (spec.backdrop) background.add(building.root);
      else { this.buildings.push(building); this.root.add(building.root); }
    }
    batchRigid(background); this.root.add(background);
  }

  update(sim: Simulation, camera: THREE.Camera, delta: number) {
    if (!sim.city) return;
    this.water.forEach(w => w.update(sim.time));
    for (const signal of this.signals) signal.mesh.material.color.setHex(signal.axis === sim.city.crossing ? 0x87d5b5 : 0xb78159);
    for (const b of this.buildings) {
      const obscures = !sim.sniping && !b.spec.backdrop && sim.active.some(a => {
        const p = a.body.translation(), target = new THREE.Vector3(p.x, p.y, p.z);
        this.ray.set(camera.position, target.clone().sub(camera.position).normalize());
        const hit = this.ray.intersectBox(b.bounds, this.intersection);
        return !!hit && hit.distanceTo(camera.position) < target.distanceTo(camera.position);
      });
      b.opacity = sim.sniping ? 1 : THREE.MathUtils.damp(b.opacity, obscures ? 0.22 : 1, 9, delta);
      for (const mat of b.materials) {
        const transparent = !this.coverage && b.opacity < 0.995;
        if (mat.transparent !== transparent) { mat.transparent = transparent; mat.needsUpdate = true; }
        mat.depthWrite = !transparent;
        mat.opacity = b.opacity;
      }
      if (b.shutter) {
        b.closed = THREE.MathUtils.damp(b.closed, sim.city.isClosed(b.spec.id) ? 1 : 0, 5, delta);
        b.shutter.visible = b.closed > 0.01;
        b.shutter.scale.y = Math.max(0.01, b.closed * 2.9);
        b.shutter.position.y = 3.1 - b.closed * 1.45;
      }
    }
  }
}
