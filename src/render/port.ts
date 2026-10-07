import * as THREE from "three";
import type { CityDistrict } from "../game/city";
import { CONTAINER, type ContainerSpec } from "../game/port";
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
  tube(root, 0.065, 5.2, -1.8, 8.4, -31, cream);
  block(root, 3, 0.11, 0.12, -1.8, 10.3, -31, cream);
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
  for (const c of port.cranes) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = c.x + sx * c.span / 2, z = c.z + sz * 4;
      block(kit, 1.1, c.height, 1.1, x, c.height / 2, z, steel);
      block(kit, 1.4, 0.7, 2.1, x, 0.35, z, black);
      for (let y = 0.18; y < 2.2; y += 0.45) block(kit, 1.13, 0.2, 1.13, x, y, z, safety);
    }
    for (const sz of [-1, 1]) {
      block(kit, c.span + 26, 1, 0.75, c.x + 11, c.height, c.z + sz * 4, steel);
      for (let x = c.x - c.span / 2; x < c.x + c.span / 2 + 25; x += 4)
        beam(kit, new THREE.Vector3(x, c.height - 1.7, c.z + sz * 4), new THREE.Vector3(x + 4, c.height, c.z + sz * 4), 0.11, steel);
    }
    block(kit, 3.2, 0.6, 9, c.x + 17, c.height + 0.55, c.z, black);
    block(kit, 1.8, 1.7, 2.2, c.x + 17, c.height - 1.35, c.z + 5.1, steel);
    block(kit, 1.4, 0.8, 0.06, c.x + 17, c.height - 1.2, c.z + 6.23, black);
    for (const sz of [-1, 1]) {
      beam(kit, new THREE.Vector3(c.x + 17, c.height, c.z + sz * 2.6), new THREE.Vector3(c.x + 17, 8, c.z + sz * 2.6), 0.035, black);
    }
    block(kit, 3.5, 0.4, 6, c.x + 17, 7.8, c.z, safety);
  }
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
