import * as THREE from "three";
import { serviceHallRoof, serviceHallWalls, type ServiceHallSpec } from "../game/handling";
import { batchRigid, block, surface, tube } from "./primitives";

/** Industrial wall panels, a loading portal and a separately removable roof. */
export function serviceHall(s: ServiceHallSpec) {
  const root = new THREE.Group(), walls = new THREE.Group(), roof = new THREE.Group();
  const panel = surface(0x8d9390, 0.25), frame = surface(0x405658, 0.5), concrete = surface(0x696d68);
  const roofing = surface(0x637573, 0.45), roofPanel = surface(0x6b7b78, 0.45);
  for (const b of serviceHallWalls(s)) {
    block(walls, b.w, b.h, b.d, b.x, b.h / 2, b.z, panel);
    block(walls, b.w + 0.04, 0.4, b.d + 0.04, b.x, 0.2, b.z, concrete);
    block(walls, b.w + 0.04, 0.13, b.d + 0.04, b.x, b.h - 0.065, b.z, frame);
  }
  // Vertical cladding joints stop at the plinth and connect to the eaves.
  for (const side of [-1, 1]) {
    for (let x = s.x - s.w / 2 + 2; x < s.x + s.w / 2; x += 3.25)
      block(walls, 0.045, s.h - 0.4, 0.03, x, (s.h + 0.4) / 2, s.z + side * (s.d / 2 + 0.265), frame);
    for (let z = s.z - s.d / 2 + 2; z < s.z + s.d / 2; z += 3.25) {
      if (side === -1 && Math.abs(z - s.z) < s.door / 2) continue;
      block(walls, 0.03, s.h - 0.4, 0.045, s.x + side * (s.w / 2 + 0.265), (s.h + 0.4) / 2, z, frame);
    }
    block(walls, 0.62, s.h, 0.22, s.x - s.w / 2, s.h / 2, s.z + side * (s.door / 2 + 0.11), frame);
    tube(walls, 0.065, s.h - 0.4, s.x + s.w / 2 + 0.33, s.h / 2, s.z + side * (s.d / 2 - 0.6), frame);
  }
  block(walls, 0.62, 0.18, s.door, s.x - s.w / 2, s.h - 0.09, s.z, frame);
  // The roof bears on the entire perimeter, with a modest overhang and fascia.
  const r = serviceHallRoof(s), top = r.y! + r.h;
  block(roof, r.w, r.h, r.d, r.x, r.y! + r.h / 2, r.z, roofing);
  for (const side of [-1, 1]) {
    block(roof, r.w + 0.06, 0.2, 0.06, r.x, top - 0.1, r.z + side * (r.d / 2 + 0.03), frame);
    block(roof, 0.06, 0.2, r.d, r.x + side * (r.w / 2 + 0.03), top - 0.1, r.z, frame);
  }
  // Broad panel courses read at tactical zoom; centimetre ribs alias into dots.
  for (let left = r.x - r.w / 2 + 0.06; left < r.x + r.w / 2 - 0.06; left += 6.5) {
    const width = Math.min(3.25, r.x + r.w / 2 - 0.06 - left);
    block(roof, width, 0.02, r.d - 0.12, left + width / 2, top + 0.01, r.z, roofPanel);
  }
  batchRigid(walls); batchRigid(roof);
  for (const mesh of roof.children) if (mesh instanceof THREE.Mesh && mesh.material === roofPanel) mesh.castShadow = false;
  root.add(walls, roof);
  return { root, roof };
}
