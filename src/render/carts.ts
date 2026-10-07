import * as THREE from "three";
import type { CivilianCart } from "../game/civilians";
import type { GroundCivilianModel } from "../game/city";
import { batchRigid, block, surface, tube } from "./primitives";

function cartBody() {
  const body = new THREE.Group(), plastic = surface(0xd5d3c1), rubber = surface(0x252e31), steel = surface(0x768383, 0.5);
  block(body, 0.65, 0.4, 0.85, 0, 0.06, 0, plastic);
  block(body, 0.59, 0.09, 0.77, 0, -0.19, 0, rubber);
  block(body, 0.56, 0.13, 0.025, 0, 0.12, 0.441, rubber);
  for (const x of [-0.21, 0.21]) block(body, 0.065, 0.055, 0.033, x, 0.11, 0.461, steel);
  for (const x of [-0.36, 0.36]) for (const z of [-0.32, 0, 0.32]) {
    const tire = tube(body, 0.15, 0.095, x, -0.16, z, rubber, 12); tire.rotation.z = Math.PI / 2;
    const hub = tube(body, 0.075, 0.105, x, -0.16, z, steel, 8); hub.rotation.z = Math.PI / 2;
  }
  tube(body, 0.008, 0.9, -0.24, 0.66, -0.3, steel, 5);
  block(body, 0.18, 0.13, 0.018, -0.19, 1.08, -0.3, plastic);
  return body;
}

/** Six wheels, a low battery base and three independent parcel compartments. */
export function crateBody() {
  const body = new THREE.Group(), shell = surface(0xbfc7c2), rubber = surface(0x252e31), steel = surface(0x677779, 0.5);
  const interior = surface(0x394648), parcel = surface(0xa6936d);
  block(body, 0.92, 0.09, 1.12, 0, -0.445, 0, rubber);
  block(body, 0.94, 0.12, 1.12, 0, 0.56, 0, shell);
  block(body, 0.82, 0.9, 0.08, 0, 0.05, -0.52, shell);
  for (const x of [-0.44, 0.44]) block(body, 0.06, 0.9, 1.12, x, 0.05, 0, shell);
  // Shelves fit inside the cabinet, recessed from the shell's exposed edges.
  // The roof closes the top compartment itself.
  block(body, 0.80, 0.86, 0.04, 0, 0.05, -0.45, interior);
  for (const y of [-0.38, -0.06, 0.26]) block(body, 0.80, 0.035, 0.94, 0, y, 0.03, steel);
  for (const y of [-0.22, 0.10, 0.42]) block(body, 0.55, 0.14, 0.32, 0, y + 0.01, 0.22, parcel);
  for (const x of [-0.5, 0.5]) {
    block(body, 0.07, 0.1, 1.02, x, -0.39, 0, steel);
    for (const z of [-0.44, 0, 0.44]) {
      const tire = tube(body, 0.22, 0.12, x, -0.41, z, rubber, 14); tire.rotation.z = Math.PI / 2;
      const hub = tube(body, 0.11, 0.135, x, -0.41, z, steel, 10); hub.rotation.z = Math.PI / 2;
    }
  }
  block(body, 0.8, 0.07, 0.1, 0, -0.425, 0.60, rubber);
  for (const x of [-0.3, 0.3]) block(body, 0.07, 0.05, 0.04, x, 0.585, 0.59, rubber);
  block(body, 0.18, 0.07, 0.07, 0, 0.65, 0.18, rubber);
  return body;
}

/** Rigid parts, lights and articulated compartments are instanced per chassis. */
class WheelerFleet {
  root = new THREE.Group();
  private parts: THREE.InstancedMesh[] = [];
  private doors: THREE.InstancedMesh[] = [];
  private light: THREE.InstancedMesh;
  private openings: number[][];
  private pose = new THREE.Matrix4();
  private hinge = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3(1, 1, 1);
  constructor(private carts: CivilianCart[], private model: GroundCivilianModel) {
    const body = model === "CART" ? cartBody() : crateBody();
    batchRigid(body);
    for (const part of body.children as THREE.Mesh[]) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, carts.length);
      mesh.castShadow = mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(mesh); this.parts.push(mesh);
    }
    for (let j = 0; j < (model === "CART" ? 1 : 3); j++) {
      const geometry = model === "CART" ? new THREE.BoxGeometry(0.67, 0.045, 0.9).translate(0, 0, 0.44)
        : new THREE.BoxGeometry(0.84, 0.285, 0.045).translate(0.42, 0, 0);
      const door = new THREE.InstancedMesh(geometry, surface(0xffffff, 0.15), carts.length);
      door.castShadow = true; door.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      carts.forEach((c, i) => door.setColorAt(i, new THREE.Color(c.route.color)));
      this.root.add(door); this.doors.push(door);
    }
    this.light = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.045, 0.025)
      .translate(0, model === "CART" ? 0.025 : -0.28, model === "CART" ? 0.465 : 0.675),
      new THREE.MeshBasicMaterial({ color: 0xffffff }), carts.length);
    this.light.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.root.add(this.light); this.openings = carts.map(() => this.doors.map(() => 0));
    this.update(1, 0, 0);
  }
  update(alpha: number, delta: number, time: number) {
    for (const [i, c] of this.carts.entries()) {
      const p = c.body.translation(), q = c.body.rotation();
      this.position.set(THREE.MathUtils.lerp(c.previous.x, p.x, alpha), THREE.MathUtils.lerp(c.previous.y, p.y, alpha), THREE.MathUtils.lerp(c.previous.z, p.z, alpha));
      this.rotation.set(c.previousRotation.x, c.previousRotation.y, c.previousRotation.z, c.previousRotation.w)
        .slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
      this.pose.compose(this.position, this.rotation, this.scale);
      this.parts.forEach(part => part.setMatrixAt(i, this.pose)); this.light.setMatrixAt(i, this.pose);
      const alarm = c.state === "alert" || c.state === "tumbling" || c.state === "stranded";
      this.light.setColorAt(i, new THREE.Color(!c.hp ? 0x292b29 : alarm ? Math.sin(time * 9) > 0 ? 0xe3b55e : 0x4c4434 : 0xbad4c6));
      for (const [j, door] of this.doors.entries()) {
        const open = c.state === "delivery" && (this.model === "CART" || c.compartment === j);
        this.openings[i][j] = THREE.MathUtils.damp(this.openings[i][j], open ? 1.2 : 0, 7, delta);
        if (this.model === "CART") {
          this.hinge.makeRotationX(-this.openings[i][j]); this.hinge.setPosition(0, 0.285, -0.43);
        } else {
          this.hinge.makeRotationY(-this.openings[i][j]); this.hinge.setPosition(-0.42, -0.22 + j * 0.32, 0.60);
        }
        door.setMatrixAt(i, this.pose.clone().multiply(this.hinge));
      }
    }
    for (const mesh of [...this.parts, ...this.doors, this.light]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  dispose() {
    const materials = new Set<THREE.Material>();
    for (const mesh of [...this.parts, ...this.doors, this.light]) {
      mesh.dispose(); mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    }
    materials.forEach(m => m.dispose()); this.root.removeFromParent();
  }
}

export class CartFleet {
  root = new THREE.Group();
  private fleets: WheelerFleet[] = [];
  constructor(carts: CivilianCart[]) {
    for (const model of ["CART", "CRATE"] as const) {
      const members = carts.filter(c => c.model === model);
      if (!members.length) continue;
      const fleet = new WheelerFleet(members, model); this.fleets.push(fleet); this.root.add(fleet.root);
    }
  }
  update(alpha: number, delta: number, time: number) { this.fleets.forEach(f => f.update(alpha, delta, time)); }
  dispose() { this.fleets.forEach(f => f.dispose()); this.root.removeFromParent(); }
}
