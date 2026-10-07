import * as THREE from "three";
import { TOTE, type CivilianPorter } from "../game/porters";
import { batchRigid, block, surface, tube } from "./primitives";

const toteShell = surface(0x7d8f87), toteEdge = surface(0x425b60, 0.3), toteParcel = surface(0xb4a582);

export function makeTote() {
  const root = new THREE.Group(), shell = toteShell, edge = toteEdge, parcel = toteParcel;
  block(root, TOTE.w, TOTE.h - 0.025, TOTE.d, 0, -0.0125, 0, shell);
  block(root, TOTE.w + 0.015, 0.025, TOTE.d + 0.015, 0, TOTE.h / 2 - 0.0125, 0, edge);
  for (const side of [-1, 1]) {
    block(root, 0.2, 0.055, 0.014, 0, 0.035, side * (TOTE.d / 2 + 0.007), edge);
    for (const x of [-0.22, 0.22]) block(root, 0.022, TOTE.h - 0.06, 0.024, x, -0.015, side * TOTE.d / 2, edge);
  }
  block(root, 0.23, 0.002, 0.16, 0.08, TOTE.h / 2 + 0.001, -0.04, parcel);
  batchRigid(root); return root;
}

type Limb = { upper: THREE.Mesh; lower: THREE.Mesh; joint: THREE.Mesh; end: THREE.Group };
type PorterView = { root: THREE.Group; torso: THREE.Group; legs: Limb[]; arms: Limb[]; lamp: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> };
const up = new THREE.Vector3(0, 1, 0);
function link(mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3) {
  const delta = b.clone().sub(a);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.scale.y = delta.length(); mesh.quaternion.setFromUnitVectors(up, delta.normalize());
}

/** Four modest articulated rigs; the physics hull remains one heavy rigid body. */
export class PorterFleet {
  root = new THREE.Group();
  private views: PorterView[] = [];
  constructor(private porters: CivilianPorter[]) {
    const dark = surface(0x35474b, 0.45), metal = surface(0x899690, 0.5), rubber = surface(0x283b40), shell = surface(0xc3c3ac);
    for (const p of porters) {
      const root = new THREE.Group(), torso = new THREE.Group(), paint = surface(p.route.color, 0.2);
      block(torso, 0.51, 0.5, 0.32, 0, 0.29, 0, shell);
      block(torso, 0.44, 0.13, 0.055, 0, 0.36, 0.187, paint);
      block(torso, 0.41, 0.41, 0.17, 0, 0.24, -0.225, dark);
      for (const y of [0.13, 0.22, 0.31]) block(torso, 0.31, 0.035, 0.03, 0, y, -0.325, metal);
      tube(torso, 0.105, 0.1, 0, 0.59, 0, dark);
      block(torso, 0.25, 0.23, 0.23, 0, 0.74, 0.005, shell);
      block(torso, 0.2, 0.066, 0.015, 0, 0.75, 0.128, rubber);
      for (const x of [-0.064, 0.064]) tube(torso, 0.015, 0.015, x, 0.75, 0.14, metal).rotation.x = Math.PI / 2;
      block(torso, 0.55, 0.18, 0.35, 0, -0.075, 0, dark);
      block(torso, 0.43, 0.13, 0.05, 0, -0.065, 0.2, paint);
      batchRigid(torso); root.add(torso);
      const limb = (arm: boolean): Limb => {
        const upper = tube(root, arm ? 0.068 : 0.095, 1, 0, 0, 0, arm ? shell : paint);
        const lower = tube(root, arm ? 0.055 : 0.075, 1, 0, 0, 0, metal);
        const joint = tube(root, arm ? 0.083 : 0.11, arm ? 0.16 : 0.22, 0, 0, 0, dark); joint.rotation.z = Math.PI / 2;
        const end = new THREE.Group();
        if (arm) {
          block(end, 0.095, 0.13, 0.14, 0, 0, 0, dark);
          for (const side of [-1, 1]) block(end, 0.04, 0.055, 0.21, side * 0.06, -0.035, 0.025, metal);
        } else {
          block(end, 0.19, 0.09, 0.37, 0, 0, 0.06, rubber);
          block(end, 0.14, 0.08, 0.2, 0, 0.07, 0.035, shell);
        }
        batchRigid(end); root.add(end); return { upper, lower, joint, end };
      };
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.024, 6, 4), new THREE.MeshBasicMaterial({ color: 0xa1c1a6 }));
      lamp.position.set(0.19, 0.49, 0.17); root.add(lamp);
      this.views.push({ root, torso, legs: [limb(false), limb(false)], arms: [limb(true), limb(true)], lamp });
      this.root.add(root);
    }
  }
  update(alpha: number) {
    for (const [i, p] of this.porters.entries()) {
      const v = this.views[i], position = p.body.translation(), q = p.body.rotation();
      v.root.position.set(THREE.MathUtils.lerp(p.previous.x, position.x, alpha),
        THREE.MathUtils.lerp(p.previous.y, position.y, alpha), THREE.MathUtils.lerp(p.previous.z, position.z, alpha));
      v.root.quaternion.set(p.previousRotation.x, p.previousRotation.y, p.previousRotation.z, p.previousRotation.w)
        .slerp(new THREE.Quaternion(q.x, q.y, q.z, q.w), alpha);
      const speed = Math.hypot(p.body.linvel().x, p.body.linvel().z);
      const moving = p.hp > 0 && !p.impactUntil ? Math.min(1, speed / 0.65) : 0;
      const phase = p.distance * Math.PI * 2 / 1.1;
      const loading = p.state === "pickup" ? 1 - p.phase : p.state === "place" ? p.phase : 0;
      v.torso.rotation.x = loading * 0.13;
      for (const [sideIndex, side] of [-1, 1].entries()) {
        const stride = Math.sin(phase + sideIndex * Math.PI) * moving;
        const lift = Math.max(0, Math.cos(phase + sideIndex * Math.PI)) * moving;
        const hip = new THREE.Vector3(side * 0.2, -0.13, 0);
        const ankle = new THREE.Vector3(side * 0.2, -0.855 + lift * 0.055, stride * 0.15);
        const knee = new THREE.Vector3(side * 0.22, -0.48 + lift * 0.025, 0.09 + stride * 0.055);
        const leg = v.legs[sideIndex]; link(leg.upper, hip, knee); link(leg.lower, knee, ankle);
        leg.joint.position.copy(knee); leg.end.position.copy(ankle); leg.end.rotation.x = -stride * 0.09;
        const shoulder = new THREE.Vector3(side * 0.34, 0.46, 0);
        const hand = p.grip ? new THREE.Vector3(side * 0.38, p.grip.anchor1().y, TOTE.reach)
          : new THREE.Vector3(side * 0.38, -0.25, -stride * 0.13);
        const elbow = p.grip ? new THREE.Vector3(side * 0.48, 0.08 - loading * 0.06, 0.3)
          : new THREE.Vector3(side * 0.4, 0.075, -stride * 0.1 - 0.04);
        const arm = v.arms[sideIndex]; link(arm.upper, shoulder, elbow); link(arm.lower, elbow, hand);
        arm.joint.position.copy(elbow); arm.end.position.copy(hand);
      }
      v.lamp.visible = p.hp > 0;
      v.lamp.material.color.setHex(p.alertUntil > 0 && (p.state === "steady" || p.state === "withdraw") ? 0xd7ae5f : 0x98bbaa);
    }
  }
  dispose() {
    const materials = new Set<THREE.Material>();
    this.root.traverse(o => { if (o instanceof THREE.Mesh) {
      o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
    } });
    materials.forEach(m => m.dispose()); this.root.clear();
  }
}
