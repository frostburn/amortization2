import * as THREE from "three";
import { PRIORITY_COVER, PRIORITY_GATE, PRIORITY_SITES } from "../game/priority";
import { PriorityMission } from "../game/priority-mission";
import type { Simulation } from "../game/simulation";
import { VEHICLES } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";
import { vehicleBody } from "./traffic";

/** Yard equipment and active landmarks; the concourse/buildings remain reusable. */
export class PriorityView {
  readonly root = new THREE.Group();
  private gate = new THREE.Group();
  private lamp = new THREE.MeshBasicMaterial({ color: 0xdbac5b });
  private marker = new THREE.Mesh(new THREE.RingGeometry(.97, 1, 64),
    new THREE.MeshBasicMaterial({ color: 0xdbac5b, transparent: true, opacity: .8, depthWrite: false }));
  constructor() {
    const kit = new THREE.Group(), concrete = surface(0xa3a59a), steel = surface(0x526568, .45),
      dark = surface(0x283639), paint = surface(0xbca779), white = surface(0xc7c7b6), rubber = surface(0x222b2c);
    for (const b of PRIORITY_COVER) {
      const y = (b.y ?? 0) + b.h / 2;
      block(kit, b.w, b.h, b.d, b.x, y, b.z, b.style === "crate" ? steel : concrete);
      if (b.style === "crate") {
        for (const side of [-1, 1]) for (let x = -b.w / 2 + .2; x < b.w / 2; x += .5)
          block(kit, .06, b.h - .18, .04, b.x + x, y, b.z + side * (b.d / 2 + .02), dark);
        block(kit, b.w - .12, .1, b.d + .04, b.x, (b.y ?? 0) + .22, b.z, paint);
      }
    }
    const b = PRIORITY_GATE;
    for (let z = -b.d / 2 + .15; z < b.d / 2; z += .4) block(this.gate, .15, b.h - .1, .08, b.x, b.h / 2, z, steel);
    for (const y of [.2, b.h - .2]) block(this.gate, b.w, .15, b.d, b.x, y, 0, steel);
    const site = PRIORITY_SITES.dispatch;
    // Wall-mounted access cabinet, physically behind the work pad.
    block(kit, 1.5, 1.65, .38, site.x - 2, 1.2, -22.72, steel);
    block(kit, 1.28, .4, .06, site.x - 2, 1.6, -22.5, dark);
    block(kit, .9, .08, .07, site.x - 2, 1.6, -22.46, this.lamp);
    for (const y of [.65, .9]) block(kit, 1.1, .035, .07, site.x - 2, y, -22.46, dark);
    for (const x of [site.x - 5, site.x + 5]) {
      tube(kit, .1, 3, x, 1.5, -22.62, steel);
      block(kit, .5, .36, .2, x, 2.7, -22.45, this.lamp);
    }
    // Wheeled flight cases and a roller bed make the loading bay recognisable.
    block(kit, 6, .18, 1.6, 23, .45, -3.5, steel);
    for (let x = 20.3; x < 25.9; x += .4) {
      const roller = tube(kit, .08, 1.45, x, .6, -3.5, dark);
      roller.rotation.x = Math.PI / 2;
    }
    for (const p of [PRIORITY_SITES.loading, PRIORITY_SITES.exit]) for (const sign of [-1, 1]) {
      block(kit, p.radius * 2, .006, .1, p.x, .047, p.z + sign * p.radius, paint);
      block(kit, .1, .006, p.radius * 2, p.x + sign * p.radius, .047, p.z, paint);
    }
    // The extraction van shares the existing self-driving vehicle model.
    const van = vehicleBody("VAN"); van.paint.color.setHex(0x728c82);
    van.root.position.set(PRIORITY_SITES.van.x, VEHICLES.VAN.height / 2 + .035, PRIORITY_SITES.van.z);
    this.root.add(van.root);
    // A marked parking space, wholly beyond the road and its sidewalk.
    for (const side of [-1, 1]) block(kit, .09, .006, 7, PRIORITY_SITES.van.x + side * 1.6,
      .047, PRIORITY_SITES.van.z, white);
    block(kit, 3.2, .006, .09, PRIORITY_SITES.van.x, .047, PRIORITY_SITES.van.z + 3.5, white);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const wheel = tube(kit, .36, .23, PRIORITY_SITES.van.x + side * .98, .36,
        PRIORITY_SITES.van.z + end * VEHICLES.VAN.wheelbase / 2, rubber, 16);
      wheel.rotation.z = Math.PI / 2;
    }
    batchRigid(kit); batchRigid(this.gate);
    this.marker.rotation.x = -Math.PI / 2;
    this.root.add(kit, this.gate, this.marker);
  }
  update(sim: Simulation, reducedMotion: boolean) {
    const mission = sim.mission;
    if (!(mission instanceof PriorityMission)) return;
    this.gate.position.z = mission.gateOpen ? 10.5 : 0;
    this.gate.visible = !mission.gateOpen;
    this.lamp.color.setHex(mission.cargoReleased ? 0xa3e6d0 : 0xdbac5b);
    const marker = mission.marker;
    this.marker.visible = !!marker;
    if (marker) {
      this.marker.position.set(marker.x, .068, marker.z); this.marker.scale.setScalar(marker.radius);
      this.marker.material.color.setHex(marker.kind === "return" ? 0xa3e6d0 : mission.contested ? 0xe59d7d : 0xdbac5b);
      this.marker.material.opacity = reducedMotion ? .8 : .7 + Math.sin(sim.time * 4) * .1;
    }
  }
}
