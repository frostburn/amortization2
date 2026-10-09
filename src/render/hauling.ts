import * as THREE from "three";
import { HANDLING_GATE, HANDLING_SITES, SERVICE_HALL, SERVICE_HALL_SPEC } from "../game/handling";
import type { Prop, Simulation } from "../game/simulation";
import { VEHICLES } from "../game/traffic";
import { vehicleBody } from "./traffic";
import { batchRigid, block, surface, tube } from "./primitives";
import { serviceHall } from "./service-hall";

/** Cargo models reuse the physical dimensions; handles advertise one/two hands. */
export function squadCargo(prop: Prop) {
  const root = new THREE.Group(), heavy = prop.style === "chest";
  const shell = surface(heavy ? 0x465e5a : 0xb09d77), edge = surface(0x253b40, 0.45), latch = surface(0xb6b8a6, 0.5);
  block(root, prop.w, prop.h, prop.d, 0, 0, 0, shell);
  block(root, prop.w + 0.03, 0.035, prop.d + 0.03, 0, prop.h / 2 - 0.04, 0, edge);
  for (const x of [-prop.w * 0.34, prop.w * 0.34]) {
    block(root, 0.06, prop.h + 0.02, prop.d + 0.02, x, 0, 0, edge);
    block(root, 0.09, 0.13, 0.04, x, prop.h * 0.15, prop.d / 2 + 0.03, latch);
  }
  if (heavy) for (const side of [-1, 1]) {
    block(root, 0.055, 0.06, 0.5, side * (prop.w / 2 + 0.10), 0.04, 0, latch);
    for (const z of [-0.22, 0.22]) block(root, 0.12, 0.06, 0.055, side * (prop.w / 2 + 0.05), 0.04, z, latch);
  } else block(root, 0.28, 0.003, 0.22, 0.03, prop.h / 2 + 0.003, 0, latch);
  batchRigid(root); return root;
}

const ring = (site: { x: number; z: number; radius: number }, color: number) => {
  const mesh = new THREE.Mesh(new THREE.RingGeometry(site.radius - 0.08, site.radius, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthWrite: false }));
  mesh.rotation.x = -Math.PI / 2; mesh.position.set(site.x, 0.065, site.z); return mesh;
};

export class HandlingView {
  root = new THREE.Group();
  private gate = new THREE.Group();
  private lamp = new THREE.MeshBasicMaterial({ color: 0xdbac5b });
  private delivery = ring(HANDLING_SITES.delivery, 0xdbac5b);
  private exit = ring(HANDLING_SITES.exit, 0xa3e6d0);
  private grips: THREE.Group[] = [];
  private hall = serviceHall(SERVICE_HALL_SPEC);
  constructor(sim: Simulation) {
    const kit = new THREE.Group(), steel = surface(0x405658, 0.5), paint = surface(0xbaa36d);
    for (const b of SERVICE_HALL) {
      if (b.style === "crate") block(kit, b.w, b.h, b.d, b.x, b.h / 2, b.z, steel);
    }
    const b = HANDLING_GATE;
    for (let z = -3.8; z < 4; z += 0.4) block(this.gate, b.w + 0.02, b.h, 0.36, b.x, b.h / 2, z, steel);
    block(kit, 0.6, 0.12, 8.5, b.x, 3.95, 0, paint);
    block(kit, 0.08, 0.24, 0.8, b.x - 0.32, 2.7, -4.4, this.lamp);
    for (const site of [HANDLING_SITES.delivery, HANDLING_SITES.exit]) for (const sign of [-1, 1]) {
      block(kit, site.radius * 2, 0.005, 0.08, site.x, 0.045, site.z + sign * site.radius, paint);
      block(kit, 0.08, 0.005, site.radius * 2, site.x + sign * site.radius, 0.045, site.z, paint);
    }
    // Receiving plinth has no invisible collision or extra pickup requirement.
    block(kit, 2, 0.025, 2, HANDLING_SITES.delivery.x, 0.03, 0, steel);
    const van = vehicleBody("VAN"); van.paint.color.setHex(0x728c82);
    van.root.position.set(HANDLING_SITES.van.x, VEHICLES.VAN.height / 2 + 0.035, HANDLING_SITES.van.z);
    for (const side of [-1, 1]) for (const end of [-1, 1]) {
      const tire = tube(kit, 0.36, 0.23, HANDLING_SITES.van.x + side * 0.98, 0.36,
        HANDLING_SITES.van.z + end * VEHICLES.VAN.wheelbase / 2, steel, 16);
      tire.rotation.z = Math.PI / 2;
    }
    batchRigid(kit); batchRigid(this.gate);
    this.root.add(this.hall.root, kit, this.gate, van.root, this.delivery, this.exit);
    for (const load of sim.hauling!.loads) {
      const group = new THREE.Group();
      for (let i = 0; i < load.hands; i++) {
        const dot = ring({ x: (i - (load.hands - 1) / 2) * 0.65, z: 0, radius: 0.24 }, 0xdbac5b);
        group.add(dot);
      }
      this.grips.push(group); this.root.add(group);
    }
  }
  update(sim: Simulation, reducedMotion: boolean) {
    // Removing a visual roof never removes its physical collider.
    this.hall.roof.visible = !sim.mission!.cutawayRoofs.length;
    this.gate.visible = !sim.mission!.cargoReleased;
    this.lamp.color.setHex(sim.mission!.cargoReleased ? 0xa3e6d0 : 0xdbac5b);
    this.delivery.visible = sim.mission!.phase === "delivery";
    this.exit.visible = sim.mission!.phase === "haul" || sim.mission!.phase === "return";
    for (const [i, load] of sim.hauling!.loads.entries()) {
      const group = this.grips[i], p = load.prop.body.translation();
      group.position.set(p.x, 0.015, p.z); group.rotation.y = load.orientation; group.visible = load.unlocked && !load.delivered;
      group.children.forEach((dot, slot) => {
        const material = (dot as THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>).material;
        material.color.setHex(load.carriers[slot] ? 0xa3e6d0 : 0xdbac5b);
      });
    }
    for (const marker of [this.delivery, this.exit]) marker.material.opacity = reducedMotion ? 0.8 : 0.7 + Math.sin(sim.time * 4) * 0.1;
  }
}
