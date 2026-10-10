import * as THREE from "three";
import { ESCORT_DOOR, ESCORT_INTERIOR, ESCORT_REAR_DOOR, ESCORT_SEATS, ESCORT_SITES } from "../game/escort";
import type { EscortMission } from "../game/escort-mission";
import type { Simulation } from "../game/simulation";
import { VEHICLES } from "../game/traffic";
import { batchRigid, block, surface, tube } from "./primitives";
import { recordsOffice } from "./records-office";
import { vehicleBody } from "./traffic";

const ring = (site: { x: number; z: number; radius: number }, color: number) => {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(site.radius - .08, site.radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .8, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(site.x, .065, site.z); return mesh;
};

export class EscortView {
  root = new THREE.Group();
  private office: ReturnType<typeof recordsOffice>;
  private door = new THREE.Group();
  private rear = new THREE.Group();
  private lamp = new THREE.MeshBasicMaterial({ color: 0xdbac5b });
  private exitLamp = new THREE.MeshBasicMaterial({ color: 0x655d4d });
  private alarm = new THREE.MeshBasicMaterial({ color: 0x655d4d });
  private rescue = ring(ESCORT_SITES.quill, 0xdbac5b);
  private exit = ring(ESCORT_SITES.exit, 0xa3e6d0);
  constructor(coverage = true) {
    this.office = recordsOffice(coverage);
    const kit = new THREE.Group(), steel = surface(0x405658, .45), dark = surface(0x29393d),
      wood = surface(0x9b8570), paper = surface(0xc5c3b4), upholstery = surface(0x576a72), paint = surface(0xb8a574);
    // Two framed security leaves, with handles and a visible central lock.
    const b = ESCORT_DOOR;
    for (const side of [-1, 1]) {
      const x = b.x + side * b.w / 4;
      block(this.door, b.w / 2 - .06, b.h - .08, b.d, x, b.h / 2, b.z, steel);
      block(this.door, b.w / 2 - .35, 1.25, .025, x, 2.45, b.z + .19, dark);
      block(this.door, .07, .65, .14, b.x + side * .22, 1.4, b.z + .2, paper);
    }
    block(this.door, .22, .25, .09, b.x, 1.4, b.z + .22, paint);
    block(kit, .45, .18, .09, b.x - b.w / 2 - .35, 2.1, b.z + .14, this.lamp);
    const rear = ESCORT_REAR_DOOR;
    block(this.rear, rear.w, rear.h, rear.d, rear.x, rear.h / 2, rear.z, steel);
    block(this.rear, rear.w - .4, .12, .1, rear.x, 1.15, rear.z + .2, paper);
    block(kit, .7, .16, .12, rear.x, 3.55, rear.z - .16, this.exitLamp);
    // Reception counter, archive shelves, paperwork and ordinary office chairs.
    for (const [i, p] of ESCORT_INTERIOR.entries()) {
      if (i === 0 || i === 3) {
        block(kit, p.w, .1, p.d, p.x, p.h - .05, p.z, wood);
        if (i === 0) block(kit, p.w - .12, p.h - .1, p.d - .12, p.x, (p.h - .1) / 2, p.z, paper);
        else for (const x of [-1, 1]) for (const z of [-1, 1])
          block(kit, .07, p.h - .1, .07, p.x + x * (p.w / 2 - .15), (p.h - .1) / 2, p.z + z * (p.d / 2 - .15), steel);
        block(kit, .55, .1, .4, p.x + .5, p.h + .05, p.z, paper);
        block(kit, .8, .45, .07, p.x - .7, p.h + .3, p.z, dark);
      } else {
        block(kit, p.w, p.h, p.d, p.x, p.h / 2, p.z, steel);
        for (let y = .35; y < p.h; y += .45) {
          block(kit, p.w + .02, .04, p.d + .02, p.x, y, p.z, dark);
          for (let z = p.z - p.d / 2 + .35; z < p.z + p.d / 2; z += .65)
            block(kit, p.w + .03, .32, .45, p.x, y + .18, z, paper);
        }
      }
    }
    for (const { x, z } of ESCORT_SEATS) {
      block(kit, .65, .12, .65, x, .5, z, upholstery);
      block(kit, .65, .7, .1, x, .79, z + .3, upholstery);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) block(kit, .055, .45, .055, x + sx * .26, .225, z + sz * .26, steel);
    }
    const site = ESCORT_SITES.exit;
    for (const side of [-1, 1]) {
      block(kit, site.radius * 2, .005, .08, site.x, .045, site.z + side * site.radius, paint);
      block(kit, .08, .005, site.radius * 2, site.x + side * site.radius, .045, site.z, paint);
    }
    const van = vehicleBody("VAN"), parked = new THREE.Group(); van.paint.color.setHex(0x728c82);
    van.root.position.y = VEHICLES.VAN.height / 2 + .035; parked.add(van.root);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const tire = tube(parked, .36, .23, side * .98, .36, end * VEHICLES.VAN.wheelbase / 2, dark, 16);
      tire.rotation.z = Math.PI / 2;
    }
    parked.position.set(ESCORT_SITES.van.x, 0, ESCORT_SITES.van.z); parked.rotation.y = Math.PI / 2;
    tube(kit, .06, 2.2, 23, 1.1, 11, steel);
    block(kit, .25, .18, .25, 23, 2.2, 11, this.alarm);
    batchRigid(kit); batchRigid(this.door); batchRigid(this.rear);
    this.root.add(this.office.root, kit, this.door, this.rear, parked, this.rescue, this.exit);
  }
  setReflections(texture?: THREE.Texture) {
    if (texture) { this.office.glazing.material.envMap = texture; this.office.glazing.material.needsUpdate = true; }
  }
  update(sim: Simulation, reducedMotion: boolean) {
    const mission = sim.mission as EscortMission;
    this.office.setCutaway(!!mission.cutawayRoofs.length);
    this.office.glazing.update(sim.city!.windows.broken);
    this.door.visible = mission.doorHp > 0; this.rear.visible = !mission.rearOpen;
    this.lamp.color.setHex(mission.doorHp ? 0xdbac5b : 0xa3e6d0);
    this.exitLamp.color.setHex(mission.rearOpen ? 0xa3e6d0 : 0x655d4d);
    this.alarm.color.setHex(mission.arrivedAt === undefined ? 0x655d4d : reducedMotion || Math.sin(sim.time * 10) > 0 ? 0xe8835c : 0x712d26);
    this.rescue.visible = mission.phase === "rescue" && !mission.guards.length;
    this.exit.visible = mission.phase === "escort";
    for (const marker of [this.rescue, this.exit]) marker.material.opacity = reducedMotion ? .8 : .7 + Math.sin(sim.time * 4) * .1;
  }
}
