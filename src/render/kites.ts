import * as THREE from "three";
import type { CivilianKite } from "../game/aircraft";
import type { DeliveryPad } from "../game/city";
import { batchRigid, block, surface, tube } from "./primitives";

/** Small commercial quadrotor: exposed arms, four motors, skids and a cargo cradle. */
export function kiteBody() {
  const root = new THREE.Group(), shell = surface(0xd9d9cb), frame = surface(0x465659, 0.5);
  const rubber = surface(0x222d31), lens = surface(0x466b72, 0.5, 0.25);
  block(root, 0.74, 0.22, 0.60, 0, 0.08, 0, shell);
  block(root, 0.52, 0.07, 0.43, 0, 0.225, -0.03, frame);
  block(root, 0.17, 0.075, 0.075, 0, 0.08, 0.335, rubber);
  block(root, 0.10, 0.045, 0.013, 0, 0.08, 0.38, lens);
  for (const x of [-0.72, 0.72]) for (const z of [-0.63, 0.63]) {
    const arm = block(root, 0.09, 0.07, Math.hypot(x, z), x / 2, 0.08, z / 2, frame);
    arm.rotation.y = Math.atan2(x, z);
    tube(root, 0.095, 0.16, x, 0.145, z, rubber, 12);
    tube(root, 0.11, 0.035, x, 0.238, z, frame, 12);
  }
  for (const x of [-0.4, 0.4]) {
    block(root, 0.075, 0.065, 1.16, x, -0.405, 0, rubber);
    for (const z of [-0.35, 0.35]) {
      const leg = block(root, 0.045, 0.35, 0.045, x * 0.85, -0.21, z, frame);
      leg.rotation.z = -Math.sign(x) * 0.3;
    }
  }
  for (const x of [-0.27, 0.27]) block(root, 0.035, 0.29, 0.55, x, -0.19, 0, frame);
  block(root, 0.55, 0.035, 0.55, 0, -0.335, 0, frame);
  return root;
}

/** Painted pad with a recessed parcel receiver. No floating model-name labels. */
export function makeDeliveryPad(spec: DeliveryPad) {
  const root = new THREE.Group(), paint = surface(spec.color), hatch = surface(0x465659, 0.4);
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.7, 1.82, 32), paint);
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.046; root.add(ring);
  for (const x of [-0.34, 0.34]) block(root, 0.055, 0.012, 0.72, x, 0.044, 0, paint);
  for (const z of [-0.34, 0.34]) block(root, 0.625, 0.012, 0.055, 0, 0.044, z, paint);
  block(root, 0.57, 0.012, 0.57, 0, 0.041, 0, hatch);
  for (const side of [-1, 1]) {
    block(root, 0.45, 0.012, 0.09, side * 2.03, 0.044, 0, paint);
    block(root, 0.09, 0.012, 0.45, 0, 0.044, side * 2.03, paint);
  }
  batchRigid(root); root.position.set(spec.x, 0, spec.z); return root;
}

export class KiteFleet {
  root = new THREE.Group();
  private parts: THREE.InstancedMesh[] = [];
  private blades: THREE.InstancedMesh;
  private blur: THREE.InstancedMesh;
  private cargo: THREE.InstancedMesh;
  private livery: THREE.InstancedMesh;
  private lamp: THREE.InstancedMesh;
  private angles: number[];
  private pose = new THREE.Matrix4();
  private local = new THREE.Matrix4();
  private position = new THREE.Vector3();
  private rotation = new THREE.Quaternion();
  private scale = new THREE.Vector3(1, 1, 1);
  constructor(private kites: CivilianKite[]) {
    const body = kiteBody(); batchRigid(body);
    const make = (geometry: THREE.BufferGeometry, material: THREE.Material, count = kites.length) => {
      const mesh = new THREE.InstancedMesh(geometry, material, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.castShadow = mesh.receiveShadow = true;
      this.root.add(mesh); return mesh;
    };
    for (const part of body.children as THREE.Mesh[]) this.parts.push(make(part.geometry, part.material as THREE.Material));
    this.blades = make(new THREE.BoxGeometry(0.78, 0.018, 0.065), surface(0x303d40), kites.length * 4);
    const disc = new THREE.CircleGeometry(0.4, 20); disc.rotateX(-Math.PI / 2);
    this.blur = make(disc, new THREE.MeshBasicMaterial({ color: 0xb7c0b8, transparent: true, opacity: 0.13, depthWrite: false, side: THREE.DoubleSide }), kites.length * 4);
    this.blur.castShadow = false;
    this.cargo = make(new THREE.BoxGeometry(0.46, 0.26, 0.48).translate(0, -0.185, 0), surface(0xbca078));
    this.livery = make(new THREE.BoxGeometry(0.4, 0.018, 0.32).translate(0, 0.27, -0.03), surface(0xffffff));
    kites.forEach((c, i) => this.livery.setColorAt(i, new THREE.Color(c.route.color)));
    this.lamp = make(new THREE.BoxGeometry(0.045, 0.04, 0.016).translate(0.25, 0.1, 0.314), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    this.angles = kites.map(c => c.id % 7); this.update(1, 0);
  }
  update(alpha: number, delta: number) {
    for (const [i, c] of this.kites.entries()) {
      const p = c.body.translation(), q = c.body.rotation();
      this.position.set(THREE.MathUtils.lerp(c.previous.x, p.x, alpha), THREE.MathUtils.lerp(c.previous.y, p.y, alpha), THREE.MathUtils.lerp(c.previous.z, p.z, alpha));
      this.rotation.set(c.previousRotation.x, c.previousRotation.y, c.previousRotation.z, c.previousRotation.w)
        .slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
      this.pose.compose(this.position, this.rotation, this.scale);
      this.parts.forEach(mesh => { mesh.setMatrixAt(i, this.pose); mesh.setColorAt(i, new THREE.Color(c.hp ? 0xffffff : 0x787e78)); });
      this.cargo.setMatrixAt(i, c.loaded ? this.pose : this.pose.clone().scale(new THREE.Vector3(0, 0, 0)));
      this.livery.setMatrixAt(i, this.pose);
      this.lamp.setMatrixAt(i, this.pose);
      this.lamp.setColorAt(i, new THREE.Color(!c.hp ? 0x252b29 : ["abort", "crashing", "stranded"].includes(c.state) ? 0xe6b662 : 0x99cfb6));
      this.angles[i] += delta * c.rotors * 95;
      for (let rotor = 0; rotor < 4; rotor++) {
        this.local.makeRotationY(this.angles[i] * (rotor % 2 ? -1 : 1));
        this.local.setPosition(rotor < 2 ? -0.72 : 0.72, 0.27, rotor % 2 ? 0.63 : -0.63);
        const matrix = this.pose.clone().multiply(this.local);
        this.blades.setMatrixAt(i * 4 + rotor, matrix);
        this.blur.setMatrixAt(i * 4 + rotor, matrix.scale(new THREE.Vector3(c.rotors, 1, c.rotors)));
      }
    }
    for (const mesh of [...this.parts, this.blades, this.blur, this.cargo, this.livery, this.lamp]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
  }
  dispose() {
    const materials = new Set<THREE.Material>();
    for (const mesh of [...this.parts, this.blades, this.blur, this.cargo, this.livery, this.lamp]) {
      mesh.dispose(); mesh.geometry.dispose(); (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
    }
    materials.forEach(m => m.dispose()); this.root.removeFromParent();
  }
}
