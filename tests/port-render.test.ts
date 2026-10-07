import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { MARINE_PORT, portSolids } from "../src/game/port";
import { CityView } from "../src/render/city";

describe("marine port scenery", () => {
  test("container stacks and sheds keep all continuing roads open; the sea has no exposed paving", () => {
    const texture = new THREE.Texture(), view = new CityView(MARINE_PORT, texture), ray = new THREE.Raycaster();
    view.root.updateMatrixWorld(true);
    const cast = (x: number, z: number, height = 45) => {
      ray.set(new THREE.Vector3(x, height, z), new THREE.Vector3(0, -1, 0));
      return ray.intersectObject(view.root, true);
    };
    try {
      for (const street of MARINE_PORT.streets) for (let t = -street.length / 2 + 0.731; t < street.length / 2; t += 1.25) {
        const x = street.axis === "x" ? street.center + t : street.at + street.width * 0.23;
        const z = street.axis === "x" ? street.at + street.width * 0.23 : street.center + t;
        expect(portSolids(MARINE_PORT).some(b => !b.navigationOnly && Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2), `solid occupies road at ${x}, ${z}`).toBe(false);
        // Gantry beams may pass overhead; the traffic surface below must stay continuous.
        const hits = cast(x, z, 2), first = hits[0];
        expect(first, `${x}, ${z}`).toBeDefined();
        expect(first.point.y, `road obstruction at ${x}, ${z}`).toBeLessThan(0.02);
        expect((first.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex()).toBe(0x424c50);
        expect(hits.filter(h => Math.abs(h.distance - first.distance) < 1e-6)).toHaveLength(1);
      }
      const sea = cast(95, 12)[0]; expect(sea.point.y).toBeCloseTo(-0.85);
      expect((sea.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex()).toBe(0x426a73);
      const deck = cast(64.1, 30.2)[0]; expect(deck.point.y).toBeCloseTo(1.9);
      const paint = cast(44.9, -67.77), first = paint[0];
      expect(first.point.y).toBeGreaterThan(0.033);
      expect(paint.filter(h => Math.abs(h.distance - first.distance) < 1e-6)).toHaveLength(1);
    } finally {
      const materials = new Set<THREE.Material>();
      view.root.traverse(o => { if (o instanceof THREE.Mesh) {
        o.geometry.dispose(); (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
      } }); materials.forEach(m => m.dispose()); texture.dispose();
    }
  });
});
