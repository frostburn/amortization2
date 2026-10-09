import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { makeHuman } from "../src/render/humans";
import { CAST, makeModelRoomCast } from "../src/render/model-room-cast";

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
        expect((o.material as THREE.MeshStandardMaterial).map).toBeNull();
        expect([...o.geometry.getAttribute("position").array].every(Number.isFinite)).toBe(true);
      } });
      expect(triangles).toBeLessThan(5000);
      const ray = new THREE.Raycaster();
      for (const y of [1.57, 1.61, 1.65]) {
        ray.set(new THREE.Vector3(0, y, .5), new THREE.Vector3(0, 0, -1));
        const hits = ray.intersectObject(human.root, true); expect(hits.length).toBeGreaterThan(0);
        expect((hits[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex()).toBe(0xb68d72);
      }
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
