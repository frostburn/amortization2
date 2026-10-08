import * as THREE from "three";
import { RECEIVING_SITES } from "../game/receiving";
import type { Simulation } from "../game/simulation";
import { VEHICLES } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";
import { vehicleBody } from "./traffic";

/** Physical landmarks and one active ground objective; dialogue belongs in UI. */
export class MissionView {
  root = new THREE.Group();
  private light = new THREE.MeshBasicMaterial({ color: 0xdbac5b });
  private dispatch: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private returning: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;

  constructor() {
    const kit = new THREE.Group(), steel = surface(0x526568, 0.5), dark = surface(0x233337);
    const safety = surface(0xc6af67), white = surface(0xd3cdbc), rubber = surface(0x20282a);
    const kiosk = RECEIVING_SITES.kiosk;
    block(kit, 1.1, 1.35, 0.7, kiosk.x, 0.675, kiosk.z, steel);
    block(kit, 1.2, 0.2, 0.85, kiosk.x, 1.45, kiosk.z, dark);
    block(kit, 0.7, 0.35, 0.04, kiosk.x, 1.08, kiosk.z + 0.37, dark);
    block(kit, 0.62, 0.08, 0.05, kiosk.x, 1.09, kiosk.z + 0.40, this.light);
    for (const site of [RECEIVING_SITES.dispatch, RECEIVING_SITES.return]) {
      const r = site.radius;
      // Paint clears the existing plaza surface rather than sharing its depth.
      for (const sign of [-1, 1]) {
        block(kit, r * 2, 0.004, 0.09, site.x, 0.041, site.z + sign * r, safety);
        block(kit, 0.09, 0.004, r * 2, site.x + sign * r, 0.041, site.z, safety);
      }
    }
    const { root: van, paint } = vehicleBody("VAN");
    paint.color.setHex(0x728c82);
    van.position.set(RECEIVING_SITES.van.x, VEHICLES.VAN.height / 2 + 0.035, RECEIVING_SITES.van.z);
    this.root.add(van);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const tire = tube(kit, 0.36, 0.23, RECEIVING_SITES.van.x + side * 0.98, 0.36,
        RECEIVING_SITES.van.z + end * VEHICLES.VAN.wheelbase / 2, rubber, 16);
      tire.rotation.z = Math.PI / 2;
      const hub = tube(kit, 0.21, 0.245, tire.position.x, tire.position.y, tire.position.z, steel, 12);
      hub.rotation.z = Math.PI / 2;
    }
    block(kit, 0.18, 0.005, 2.4, RECEIVING_SITES.return.x, 0.047, RECEIVING_SITES.return.z, white);
    for (const sign of [-1, 1]) {
      const arrow = block(kit, 0.17, 0.005, 1.1, RECEIVING_SITES.return.x + sign * 0.35, 0.047,
        RECEIVING_SITES.return.z - 0.7, white);
      arrow.rotation.y = sign * Math.PI / 4;
    }
    batchRigid(kit); this.root.add(kit);
    const marker = (site: { x: number; z: number; radius: number }, color: number) => {
      const ring = new THREE.Mesh(new THREE.RingGeometry(site.radius - 0.08, site.radius, 64),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.x, 0.06, site.z);
      ring.visible = false;
      this.root.add(ring); return ring;
    };
    this.dispatch = marker(RECEIVING_SITES.dispatch, 0xdbac5b);
    this.returning = marker(RECEIVING_SITES.return, 0xa3e6d0);
  }
  update(sim: Simulation, reducedMotion: boolean) {
    const mission = sim.mission;
    this.light.color.setHex(mission?.cargoReleased ? 0xa3e6d0 : 0xdbac5b);
    this.dispatch.visible = mission?.phase === "dispatch";
    this.returning.visible = mission?.phase === "return";
    for (const ring of [this.dispatch, this.returning])
      ring.material.opacity = reducedMotion ? 0.8 : 0.65 + Math.sin(sim.time * 4) * 0.15;
  }
}
