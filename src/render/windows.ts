import * as THREE from "three";
import { WINDOW_BORDER, MULLION, openingPanes, wallPanels, type Facade, type PaneSpec } from "../game/facades";
import { block, panel } from "./primitives";

/** Framed apertures, sills and transoms; glazing is separately instanced. */
export function makeFacade(face: Facade, wall: THREE.Material, frame: THREE.Material, door: THREE.Material) {
  const root = new THREE.Group();
  for (const p of wallPanels(face)) panel(root, p.w, p.h, p.x, p.y, 0, wall);
  for (const o of face.openings) {
    for (const side of [-1, 1]) {
      block(root, o.w, WINDOW_BORDER, 0.18, o.x, o.y + side * (o.h - WINDOW_BORDER) / 2, 0.045, frame);
      block(root, WINDOW_BORDER, o.h - WINDOW_BORDER * 2, 0.18, o.x + side * (o.w - WINDOW_BORDER) / 2, o.y, 0.045, frame);
    }
    if (o.kind !== "window") {
      panel(root, o.w - WINDOW_BORDER * 2, o.h - WINDOW_BORDER * 2, o.x, o.y, 0.04, door);
      continue;
    }
    block(root, o.w + 0.16, 0.1, 0.25, o.x, o.y - o.h / 2 - 0.03, 0.035, wall);
    block(root, o.w - WINDOW_BORDER * 2, MULLION, 0.1, o.x, o.y + o.h * 0.16, 0.075, frame);
    const panes = openingPanes(o), cols = panes.length / 2;
    for (let i = 1; i < cols; i++)
      block(root, MULLION, o.h - WINDOW_BORDER * 2, 0.1, panes[i].x - panes[i].w / 2 - MULLION / 2, o.y, 0.075, frame);
  }
  return root;
}

/** One draw per building, independent of its pane count. No transparency sorting. */
export class WindowView {
  readonly mesh: THREE.InstancedMesh;
  readonly material = new THREE.MeshPhysicalMaterial({
    color: 0x24343b, roughness: 0.12, metalness: 0,
    ior: 1.52, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 3.2,
  });
  private hidden = new Set<string>();
  private broken?: Set<string>;
  private revision = -1;
  private dummy = new THREE.Object3D();
  constructor(readonly panes: PaneSpec[], coverage = true) {
    this.material.side = THREE.DoubleSide; this.material.alphaToCoverage = coverage;
    this.mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), this.material, panes.length);
    this.mesh.userData.glazing = true;
    this.mesh.geometry.userData.owned = true;
    panes.forEach((_,i) => this.restore(i));
    this.mesh.computeBoundingSphere();
  }
  private restore(i: number) {
    const p = this.panes[i];
    this.dummy.position.set(p.x, p.y, p.z); this.dummy.rotation.set(p.pitch ?? 0, p.turn * Math.PI / 2, 0, "YXZ");
    this.dummy.scale.set(p.w, p.h, 1); this.dummy.updateMatrix(); this.mesh.setMatrixAt(i, this.dummy.matrix);
  }
  update(broken: Set<string>) {
    // Broken IDs only accumulate within a level. Reset supplies a new set,
    // potentially with the same size before this view gets its next update.
    if (broken === this.broken && broken.size === this.revision) return;
    this.broken = broken;
    this.revision = broken.size;
    for (const [i,p] of this.panes.entries()) {
      if (broken.has(p.id) && !this.hidden.has(p.id)) {
        this.mesh.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); this.hidden.add(p.id);
        this.mesh.instanceMatrix.needsUpdate = true;
      } else if (!broken.has(p.id) && this.hidden.delete(p.id)) {
        this.restore(i); this.mesh.instanceMatrix.needsUpdate = true;
      }
    }
  }
}
