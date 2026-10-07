import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { BUILDING_KIT, CITY_DISTRICT, buildingSolid } from "../src/game/city";
import { makeBuilding } from "../src/render/city";

describe("building facades", () => {
  test("district buildings and awnings clear roads, neighbouring buildings and skyline sidewalks", () => {
    const views = CITY_DISTRICT.buildings.map(spec => makeBuilding(spec));
    try {
      const bounds = views.map(view => new THREE.Box3().setFromObject(view.root));
      for (const [i, view] of views.entries()) {
        const hull = buildingSolid(view.spec);
        for (const street of CITY_DISTRICT.streets) {
          const alongX = street.axis === "x";
          const x = alongX ? street.center : street.at, z = alongX ? street.at : street.center;
          const w = alongX ? street.length : street.width, d = alongX ? street.width : street.length;
          const road = new THREE.Box3(new THREE.Vector3(x - w / 2, -1, z - d / 2),
            new THREE.Vector3(x + w / 2, 100, z + d / 2));
          expect(bounds[i].intersectsBox(road), `${view.spec.id} blocks ${street.axis} street at ${street.at}`).toBe(false);
          if (view.spec.backdrop) {
            const walkW = w + (alongX ? 0 : street.sidewalk * 2), walkD = d + (alongX ? street.sidewalk * 2 : 0);
            const overlaps = Math.abs(hull.x - x) < (hull.w + walkW) / 2 && Math.abs(hull.z - z) < (hull.d + walkD) / 2;
            expect(overlaps, `${view.spec.id} occupies a skyline sidewalk`).toBe(false);
          }
        }
        for (let j = i + 1; j < bounds.length; j++)
          expect(bounds[i].intersectsBox(bounds[j]), `${view.spec.id} overlaps ${views[j].spec.id}`).toBe(false);
      }
    } finally {
      for (const view of views) {
        view.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
        view.materials.forEach(m => m.dispose());
      }
    }
  });

  test.each(Object.keys(BUILDING_KIT) as (keyof typeof BUILDING_KIT)[])("%s has one facade surface per opening and separated wall panels", prefab => {
    const building = makeBuilding({ ...CITY_DISTRICT.buildings[0], prefab, x: 0, z: 0, turn: 0 });
    building.root.updateMatrixWorld(true);
    const ray = new THREE.Raycaster();
    // Inspect only the near facade, excluding the opposite side of the shell.
    ray.far = 10.5;
    const front = BUILDING_KIT[prefab].d / 2;
    const sample = (x: number, y: number) => {
      ray.set(new THREE.Vector3(x, y, front + 10), new THREE.Vector3(0, 0, -1));
      return ray.intersectObject(building.root, true);
    };
    try {
      const openings = prefab === "shop" ? [[5.8, 2.3], [0.25, 1.4]]
        : prefab === "depot" ? [[7.4, 2.12], [4.1, 1.4]]
        : [[prefab === "pump" ? 3.65 : 7.4, 2.12], [0.25, 1.4]];
      for (const [i, [x, y]] of openings.entries()) {
        const panes = sample(x, y);
        expect(panes).toHaveLength(1);
        expect((panes[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex())
          .toBe(i === 0 && prefab !== "depot" ? 0x678b98 : 0x656d6b);
        expect(panes[0].point.z).toBeCloseTo(front + 0.04, 4);
      }
      const wall = sample(prefab === "pump" ? 5.15 : 9, 2.12);
      expect(wall).toHaveLength(1); expect(wall[0].point.z).toBeCloseTo(front, 4);
    } finally {
      building.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      building.materials.forEach(m => m.dispose());
    }
  });
});
