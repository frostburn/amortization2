import * as THREE from "three";
import { ForestView } from "./forest";
import { batchRigid, block, surface, tube } from "./primitives";
import { forestPoint, NIGHT_SITES } from "../game/night-forest";

/** The seized daytime site, now receiving an inspection crew under temporary work lights. */
export class NightForestView extends ForestView {
  constructor() {
    super();
    const kit = new THREE.Group(), steel = surface(0x475654, .5), lamp = new THREE.MeshBasicMaterial({ color: 0xffe2b0 });
    for (const [p, height] of [[{ x: 8, z: -26 }, 7], [{ x: 35, z: 24 }, 6]] as const) {
      const ground = forestPoint(p);
      tube(kit, .09, height, p.x, ground.y + height / 2, p.z, steel);
      for (const side of [-1, 1]) {
        const foot = block(kit, .1, .15, 2, p.x + side * .65, ground.y + .1, p.z, steel); foot.rotation.y = side * .6;
        block(kit, .65, .18, .5, p.x + side * .35, ground.y + height, p.z, steel);
        block(kit, .56, .035, .42, p.x + side * .35, ground.y + height - .12, p.z, lamp);
      }
    }
    // Receiving bays lie beside the forestry road; the convoy stops in separate slots.
    const paint = new THREE.MeshBasicMaterial({ color: 0x91c5ae });
    for (const x of [32, 45]) for (const z of [33, 41]) block(kit, 9, .006, .09, x, .055, z, paint);
    for (const x of [28, 49]) {
      tube(kit, .07, 1.2, x, .6, NIGHT_SITES.receiving.z + 5, steel);
      block(kit, .2, .12, .2, x, 1.22, NIGHT_SITES.receiving.z + 5, paint);
    }
    batchRigid(kit); this.root.add(kit);
  }
}
