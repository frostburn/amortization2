import * as THREE from "three";
import { CONCOURSE_FIXTURES, CONCOURSE_RAILS, CONCOURSE_SURFACES } from "../game/concourse";
import { surfaceHeight, surfacePrism, type WalkSurface } from "../game/walk-surfaces";
import { batchRigid, block, surface } from "./primitives";
import type { Simulation } from "../game/simulation";

/** Concrete terraces, sloped paving and structural spans share the authored kit. */
export class ConcourseView {
  readonly root = new THREE.Group();
  private decks: { id: string; materials: THREE.MeshStandardMaterial[]; opacity: number }[] = [];
  constructor(coverage = true) {
    const root = this.root;
    const concrete = surface(0xa5aaa1), railing = surface(0x586a6c, .25), trim = surface(0xd1c9af);
    const paving = surface(0xc0ba9f), stripe = surface(0x78928b), dark = surface(0x4f5d5c);
    const prism = (parent: THREE.Group, s: WalkSurface, mat: THREE.Material) => {
      const data = surfacePrism(s), geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(data.vertices, 3));
      geometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
      const flat = geometry.toNonIndexed(); geometry.dispose(); flat.computeVertexNormals();
      // Flat prism normals, but the same indexed position/normal/UV schema as
      // the kit's boxes, so rigid batching can combine them without an overlay.
      const count = flat.getAttribute("position").count;
      flat.setIndex(Array.from({ length: count }, (_, i) => i));
      flat.setAttribute("uv", new THREE.BufferAttribute(new Float32Array(count * 2), 2));
      const mesh = new THREE.Mesh(flat, mat); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
    };
    for (const s of CONCOURSE_SURFACES) {
      const group = new THREE.Group(), materials = [concrete, paving, stripe, dark].map(mat => mat.clone());
      materials.forEach(mat => { mat.alphaToCoverage = coverage; mat.transparent = !coverage; });
      this.decks.push({ id: s.id, materials, opacity: 1 });
      prism(group, s, materials[0]);
      // Thin paving follows the same incline without coplanar faces.
      prism(group, { ...s, w: s.w - .08, d: s.d - .08, height: s.height + .018, thickness: .012, filled: false }, materials[1]);
      const ramp = !!s.slopeZ;
      for (const sign of [-1, 1]) prism(group, { ...s, w: .16, x: s.x + sign * (s.w / 2 - .55),
        height: s.height + .037, thickness: .01, filled: false }, materials[2]);
      // Expansion seams and cross-ramp grip strips communicate real slopes.
      for (let z = s.z - s.d / 2 + .8; z < s.z + s.d / 2; z += ramp ? 1.2 : 2.8)
        block(group, s.w - 1, .018, .055, s.x, surfaceHeight(s, { x: s.x, z }) + .044, z, materials[3]);
      if (s.id.includes("bridge") || s.id.includes("gallery") && !s.slopeZ)
        for (const side of [-1, 1]) block(group, s.w, .36, .25, s.x, s.height - .58,
          s.z + side * (s.d / 2 - .5), materials[0]);
      batchRigid(group); root.add(group);
    }
    for (const s of CONCOURSE_RAILS) {
      prism(root, s, railing);
      // Coping overhangs the wall; its overlapping skirt must not share the
      // wall's vertical faces (especially visible along inclined parapets).
      prism(root, { ...s, w: s.w + .04, d: s.d + .04, height: s.height + .035, thickness: .05 }, trim);
    }
    for (const b of CONCOURSE_FIXTURES.filter(b => !b.building && !('fixture' in b) && !b.y))
      block(root, b.w, b.h, b.d, b.x, b.h / 2, b.z, concrete);
    // Batch the shared parapets/supports without baking separately fading decks.
    const staticParts = new THREE.Group();
    root.children.filter(o => o instanceof THREE.Mesh).forEach(o => staticParts.add(o));
    batchRigid(staticParts); root.add(staticParts);
    [paving, stripe, dark].forEach(mat => mat.dispose());
  }
  update(sim: Simulation, camera: THREE.Camera, delta: number) {
    const hidden = new Set<string>();
    if (!sim.sniping) for (const actor of sim.active) {
      const hit = sim.ray(camera.position, actor.body.translation(), undefined,
        collider => sim.surfaceColliders.has(collider.handle));
      if (hit) hidden.add(sim.surfaceColliders.get(hit.collider.handle)!);
    }
    for (const deck of this.decks) {
      deck.opacity += ((hidden.has(deck.id) ? .22 : 1) - deck.opacity) * (1 - Math.exp(-delta * 10));
      deck.materials.forEach(mat => { mat.opacity = deck.opacity; });
    }
  }
  inspect() { return this.decks.map(d => ({ id: d.id, opacity: d.opacity })); }
}
