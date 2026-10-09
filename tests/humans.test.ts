import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { makeHuman } from "../src/render/humans";
import { CAST, makeModelRoomCast } from "../src/render/model-room-cast";

function topology(geometry: THREE.BufferGeometry, part: string) {
  const { start, end } = geometry.userData.parts[part];
  const links = new Map<number, Set<number>>(), edges = new Map<string, { count: number; direction: number }>();
  const index = geometry.index!;
  for (let i = 0; i < index.count; i += 3) {
    const face = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    if (!face.every(v => v >= start && v < end)) continue;
    for (let j = 0; j < 3; j++) {
      const a = face[j], b = face[(j + 1) % 3], key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      if (!links.has(a)) links.set(a, new Set()); if (!links.has(b)) links.set(b, new Set());
      links.get(a)!.add(b); links.get(b)!.add(a);
      const edge = edges.get(key) ?? { count: 0, direction: 0 };
      edge.count++; edge.direction += a < b ? 1 : -1; edges.set(key, edge);
    }
  }
  const visited = new Set<number>(); let components = 0;
  for (const v of links.keys()) if (!visited.has(v)) {
    components++; const pending = [v];
    while (pending.length) {
      const next = pending.pop()!; if (visited.has(next)) continue; visited.add(next);
      pending.push(...links.get(next)!);
    }
  }
  return { components, edges: [...edges.values()] };
}

describe("faceless civilian prefab", () => {
  test("adult proportions, closed front surfaces and economical untextured geometry", () => {
    const human = makeHuman();
    try {
      const bounds = new THREE.Box3().setFromObject(human.root), size = bounds.getSize(new THREE.Vector3());
      expect(size.y).toBeGreaterThan(1.73); expect(size.y).toBeLessThan(1.75);
      expect(size.x).toBeLessThan(.7); expect(bounds.min.y).toBeGreaterThanOrEqual(0);
      let triangles = 0;
      human.root.traverse(o => { if (o instanceof THREE.Mesh) {
        triangles += (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) / 3;
        for (const material of Array.isArray(o.material) ? o.material : [o.material]) {
          expect((material as THREE.MeshStandardMaterial).map).toBeNull();
        }
        expect([...o.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
      } });
      expect(triangles).toBeLessThan(5000);
      const ray = new THREE.Raycaster();
      for (const y of [1.57, 1.61, 1.65]) {
        ray.set(new THREE.Vector3(0, y, .5), new THREE.Vector3(0, 0, -1));
        const hits = ray.intersectObject(human.root, true); expect(hits.length).toBeGreaterThan(0);
        const mesh = hits[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial[]>;
        expect(mesh.material[hits[0].face!.materialIndex].color.getHex()).toBe(0xb68d72);
      }
    } finally { human.dispose(); }
  });
  test("garments have sewn branches and hands and boots are closed connected surfaces", () => {
    const human = makeHuman();
    try {
      expect(human.mesh).toBeInstanceOf(THREE.SkinnedMesh);
      for (const part of ["jacket", "trousers", "left hand", "right hand", "left boot", "right boot"]) {
        const surface = topology(human.mesh.geometry, part);
        expect(surface.components, part).toBe(1);
        // Each interior edge has exactly two faces, facing opposite directions.
        // This catches overlapping caps, reversed thumb tips and broken seams.
        for (const edge of surface.edges) {
          expect(edge.count, part).toBeLessThanOrEqual(2);
          if (edge.count === 2) expect(edge.direction, part).toBe(0);
        }
        if (part.includes("hand") || part.includes("boot")) {
          expect(surface.edges.every(e => e.count === 2), part).toBe(true);
        }
      }
      const weights = human.mesh.geometry.getAttribute("skinWeight"), indices = human.mesh.geometry.getAttribute("skinIndex");
      for (let i = 0; i < weights.count; i++) {
        expect([weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)].reduce((a, b) => a + b)).toBeCloseTo(1, 6);
        for (const bone of [indices.getX(i), indices.getY(i), indices.getZ(i), indices.getW(i)]) {
          expect(bone).toBeLessThan(human.skeleton.bones.length);
        }
      }
      const { start, end } = human.mesh.geometry.userData.parts.jacket;
      const standing = Array.from({ length: end - start }, (_, i) => human.mesh.getVertexPosition(start + i, new THREE.Vector3()));
      human.pose("crouching");
      const changed = standing.filter((p, i) => p.distanceTo(human.mesh.getVertexPosition(start + i, new THREE.Vector3())) > .05);
      expect(changed.length).toBeGreaterThan(standing.length / 2);
    } finally { human.dispose(); }
  });
  test("walking feet stay above the floor and crouching lowers the head without moving the prefab", () => {
    const human = makeHuman(), rootPosition = human.root.position.clone();
    try {
      for (let time = 0; time < 1.2; time += .1) {
        human.pose("walking", time);
        const bounds = new THREE.Box3().setFromObject(human.root);
        expect(bounds.min.y).toBeGreaterThanOrEqual(-.001); expect(bounds.max.y).toBeLessThan(1.8);
      }
      human.pose("crouching");
      const crouch = new THREE.Box3().setFromObject(human.root);
      expect(crouch.max.y).toBeLessThan(1.45); expect(crouch.min.y).toBeGreaterThanOrEqual(-.001);
      human.pose("standing"); expect(new THREE.Box3().setFromObject(human.root).max.y).toBeGreaterThan(1.73);
      expect(human.root.position.equals(rootPosition)).toBe(true);
    } finally { human.dispose(); }
  });
  test("the rear waist stays under the jacket and trouser cuffs cover the boot shafts when bending", () => {
    const human = makeHuman(), ray = new THREE.Raycaster(), p = new THREE.Vector3();
    const colorAt = (from: THREE.Vector3, direction: THREE.Vector3) => {
      ray.set(from, direction); const hit = ray.intersectObject(human.mesh)[0]; expect(hit).toBeDefined();
      return human.mesh.material[hit.face!.materialIndex].color.getHex();
    };
    try {
      for (const [pose, time] of [["standing", 0], ["crouching", 0], ["walking", .1], ["walking", .4], ["walking", .8]] as const) {
        human.pose(pose, time);
        const hips = human.skeleton.bones.find(b => b.name === "hips")!.getWorldPosition(p);
        for (const x of [-.14, -.08, 0, .08, .14]) for (const dy of [-.075, -.025, .015]) {
          expect(colorAt(new THREE.Vector3(x, hips.y + dy, hips.z - .5), new THREE.Vector3(0, 0, 1)), `${pose}: rear waist`).toBe(0x536d7d);
        }
        for (const side of ["left", "right"]) {
          const ankle = human.skeleton.bones.find(b => b.name === `${side} ankle`)!;
          // Local to the planted boot: ray through its top edge must hit cloth first.
          const from = new THREE.Vector3(0, .116, -.4).applyMatrix4(ankle.matrixWorld);
          const direction = new THREE.Vector3(0, 0, 1).transformDirection(ankle.matrixWorld);
          expect(colorAt(from, direction), `${pose}: ${side} cuff`).toBe(0x42494b);
        }
      }
    } finally { human.dispose(); }
  });
  test("comparison fixtures keep native model scales, complete fleets and grounded geometry", async () => {
    const human = makeHuman(), cast = await makeModelRoomCast(human);
    try {
      expect(cast.models.map(m => m.id)).toEqual(CAST.map(c => c.id));
      for (const model of cast.models) {
        expect(model.root.scale.toArray()).toEqual([1, 1, 1]);
        expect(model.bounds.min.y).toBeCloseTo(0, 5);
        expect(model.bounds.max.y).toBeGreaterThan(.3);
        const size = model.bounds.getSize(new THREE.Vector3()); expect(size.toArray().every(Number.isFinite)).toBe(true);
      }
      const byId = (id: string) => cast.models.find(m => m.id === id)!;
      expect(byId("anchor").bounds.max.y).toBeGreaterThan(byId("human").bounds.max.y);
      expect(byId("rook").bounds.getSize(new THREE.Vector3()).x).toBeGreaterThan(byId("needle").bounds.getSize(new THREE.Vector3()).x);
      expect(byId("van").bounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(4);
      const fleet = byId("cart").root, meshes: THREE.InstancedMesh[] = [];
      fleet.traverse(o => { if (o instanceof THREE.InstancedMesh) meshes.push(o); });
      expect(meshes.length).toBeGreaterThan(3); expect(meshes.every(m => m.count === 1)).toBe(true);
      let released = 0; meshes.forEach(m => m.addEventListener("dispose", () => released++));
      cast.dispose(); expect(released).toBe(meshes.length);
    } finally { human.dispose(); }
  });
});
