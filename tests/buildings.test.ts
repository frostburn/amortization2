import { describe, expect, test } from "vitest";
import * as THREE from "three";
import { BUILDING_KIT, CITY_DISTRICT } from "../src/game/city";
import { makeBuilding } from "../src/render/city";

describe("building facades", () => {
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
      for (const [x, y] of prefab === "shop" ? [[5.8, 2.3], [0.25, 1.4]] : [[7.4, 2.12], [0.25, 1.4]]) {
        const panes = sample(x, y);
        expect(panes).toHaveLength(1);
        expect((panes[0].object as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>).material.color.getHex()).toBe(0x354c52);
        expect(panes[0].point.z).toBeCloseTo(front + 0.04, 4);
      }
      const wall = sample(9, 2.12);
      expect(wall).toHaveLength(1); expect(wall[0].point.z).toBeCloseTo(front, 4);
    } finally {
      building.root.traverse(o => { if (o instanceof THREE.Mesh) o.geometry.dispose(); });
      building.materials.forEach(m => m.dispose());
    }
  });
});
