import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { CITY_DISTRICT } from "../src/game/city";
import { CityView } from "../src/render/city";
import { crateBody } from "../src/render/carts";
import { batchRigid } from "../src/render/primitives";

function dispose(root: THREE.Object3D) {
  const materials = new Set<THREE.Material>();
  root.traverse(o => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m));
  });
  materials.forEach(m => m.dispose());
}

describe("city surfaces", () => {
  test("delivery paint and receivers remain exposed above paving without duplicate faces", () => {
    const texture = new THREE.Texture(), view = new CityView(CITY_DISTRICT, texture), ray = new THREE.Raycaster();
    view.root.updateMatrixWorld(true);
    try {
      for (const pad of CITY_DISTRICT.pads) for (const [dx, dz, color] of [[1.74, 0.14, pad.color], [0.1, 0.07, 0x465659], [2.03, 0.02, pad.color]]) {
        ray.set(new THREE.Vector3(pad.x + dx, 2, pad.z + dz), new THREE.Vector3(0, -1, 0));
        const hits = ray.intersectObject(view.root, true), first = hits[0];
        expect(first.point.y).toBeGreaterThan(0.033);
        expect((first.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex()).toBe(color);
        expect(hits.filter(h => Math.abs(h.distance - first.distance) < 1e-6)).toHaveLength(1);
      }
    } finally { dispose(view.root); texture.dispose(); }
  });
  test("traffic lanes retain continuous asphalt through every junction, quay and bridge", () => {
    const texture = new THREE.Texture(), view = new CityView(CITY_DISTRICT, texture);
    view.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    try {
      for (const street of CITY_DISTRICT.streets) {
        for (let t = -street.length / 2 + 0.731; t < street.length / 2; t += 1.25) {
          const x = street.axis === "x" ? street.center + t : street.at + street.width * 0.23;
          const z = street.axis === "x" ? street.at + street.width * 0.23 : street.center + t;
          ray.set(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0));
          const hits = ray.intersectObject(view.root, true), first = hits[0];
          expect(first, `missing road at ${x}, ${z}`).toBeDefined();
          const color = (first.object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex();
          expect([0x424c50, 0xd3cdbc], `paving covers road at ${x}, ${z}`).toContain(color);
          expect(first.point.y).toBeLessThan(0.02);
          // Shared surfaces must have no duplicate top faces, including after batching.
          expect(hits.filter(h => Math.abs(h.distance - first.distance) < 1e-6)).toHaveLength(1);
        }
      }
    } finally { dispose(view.root); texture.dispose(); }
  });

  test("CRATE cabinet seams have one exposed surface before and after batching", () => {
    const root = crateBody(), ray = new THREE.Raycaster();
    const check = () => {
      root.updateMatrixWorld(true);
      const single = (origin: THREE.Vector3, direction: THREE.Vector3) => {
        ray.set(origin, direction);
        const hits = ray.intersectObject(root, true), first = hits[0];
        expect(first).toBeDefined();
        expect(hits.filter(h => Math.abs(h.distance - first.distance) < 1e-6),
          `overlapping cabinet faces at ${origin.toArray()}`).toHaveLength(1);
      };
      for (const y of [-0.38, -0.06, 0.26, 0.52, 0.58]) for (const x of [-0.4175, 0.4175]) {
        single(new THREE.Vector3(x, y, 2), new THREE.Vector3(0, 0, -1));
        single(new THREE.Vector3(x, y, -2), new THREE.Vector3(0, 0, 1));
      }
      for (const side of [-1, 1]) for (const z of [-0.517, 0.03, 0.517])
        single(new THREE.Vector3(side * 2, 0.52, z), new THREE.Vector3(-side, 0, 0));
      // Each open compartment reveals its parcel before the recessed backing.
      for (const y of [-0.22, 0.10, 0.42]) {
        ray.set(new THREE.Vector3(0.123, y, 2), new THREE.Vector3(0, 0, -1));
        const hits = ray.intersectObject(root, true);
        expect((hits[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex()).toBe(0xa6936d);
        expect(hits[0].point.z).toBeGreaterThan(0.35);
      }
    };
    try { check(); batchRigid(root); check(); } finally { dispose(root); }
  });
});
