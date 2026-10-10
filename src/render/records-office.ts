import * as THREE from "three";
import { RECORDS_CANOPY, RECORDS_FACADES, RECORDS_OFFICE, RECORDS_PANES, RECORDS_POSTS, RECORDS_ROOF, RECORDS_WALLS } from "../game/records-office";
import { batchRigid, block, surface } from "./primitives";
import { makeFacade, WindowView } from "./windows";

/** Brick street frontage and a walkable office, independent of the warehouse kit. */
export function recordsOffice(coverage = true) {
  const root = new THREE.Group(), walls = new THREE.Group(), roof = new THREE.Group();
  const brick = surface(0xa08170), plaster = surface(0xb6b5a8), stone = surface(0xd1caba),
    frame = surface(0x3b5159, .45), roofing = surface(0x777d75), carpet = surface(0x708481);
  brick.side = plaster.side = THREE.DoubleSide;
  const glazing = new WindowView(RECORDS_PANES, coverage), materials = [brick, plaster, stone, frame, glazing.material];
  materials.forEach(m => { m.alphaToCoverage = coverage; });
  RECORDS_FACADES.forEach((f, i) => {
    const face = makeFacade(f, i < 4 ? brick : plaster, frame, frame, true);
    face.position.set(f.x, 0, f.z); face.rotation.y = f.turn * Math.PI / 2; walls.add(face);
  });
  for (const p of RECORDS_WALLS.slice(0, 6)) {
    block(walls, p.w + .1, .42, p.d + .1, p.x, .21, p.z, stone);
    block(walls, p.w + .15, .18, p.d + .15, p.x, 4.31, p.z, stone);
  }
  // A covered entrance reads as an office lobby rather than a loading portal.
  for (const p of RECORDS_POSTS) block(walls, p.w, p.h, p.d, p.x, p.h / 2, p.z, stone);
  const canopy = RECORDS_CANOPY;
  block(roof, canopy.w, canopy.h, canopy.d, canopy.x, canopy.y! + canopy.h / 2, canopy.z, frame);
  block(root, RECORDS_OFFICE.w - .2, .008, RECORDS_OFFICE.d - .2, 6, .04, -2, surface(0xb6b5a8));
  block(root, 25.6, .006, 8.6, 6, .047, -7.3, carpet);
  const r = RECORDS_ROOF, top = r.y! + r.h;
  block(roof, r.w, r.h, r.d, r.x, r.y! + r.h / 2, r.z, roofing);
  for (const side of [-1, 1]) {
    block(roof, r.w, .34, .18, r.x, top + .17, r.z + side * (r.d / 2 - .1), stone);
    block(roof, .18, .34, r.d, r.x + side * (r.w / 2 - .1), top + .17, r.z, stone);
  }
  block(roof, 3.2, .7, 2, 9, top + .35, -6, frame);
  for (let z = -6.7; z <= -5.3; z += .28) block(roof, 2.8, .045, .08, 9, top + .73, z, stone);
  batchRigid(walls); batchRigid(roof); walls.add(glazing.mesh); root.add(walls, roof);
  return { root, glazing, setCutaway(revealed: boolean) {
    roof.visible = !revealed;
    for (const m of materials) {
      const transparent = revealed && !coverage;
      if (m.transparent !== transparent) { m.transparent = transparent; m.needsUpdate = true; }
      m.depthWrite = !transparent; m.opacity = revealed ? .24 : 1;
    }
  } };
}
