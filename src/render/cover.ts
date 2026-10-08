import * as THREE from "three";
import { COVER_HALF_ANGLE } from "../game/cover";
import type { Vec2 } from "../game/config";
import type { Simulation } from "../game/simulation";

/** Small direction arcs, independent of auxiliary text labels. */
export class CoverOrderView {
  root = new THREE.Group();
  preview: Vec2 | null = null;
  private sectors = Array.from({ length: 4 }, () => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(22 * 3), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xa3e6d0,
      transparent: true, opacity: 0.55, depthWrite: false }));
    line.visible = false;
    this.root.add(line);
    return line;
  });
  update(sim: Simulation) {
    for (const [i, a] of sim.squad.entries()) {
      const line = this.sectors[i];
      const p = a.body.translation();
      const preview = this.preview && sim.selected.has(a.id);
      const direction = preview ? { x: this.preview!.x - p.x, z: this.preview!.z - p.z } : a.cover?.direction;
      line.visible = !a.dead && !!direction && !sim.sniping && (sim.selected.has(a.id) || !!a.cover?.fire);
      if (!line.visible || !direction) continue;
      const angle = Math.atan2(direction.x, direction.z), radius = preview ? 6 : 4.5;
      const positions = line.geometry.getAttribute("position");
      positions.setXYZ(0, 0, 0, 0);
      for (let j = 0; j <= 19; j++) {
        const bearing = angle - COVER_HALF_ANGLE + j / 19 * COVER_HALF_ANGLE * 2;
        positions.setXYZ(j + 1, Math.sin(bearing) * radius, 0, Math.cos(bearing) * radius);
      }
      positions.setXYZ(21, 0, 0, 0);
      positions.needsUpdate = true;
      line.geometry.computeBoundingSphere();
      line.position.set(p.x, 0.075, p.z);
      line.material.color.setHex(preview ? 0xdbac5b : 0xa3e6d0);
    }
  }
  dispose() { this.sectors.forEach(line => { line.geometry.dispose(); line.material.dispose(); }); }
}
