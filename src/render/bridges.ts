import * as THREE from "three";
import type { BridgeSpec, SingleLoadBridge } from "../game/bridges";
import { batchRigid, block, surface, tube } from "./primitives";

/** A modular service footbridge, with one-chassis signs and load lamps. */
export class SingleLoadBridgeView {
  root = new THREE.Group();
  private halves: THREE.Group[] = [];
  private signal = new THREE.MeshBasicMaterial({ color: 0xa3e6d0 });
  constructor(spec: BridgeSpec) {
    this.root.position.set(spec.x, 0, spec.z);
    const steel = surface(0x596c70, 0.65, 0.65), dark = surface(0x26373b, 0.45);
    const paint = surface(0xc0a568), stone = surface(0x9c9c8e), kit = new THREE.Group();
    for (const side of [-1, 1]) {
      const half = new THREE.Group();
      const length = spec.length / 2;
      for (let x = 0.12; x < length; x += 0.32)
        block(half, 0.28, 0.065, spec.width, side * x, -0.035, 0, steel);
      for (const z of [-0.75, 0.75]) block(half, length, 0.2, 0.10, side * length / 2, -0.16, z, dark);
      batchRigid(half); this.halves.push(half); this.root.add(half);
      if (side === -1) for (const z of [-1.3, 1.3]) {
        block(kit, spec.length + 0.8, 0.055, 0.07, 0, 0.68, z, steel);
        for (let x = -spec.length / 2; x <= spec.length / 2; x += 1.5)
          block(kit, 0.06, 0.72, 0.06, x, 0.36, z, dark);
      }
      for (const z of [-31.25, 31.25]) block(kit, 0.35, 4.05, 60, side * spec.bank, -1.475, z, stone);
      const x = side * (spec.bank + 0.8);
      tube(kit, 0.05, 1.7, x, 0.85, -1.7, dark);
      block(kit, 0.08, 0.65, 0.75, x, 1.55, -1.7, paint);
      // A single familiar chassis silhouette, on both faces of the sign.
      for (const face of [-1, 1]) {
        const faceX = x + face * 0.047;
        block(kit, 0.012, 0.08, 0.09, faceX, 1.73, -1.7, dark);
        block(kit, 0.012, 0.18, 0.17, faceX, 1.58, -1.7, dark);
        for (const z of [-1.755, -1.645]) block(kit, 0.012, 0.13, 0.055, faceX, 1.415, z, dark);
      }
      block(kit, 0.08, 0.18, 0.18, x, 1.05, -1.7, this.signal);
    }
    batchRigid(kit); this.root.add(kit);
  }
  update(bridge: SingleLoadBridge) {
    this.signal.color.setHex(bridge.collapsed || bridge.overload > 0 ? 0xe86a54 : bridge.load > 1 ? 0xdbac5b : 0xa3e6d0);
    this.halves.forEach((half, i) => {
      half.rotation.z = (i ? -1 : 1) * (bridge.collapsed ? 0.12 : bridge.overload / bridge.spec.overloadSeconds * 0.015);
      half.position.y = bridge.collapsed ? -0.95 : -Math.min(0.08, bridge.overload * 0.1);
    });
  }
}
