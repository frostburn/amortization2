import * as THREE from "three";
import type { CivilianCart } from "../game/civilians";
import { batchRigid, block, surface, tube } from "./primitives";

/** One set of instanced parts for the fleet, including all 96 wheels. */
export class CartFleet {
  root = new THREE.Group();
  private parts: THREE.InstancedMesh[] = [];
  private lid: THREE.InstancedMesh;
  private light: THREE.InstancedMesh;
  private openings: number[];
  private pose = new THREE.Matrix4();
  private hinge = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3(1, 1, 1);
  constructor(private carts: CivilianCart[]) {
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
    batchRigid(body);
    for (const part of body.children as THREE.Mesh[]) {
      const mesh = new THREE.InstancedMesh(part.geometry, part.material, carts.length);
      mesh.castShadow = mesh.receiveShadow = true; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(mesh); this.parts.push(mesh);
    }
    const lidGeometry = new THREE.BoxGeometry(0.67, 0.045, 0.9).translate(0, 0, 0.44);
    this.lid = new THREE.InstancedMesh(lidGeometry, surface(0xffffff), carts.length);
    this.lid.castShadow = true; this.lid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.light = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.045, 0.025).translate(0, 0.025, 0.465),
      new THREE.MeshBasicMaterial({ color: 0xffffff }), carts.length);
    this.light.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    carts.forEach((c, i) => this.lid.setColorAt(i, new THREE.Color(c.route.color)));
    this.root.add(this.lid, this.light); this.openings = carts.map(() => 0);
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
      this.light.setColorAt(i, new THREE.Color(!c.hp ? 0x292b29 : c.state === "alert" ? Math.sin(time * 9) > 0 ? 0xe3b55e : 0x4c4434 : 0xbad4c6));
      this.openings[i] = THREE.MathUtils.damp(this.openings[i], c.state === "delivery" ? 0.95 : 0, 7, delta);
      this.hinge.makeRotationX(-this.openings[i]); this.hinge.setPosition(0, 0.285, -0.43);
      this.lid.setMatrixAt(i, this.pose.clone().multiply(this.hinge));
    }
    for (const mesh of [...this.parts, this.lid, this.light]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  dispose() {
    const materials = new Set<THREE.Material>();
    for (const mesh of [...this.parts, this.lid, this.light]) {
      mesh.dispose(); mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    }
    materials.forEach(m => m.dispose()); this.root.removeFromParent();
  }
}
