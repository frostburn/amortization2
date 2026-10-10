import * as THREE from "three";
import { ESCORT_COVER, ESCORT_DOOR, ESCORT_INTERIOR, ESCORT_OFFICE, ESCORT_SITES } from "../game/escort";
import type { EscortMission } from "../game/escort-mission";
import type { Simulation } from "../game/simulation";
import { VEHICLES } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";
import { serviceHall } from "./service-hall";
import { vehicleBody } from "./traffic";

const ring = (site: { x: number; z: number; radius: number }, color: number) => {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(site.radius - .08, site.radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(site.x, .065, site.z); return mesh;
};

export class EscortView {
  root = new THREE.Group();
  private office: ReturnType<typeof serviceHall>;
  private door = new THREE.Group();
  private lamp = new THREE.MeshBasicMaterial({ color: 0xdbac5b });
  private alarm = new THREE.MeshBasicMaterial({ color: 0x655d4d });
  private rescue = ring(ESCORT_SITES.quill, 0xdbac5b);
  private exit = ring(ESCORT_SITES.exit, 0xa3e6d0);
  constructor(coverage = true) {
    this.office = serviceHall(ESCORT_OFFICE, coverage);
    const kit = new THREE.Group(), steel = surface(0x405658, .45), dark = surface(0x29393d),
      paint = surface(0xb8a574), wood = surface(0x968a74), files = surface(0x9aa59d);
    const b = ESCORT_DOOR;
    for (let y = .15; y < b.h; y += .3) block(this.door, b.w, .27, b.d, b.x, y, b.z, steel);
    block(kit, .7, .36, b.d + .6, b.x, 3.99, b.z, dark);
    block(this.door, .08, .35, .3, b.x - .27, 1.4, b.z, paint);
    block(kit, .08, .24, .5, b.x - .33, 2.65, b.z - b.d / 2 - .5, this.lamp);
    for (const [i, p] of ESCORT_INTERIOR.entries()) {
      if (i === 1) {
        block(kit, p.w, .09, p.d, p.x, p.h - .045, p.z, wood);
        for (const x of [-1, 1]) for (const z of [-1, 1])
          block(kit, .08, .67, .08, p.x + x * (p.w / 2 - .15), .335, p.z + z * (p.d / 2 - .15), steel);
        block(kit, .6, .12, .45, p.x, p.h + .06, p.z, files);
      } else {
        block(kit, p.w, p.h, p.d, p.x, p.h / 2, p.z, steel);
        for (let y = .35; y < p.h; y += .4) {
          block(kit, p.w + .02, .025, p.d + .02, p.x, y, p.z, dark);
          block(kit, i ? p.w * .75 : .03, .2, i ? .03 : p.d * .75,
            p.x - (i ? 0 : p.w / 2 + .025), y + .12, p.z + (i ? p.d / 2 + .025 : 0), files);
        }
      }
    }
    for (const p of ESCORT_COVER) block(kit, p.w, p.h, p.d, p.x, p.h / 2, p.z, steel);
    // Painted recovery bay and the familiar support van, from the shared kit.
    const site = ESCORT_SITES.exit;
    for (const side of [-1, 1]) {
      block(kit, site.radius * 2, .005, .08, site.x, .045, site.z + side * site.radius, paint);
      block(kit, .08, .005, site.radius * 2, site.x + side * site.radius, .045, site.z, paint);
    }
    const van = vehicleBody("VAN"); van.paint.color.setHex(0x728c82);
    van.root.position.set(ESCORT_SITES.van.x, VEHICLES.VAN.height / 2 + .035, ESCORT_SITES.van.z);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const tire = tube(kit, .36, .23, ESCORT_SITES.van.x + side * .98, .36,
        ESCORT_SITES.van.z + end * VEHICLES.VAN.wheelbase / 2, dark, 16);
      tire.rotation.z = Math.PI / 2;
    }
    tube(kit, .06, 2.2, -8, 1.1, 17, steel);
    block(kit, .25, .18, .25, -8, 2.2, 17, this.alarm);
    batchRigid(kit); batchRigid(this.door);
    this.root.add(this.office.root, kit, this.door, van.root, this.rescue, this.exit);
  }
  update(sim: Simulation, reducedMotion: boolean) {
    const mission = sim.mission as EscortMission;
    this.office.setCutaway(!!mission.cutawayRoofs.length);
    this.door.visible = mission.doorHp > 0;
    this.lamp.color.setHex(mission.doorHp ? 0xdbac5b : 0xa3e6d0);
    this.alarm.color.setHex(mission.arrivedAt === undefined ? 0x655d4d : reducedMotion || Math.sin(sim.time * 10) > 0 ? 0xe8835c : 0x712d26);
    this.rescue.visible = mission.phase === "rescue" && !mission.guards.length;
    this.exit.visible = mission.phase === "escort";
    for (const marker of [this.rescue, this.exit]) marker.material.opacity = reducedMotion ? .8 : .7 + Math.sin(sim.time * 4) * .1;
  }
}
