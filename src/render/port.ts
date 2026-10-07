import * as THREE from "three";
import type { CityDistrict } from "../game/city";
import { CONTAINER, type ContainerSpec, type CraneSpec } from "../game/port";
import { batchRigid, block, surface, tube } from "./primitives";

/** Standard intermodal dimensions, corrugated sides and paired locking doors. */
export function makeContainer(spec: ContainerSpec, shared?: Map<string, THREE.MeshStandardMaterial>) {
  const root = new THREE.Group(), length = CONTAINER[spec.length], h = CONTAINER.height, d = CONTAINER.width;
  const material = (color: number, metalness: number) => {
    const key = `${color}/${metalness}`, mat = shared?.get(key) ?? surface(color, metalness);
    shared?.set(key, mat); return mat;
  };
  const paint = material(spec.color, 0.25), frame = material(0x48595b, 0.6), steel = material(0xb5b6a7, 0.55);
  for (let level = 0; level < spec.levels; level++) {
    const y = level * h;
    block(root, length - 0.08, h - 0.08, d - 0.1, 0, y + h / 2, 0, paint);
    for (const side of [-1, 1]) {
      for (let x = -length / 2 + 0.22; x < length / 2; x += 0.3)
        block(root, 0.045, h - 0.18, 0.07, x, y + h / 2, side * (d / 2 - 0.035), paint);
      for (const height of [0.065, h - 0.065]) block(root, length, 0.13, 0.1, 0, y + height, side * (d / 2 - 0.05), frame);
      for (const x of [-length / 2 + 0.06, length / 2 - 0.06])
        block(root, 0.12, h - 0.26, 0.12, x, y + h / 2, side * (d / 2 - 0.06), frame);
    }
    for (const z of [-d / 4, d / 4]) {
      block(root, 0.03, h - 0.27, d / 2 - 0.12, length / 2 - 0.025, y + h / 2, z, paint);
      block(root, 0.07, h - 0.45, 0.035, length / 2 + 0.025, y + h / 2, z, steel);
      block(root, 0.1, 0.055, 0.27, length / 2 + 0.045, y + 0.7, z - 0.1, steel);
    }
  }
  batchRigid(root); root.position.set(spec.x, 0.035, spec.z); root.rotation.y = spec.turn * Math.PI / 2;
  return root;
}

function beam(root: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material) {
  const direction = to.clone().sub(from), mid = from.clone().add(to).multiplyScalar(0.5);
  const mesh = tube(root, radius, direction.length(), mid.x, mid.y, mid.z, mat, 8);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
}

/** Radar scanners, a radome, aerials and shielded lamps break up the mast silhouette. */
function makeNavigationMast() {
  const root = new THREE.Group(), paint = surface(0xc6c7b9), steel = surface(0x516a70, 0.45), black = surface(0x303e42);
  const lamp = surface(0xe0d3a7);
  tube(root, 0.09, 5.2, 0, 2.6, 0, paint);
  for (const side of [-1, 1]) {
    beam(root, new THREE.Vector3(side * 0.65, 0, -0.25), new THREE.Vector3(0, 1.65, 0), 0.045, steel);
    tube(root, 0.018, 3.6, side * 0.14, 1.8, -0.18, steel, 6);
  }
  for (let y = 0.25; y < 3.6; y += 0.3) block(root, 0.28, 0.025, 0.035, 0, y, -0.18, steel);
  for (const [y, length, angle] of [[1.8, 1.6, -0.35], [3.75, 2.8, 0.25]]) {
    block(root, 0.65, 0.09, 0.55, 0, y, 0, steel);
    tube(root, 0.17, 0.3, 0, y + 0.18, 0, black);
    const scanner = block(root, length, 0.2, 0.27, 0, y + 0.41, 0, paint);
    scanner.rotation.y = angle;
    block(root, 0.26, 0.12, 0.29, 0, y + 0.45, 0, steel);
  }
  block(root, 0.9, 0.08, 0.16, 0.4, 2.7, 0, steel);
  tube(root, 0.12, 0.16, 0.8, 2.8, 0, black);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 6), paint);
  dome.position.set(0.8, 3.04, 0); dome.castShadow = true; root.add(dome);
  block(root, 0.9, 0.08, 0.25, -0.35, 1.1, -0.15, steel);
  for (const [x, height] of [[-0.7, 1.35], [-0.38, 1.8]]) {
    tube(root, 0.055, 0.18, x, 1.2, -0.15, black);
    tube(root, 0.018, height, x, 1.28 + height / 2, -0.15, paint, 6);
  }
  for (const y of [4.55, 5.05]) {
    block(root, 0.09, 0.07, 0.34, 0, y - 0.14, 0.14, steel);
    tube(root, 0.095, 0.26, 0, y, 0.25, black);
    tube(root, 0.098, 0.12, 0, y, 0.25, lamp);
  }
  batchRigid(root); return root;
}

/** Bounded Warren trusses: both chords, connected diagonals and closed ends. */
export function makeCrane(c: CraneSpec, steel = surface(0x516a70, 0.45), safety = surface(0xc6af67), black = surface(0x303e42)) {
  const root = new THREE.Group();
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = c.x + sx * c.span / 2, z = c.z + sz * 4;
    block(root, 1.1, c.height, 1.1, x, c.height / 2, z, steel);
    block(root, 1.4, 0.7, 2.1, x, 0.35, z, black);
    for (let y = 0.18; y < 2.2; y += 0.45) block(root, 1.13, 0.2, 1.13, x, y, z, safety);
  }
  const left = c.x - c.span / 2 - 2, right = c.x + c.span / 2 + 24;
  const lower = c.height - 1.7, bays = Math.ceil((right - left) / 4), bay = (right - left) / bays;
  for (const sz of [-1, 1]) {
    const z = c.z + sz * 4;
    block(root, right - left, 1, 0.75, (left + right) / 2, c.height, z, steel);
    block(root, right - left, 0.24, 0.28, (left + right) / 2, lower, z, steel);
    for (let i = 0; i < bays; i++) beam(root,
      new THREE.Vector3(left + i * bay, i % 2 ? c.height : lower, z),
      new THREE.Vector3(left + (i + 1) * bay, i % 2 ? lower : c.height, z), 0.11, steel);
    for (const x of [left, right]) block(root, 0.22, c.height - lower, 0.28, x, (c.height + lower) / 2, z, steel);
  }
  for (const x of [c.x - c.span / 2, c.x + c.span / 2, right])
    block(root, 0.4, 0.5, 8.5, x, c.height, c.z, steel);
  block(root, 3.2, 0.6, 9, c.x + 17, c.height + 0.55, c.z, black);
  block(root, 1.8, 1.7, 2.2, c.x + 17, c.height - 1.35, c.z + 5.1, steel);
  block(root, 1.4, 0.8, 0.06, c.x + 17, c.height - 1.2, c.z + 6.23, black);
  for (const sz of [-1, 1]) beam(root,
    new THREE.Vector3(c.x + 17, c.height, c.z + sz * 2.6), new THREE.Vector3(c.x + 17, 8, c.z + sz * 2.6), 0.035, black);
  block(root, 3.5, 0.4, 6, c.x + 17, 7.8, c.z, safety);
  batchRigid(root); return root;
}

function makeShip(spec: NonNullable<CityDistrict["port"]>["ship"], shared: Map<string, THREE.MeshStandardMaterial>) {
  const root = new THREE.Group(), hull = surface(0x435e68, 0.45), deck = surface(0x9c9e90);
  const red = surface(0x785148, 0.15), cream = surface(0xc6c7b9), glass = surface(0x344d58, 0.45, 0.3);
  const outline = [[-0.38, -0.5], [0.38, -0.5], [0.5, -0.4], [0.5, 0.33], [0.35, 0.46],
    [0, 0.5], [-0.35, 0.46], [-0.5, 0.33], [-0.5, -0.4]];
  const ring = (y: number, scale: number) => outline.map(([x, z]) => new THREE.Vector3(x * spec.width * scale, y, z * spec.length));
  for (const [low, high, scaleLow, scaleHigh, mat] of [[-3.6, -0.65, 0.73, 1, red], [-0.65, 1.9, 1, 1, hull]] as const) {
    const a = ring(low, scaleLow), b = ring(high, scaleHigh), vertices: number[] = [];
    for (let i = 0; i < a.length; i++) {
      const next = (i + 1) % a.length;
      for (const v of [a[i], b[i], b[next], a[i], b[next], a[next]]) vertices.push(v.x, v.y, v.z);
    }
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2));
    geometry.setIndex(Array.from({ length: vertices.length / 3 }, (_, i) => i));
    geometry.computeVertexNormals(); geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
  }
  const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x * spec.width, z * spec.length)));
  const geometry = new THREE.ShapeGeometry(shape); geometry.rotateX(Math.PI / 2); geometry.userData.owned = true;
  // ShapeGeometry faces -Y after this rotation; keep the deck facing upward.
  geometry.rotateZ(Math.PI); geometry.computeVertexNormals();
  const floor = new THREE.Mesh(geometry, deck); floor.position.y = 1.9; floor.receiveShadow = true; root.add(floor);
  block(root, 11.5, 1.8, 14, 0, 2.8, -29, cream);
  block(root, 9.5, 2.2, 8, 0, 4.8, -31, cream);
  for (const x of [-3, 0, 3]) block(root, 2.1, 0.7, 0.06, x, 5.05, -26.96, glass);
  for (const side of [-1, 1]) for (const z of [-31, -28.8]) block(root, 0.06, 0.7, 1.55, side * 4.78, 5.05, z, glass);
  block(root, 2.2, 2.5, 2.4, 2.6, 6.2, -34, hull);
  const mast = makeNavigationMast(); mast.position.set(-1.8, 5.8, -31); root.add(mast);
  for (const side of [-1, 1]) {
    block(root, 0.28, 0.3, 0.3, side * 4.65, 5.52, -27.25, hull);
    block(root, 0.16, 0.13, 0.055, side * 4.65, 5.54, -27.075, surface(side < 0 ? 0xac6656 : 0x79a18b));
  }
  block(root, 12.5, 0.24, 30, 0, 2.03, 3, hull);
  for (const x of [-3.2, 3.2]) for (const z of [-6, 8]) {
    const container = makeContainer({ x: 0, z: 0, length: "40ft", turn: 1, levels: 1, color: x < 0 ? 0x8b6652 : 0x859080 }, shared);
    container.position.set(x, 2.15, z); root.add(container);
  }
  for (const side of [-1, 1]) {
    for (let z = -39; z < 31; z += 3) tube(root, 0.035, 0.9, side * 7.65, 2.35, z, cream, 6);
    beam(root, new THREE.Vector3(side * 7.65, 2.8, -39), new THREE.Vector3(side * 7.65, 2.8, 31), 0.035, cream);
    tube(root, 0.45, 0.9, side * 4.6, 2.35, 33, hull);
  }
  // Batch once before placement, including child containers; all material faces remain distinct.
  batchRigid(root); root.position.set(spec.x, 0, spec.z); return root;
}

export function makePort(district: CityDistrict) {
  const root = new THREE.Group(), kit = new THREE.Group(), port = district.port!;
  const shared = new Map<string, THREE.MeshStandardMaterial>();
  const steel = surface(0x516a70, 0.45), safety = surface(0xc6af67), black = surface(0x303e42), concrete = surface(0xaaa99b);
  for (const spec of port.containers) root.add(makeContainer(spec, shared));
  for (const c of port.cranes) kit.add(makeCrane(c, steel, safety, black));
  for (let z = -66; z <= 66; z += 12) {
    tube(kit, 0.23, 0.5, 44.2, 0.25, z, steel);
    const cap = tube(kit, 0.13, 0.85, 44.2, 0.4, z, steel); cap.rotation.z = Math.PI / 2;
    block(kit, 0.5, 1.8, 1.2, 46.37, -0.8, z, black);
  }
  // Paint is deliberately above the plaza's 0.033 m surface.
  for (let z = -68; z < 68; z += 2) block(kit, 0.22, 0.005, 1.1, 44.9, 0.039, z, safety);
  for (const route of district.porterRoutes ?? []) for (const p of route.points.filter(p => p.station)) {
    const x = p.x + Math.sin(p.station!.yaw) * 0.72, z = p.z + Math.cos(p.station!.yaw) * 0.72;
    block(kit, 0.9, 0.08, 0.64, x, 0.66, z, steel);
    for (const side of [-1, 1]) block(kit, 0.1, 0.62, 0.52, x + side * 0.34, 0.31, z, steel);
    block(kit, 0.94, 0.004, 1.6, p.x, 0.039, p.z, safety);
  }
  for (const z of [-30, 29]) beam(kit, new THREE.Vector3(44.2, 0.4, z), new THREE.Vector3(port.ship.x - 7.7, 2.3, z), 0.035, black);
  // Quayside retaining face continues below the harbor surface.
  block(kit, 0.7, 6, 200, 46, -3, 0, concrete);
  batchRigid(kit); root.add(kit, makeShip(port.ship, shared)); batchRigid(root);
  return root;
}
