import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export const surface = (color: number, metalness = 0, roughness = 0.85) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });

export function block(parent: THREE.Object3D, w: number, h: number, d: number,
  x: number, y: number, z: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
export function panel(parent: THREE.Object3D, w: number, h: number,
  x: number, y: number, z: number, material: THREE.Material) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}
export function tube(parent: THREE.Object3D, r: number, h: number,
  x: number, y: number, z: number, material: THREE.Material, sides = 10) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, sides), material);
  mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true;
  parent.add(mesh); return mesh;
}

/** Bake a prefab's rigid geometry by material, before placing or rotating its root. */
export function batchRigid(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  const originals = new Set<THREE.BufferGeometry>();
  group.traverse(o => {
    if (!(o instanceof THREE.Mesh) || Array.isArray(o.material)) return;
    const geometries = batches.get(o.material) ?? [];
    geometries.push(o.geometry.clone().applyMatrix4(o.matrixWorld));
    originals.add(o.geometry); batches.set(o.material, geometries);
  });
  group.clear();
  for (const [mat, geometries] of batches) {
    const geometry = mergeGeometries(geometries)!;
    geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, mat);
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    geometries.forEach(g => g.dispose());
  }
  originals.forEach(g => g.dispose());
}
