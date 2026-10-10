import * as THREE from "three";
import { block, surface, tube } from "./primitives";

/** A sealed utility-equipment flight case, usable as a physical prop anywhere. */
export function equipmentCase(w: number, h: number, d: number) {
  const root = new THREE.Group(), steel = surface(0x526568, .45), dark = surface(0x283639), trim = surface(0xc7c7b6);
  block(root, w, h - .45, d, 0, .12, 0, steel);
  block(root, w + .025, .09, d + .025, 0, h / 2 - .08, 0, trim);
  for (const side of [-1, 1]) {
    block(root, .07, h - .5, d + .025, side * (w / 2 - .13), .12, 0, dark);
    block(root, .28, .07, .08, side * (w / 2 - .22), .25, d / 2 + .03, trim);
    for (const end of [-1, 1]) {
      const wheel = tube(root, .14, .1, side * (w / 2 - .06), -h / 2 + .16, end * (d / 2 - .13), dark);
      wheel.rotation.z = Math.PI / 2;
    }
  }
  return root;
}
