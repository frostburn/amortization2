import * as THREE from "three";
import { RECOVERY_COVER, RECOVERY_ROUTE, RECOVERY_SITES } from "../game/recovery";
import { RecoveryMission } from "../game/recovery-mission";
import type { Simulation } from "../game/simulation";
import { VEHICLES } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";
import { vehicleBody } from "./traffic";

/** Shared city/concourse kits supply the district; this view adds interception landmarks. */
export class RecoveryView {
  readonly root = new THREE.Group();
  private route = new THREE.Group();
  private beacon = new THREE.Group();
  private lamp = new THREE.MeshBasicMaterial({ color: 0xe1b363 });
  private marker = new THREE.Mesh(new THREE.RingGeometry(.95, 1, 64),
    new THREE.MeshBasicMaterial({ color: 0xe1b363, transparent: true, opacity: .75, depthWrite: false }));
  private salvage = new THREE.Group();
  constructor() {
    const kit = new THREE.Group(), concrete = surface(0xa8aaa0), metal = surface(0x55676a, .5),
      dark = surface(0x2a3639), safety = surface(0xc5ac6d), rubber = surface(0x212b2c);
    for (const b of RECOVERY_COVER) {
      block(kit, b.w, b.h, b.d, b.x, b.h / 2, b.z, b.style === "crate" ? metal : concrete);
      if (b.style === "crate") {
        for (const side of [-1, 1]) {
          block(kit, b.w - .12, .1, .045, b.x, .28, b.z + side * (b.d / 2 + .025), safety);
          for (let x = -b.w / 2 + .3; x < b.w / 2; x += .6)
            block(kit, .04, b.h - .3, .04, b.x + x, b.h / 2, b.z + side * (b.d / 2 + .022), dark);
        }
      }
    }
    // Physical bay markings and a recovery vehicle, wholly off the convoy road.
    const exit = RECOVERY_SITES.exit, site = RECOVERY_SITES.van;
    for (const sign of [-1, 1]) {
      block(kit, exit.radius * 2, .006, .1, exit.x, .047, exit.z + sign * exit.radius, safety);
      block(kit, .1, .006, exit.radius * 2, exit.x + sign * exit.radius, .047, exit.z, safety);
      block(kit, .1, .006, 7.5, site.x + sign * 1.5, .047, site.z, safety);
    }
    const van = vehicleBody("VAN"); van.paint.color.setHex(0x728c82);
    van.root.position.set(site.x, VEHICLES.VAN.height / 2 + .035, site.z);
    this.root.add(van.root);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const wheel = tube(kit, .36, .23, site.x + side * .98, .36, site.z + end * VEHICLES.VAN.wheelbase / 2, rubber, 16);
      wheel.rotation.z = Math.PI / 2;
    }
    // A restrained route preview disappears once the truck is stopped. No floating text.
    const routeMaterial = new THREE.MeshBasicMaterial({ color: 0xcab67b, transparent: true, opacity: .48, depthWrite: false });
    const points = [RECOVERY_SITES.truck, ...RECOVERY_ROUTE];
    for (let i = 0; i < points.length - 1; i++) {
      const a = points[i], b = points[i + 1], length = Math.hypot(b.x - a.x, b.z - a.z);
      for (let d = 6; d < length - 2; d += 14) {
        const arrow = new THREE.Group();
        for (const side of [-1, 1]) {
          const arm = block(arrow, .09, .005, .9, side * .28, .054, -.26, routeMaterial);
          arm.rotation.y = -side * Math.PI / 4;
        }
        arrow.position.set(a.x + (b.x - a.x) * d / length, 0, a.z + (b.z - a.z) * d / length);
        arrow.rotation.y = Math.atan2(b.x - a.x, b.z - a.z); this.route.add(arrow);
      }
    }
    batchRigid(this.route);
    block(this.beacon, .55, .07, .28, 0, 0, 0, dark);
    for (const side of [-1, 1]) block(this.beacon, .17, .085, .2, side * .16, .06, 0, this.lamp);
    for (const [i, width] of [1.3, 1, .7].entries()) {
      block(this.salvage, width, .28, .8, (i - 1) * 1.1, .14, -.2, metal);
      for (let x = -width / 2 + .15; x < width / 2; x += .25)
        block(this.salvage, .04, .03, .7, (i - 1) * 1.1 + x, .3, -.2, dark);
    }
    batchRigid(kit); batchRigid(this.beacon); batchRigid(this.salvage);
    this.marker.rotation.x = -Math.PI / 2;
    this.root.add(kit, this.route, this.beacon, this.marker, this.salvage);
  }
  update(sim: Simulation, reducedMotion: boolean) {
    if (!(sim.mission instanceof RecoveryMission)) return;
    const m = sim.mission, truck = m.truck, p = truck.body.translation(), q = truck.body.rotation();
    this.route.visible = m.disabledAt === undefined && !m.finished;
    this.beacon.position.set(p.x, p.y + VEHICLES.TRUCK.height / 2 + .15, p.z);
    this.beacon.quaternion.set(q.x, q.y, q.z, q.w);
    this.beacon.visible = truck.hp > 0;
    this.lamp.color.setHex(truck.driveHp === 0 ? 0xe87755 : 0xe1b363);
    const marker = m.marker;
    this.marker.visible = !!marker;
    if (marker) {
      this.marker.position.set(marker.x, .068, marker.z); this.marker.scale.setScalar(marker.radius);
      this.marker.material.color.setHex(marker.kind === "return" ? 0xa3e6d0 : 0xe1b363);
      this.marker.material.opacity = reducedMotion ? .8 : .7 + Math.sin(sim.time * 4) * .1;
    }
    this.salvage.visible = !truck.hp;
    this.salvage.position.set(p.x, .03, p.z - 4.4);
    this.salvage.rotation.y = truck.yaw;
  }
}
