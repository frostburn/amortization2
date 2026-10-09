import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { Actor } from "../game/simulation";
import { makeWatch } from "./security";

export type ActorPalette = Record<"metal" | "dark" | "silver" | "yellow" | "shell" | "sniperShell" | "minigunShell" | "orange" | "pale" | "glow" | "targetPaint", THREE.Material>;
let defaultPalette: ActorPalette | undefined;
function palette() {
  const metal = (color: number, metalness = 0, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, metalness, roughness });
  return defaultPalette ??= { metal: metal(0x38464a, .55, .6), dark: metal(0x1e2729, .45, .7),
    silver: metal(0x7e8885, .65, .4), yellow: metal(0xd3a24f, .1, .7), shell: metal(0x557d78, .4, .55),
    sniperShell: metal(0x97aaa0, .5, .45), minigunShell: metal(0x9b8753, .5, .5),
    orange: metal(0xad5431, .25, .7), pale: metal(0xc8c5ae, .1, .8),
    glow: new THREE.MeshBasicMaterial({color: 0x9be6cd}), targetPaint: new THREE.MeshBasicMaterial({color: 0xefd3a0}) };
}
const unitBox = new THREE.BoxGeometry(1, 1, 1), unitCylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
function box(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(unitBox, mat); mesh.scale.set(w, h, d); mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function cylinder(parent: THREE.Object3D, radius: number, length: number, x: number, y: number, z: number, mat: THREE.Material) {
  const mesh = new THREE.Mesh(unitCylinder, mat); mesh.scale.set(radius, length, radius); mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
function batchJoint(group: THREE.Group) {
  const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
  for (const child of [...group.children]) {
    if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) continue;
    child.updateMatrix(); const list = batches.get(child.material) ?? [];
    list.push(child.geometry.clone().applyMatrix4(child.matrix)); batches.set(child.material, list);
    if (child.geometry !== unitBox && child.geometry !== unitCylinder) child.geometry.dispose();
    group.remove(child);
  }
  for (const [mat, list] of batches) {
    const geometry = mergeGeometries(list)!; geometry.userData.owned = true;
    const mesh = new THREE.Mesh(geometry, mat); mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
    list.forEach(g => g.dispose());
  }
}

/** The exact articulated models used in combat, independent of HUD and physics. */
export function makeActorBody(a: Pick<Actor, "kind" | "model" | "flight" | "weapons">, colors = palette()) {
  const { metal, dark, silver, yellow, shell, sniperShell, minigunShell, orange, pale, glow, targetPaint } = colors;
  const root = new THREE.Group(),
    model = new THREE.Group(),
    torso = new THREE.Group();
  root.add(model);
  model.position.y = -0.96;
  const legs: THREE.Group[] = [];
  const friend = a.kind === "player";
  const sniper = a.model === "sniper";
  const minigunner = a.model === "minigunner";
  const bodyMat = friend ? sniper ? sniperShell : minigunner ? minigunShell : shell : orange;
  let bipod: THREE.Group | undefined;
  let primaryGun: THREE.Group | undefined, pistol: THREE.Group | undefined;
  let arms: THREE.Group | undefined, carryArms: THREE.Group | undefined;
  let barrels: THREE.Group | undefined;
  let rotors: THREE.Group[] | undefined, beacon: THREE.Mesh | undefined;
  if (sniper) model.scale.x = 0.74;
  if (a.flight) ({ rotors, beacon } = makeWatch(model, torso, a.flight.contract));
  else if (a.model || a.kind === "heavy") {
    for (const x of [-0.24, 0.24]) {
      const leg = new THREE.Group();
      leg.position.set(x, 0.8, 0);
      model.add(leg);
      legs.push(leg);
      box(leg, 0.25, 0.36, 0.28, 0, -0.18, 0, bodyMat);
      box(leg, 0.2, 0.34, 0.23, 0, -0.52, 0, dark);
      box(leg, 0.31, 0.17, 0.52, 0, -0.71, 0.09, metal);
      const knee = cylinder(leg, 0.14, 0.28, 0, -0.37, 0.04, silver);
      knee.rotation.z = Math.PI / 2;
      box(leg, 0.17, 0.18, 0.045, 0, -0.5, 0.14, bodyMat);
    }
    box(model, 0.63, 0.27, 0.4, 0, 0.83, 0, dark);
    torso.position.y = 1.05;
    model.add(torso);
    box(torso, 0.74, 0.55, 0.44, 0, 0.24, 0, bodyMat);
    box(torso, 0.54, 0.2, 0.08, 0, 0.35, 0.25, pale);
    box(torso, 0.4, 0.42, 0.23, 0, 0.24, -0.3, dark);
    if (minigunner) {
      box(torso, 0.95, 0.23, 0.52, 0, 0.45, 0, bodyMat);
      const pack = cylinder(torso, 0.32, 0.7, 0, 0.22, -0.47, metal);
      pack.rotation.z = Math.PI / 2;
      for (let i = 0; i < 5; i++) box(torso, 0.1, 0.12, 0.1, 0.48, 0.14 + i * 0.08, -0.2 + i * 0.1, yellow);
    }
    box(torso, 0.42, 0.3, 0.35, 0, 0.7, 0.02, bodyMat);
    box(torso, 0.34, 0.065, 0.03, 0, 0.73, 0.207, friend ? glow : pale);
    arms = new THREE.Group(); torso.add(arms);
    for (const sign of [-1, 1]) {
      const shoulder = box(
        arms,
        0.27,
        0.25,
        0.4,
        sign * 0.5,
        0.39,
        0,
        bodyMat,
      );
      shoulder.rotation.z = sign * 0.16;
      box(arms, 0.18, 0.35, 0.2, sign * 0.53, 0.14, 0.12, dark);
      box(arms, 0.2, 0.19, 0.35, sign * 0.48, 0.02, 0.32, bodyMat);
    }
    batchJoint(arms);
    if (friend) {
      carryArms = new THREE.Group(); torso.add(carryArms);
      for (const side of [-1, 1]) {
        box(carryArms, 0.22, 0.26, 0.3, side * 0.5, 0.32, 0, bodyMat);
        const upper = box(carryArms, 0.17, 0.38, 0.18, side * 0.5, 0.12, 0.13, dark);
        upper.rotation.x = -0.65;
        box(carryArms, 0.18, 0.16, 0.44, side * 0.42, -0.07, 0.43, bodyMat);
        box(carryArms, 0.18, 0.14, 0.15, side * 0.36, -0.07, 0.7, metal);
      }
      batchJoint(carryArms); carryArms.visible = false;
    }
    if (a.model) {
      primaryGun = new THREE.Group();
      torso.add(primaryGun);
      box(
        primaryGun,
        sniper ? 0.16 : 0.22,
        sniper ? 0.17 : 0.2,
        sniper ? 0.72 : 0.63,
        0.28,
        0.3,
        sniper ? 0.61 : 0.47,
        dark,
      );
      const barrel = cylinder(
        primaryGun,
        sniper ? 0.043 : 0.052,
        sniper ? 0.85 : 0.4,
        0.28,
        0.3,
        sniper ? 1.28 : 0.66,
        silver,
      );
      barrel.rotation.x = Math.PI / 2;
      if (minigunner) {
        primaryGun.remove(barrel);
        const housing = cylinder(primaryGun, 0.19, 0.36, 0.28, 0.3, 0.48, metal);
        housing.rotation.x = Math.PI / 2;
        barrels = new THREE.Group();
        barrels.position.set(0.28, 0.3, 0.83);
        primaryGun.add(barrels);
        for (let i = 0; i < 6; i++) {
          const angle = i * Math.PI / 3;
          const tube = cylinder(barrels, 0.035, 0.7, Math.cos(angle) * 0.11, Math.sin(angle) * 0.11, 0, silver);
          tube.rotation.x = Math.PI / 2;
        }
        for (const z of [-0.23, 0.27]) {
          const collar = cylinder(barrels, 0.155, 0.07, 0, 0, z, dark);
          collar.rotation.x = Math.PI / 2;
        }
        batchJoint(barrels);
        box(primaryGun, 0.2, 0.13, 0.2, 0.28, 0.51, 0.42, yellow);
      } else if (sniper) {
        box(primaryGun, 0.12, 0.28, 0.2, 0.28, 0.11, 0.56, metal);
        const optic = cylinder(primaryGun, 0.085, 0.36, 0.28, 0.49, 0.6, dark);
        optic.rotation.x = Math.PI / 2;
        const lens = cylinder(primaryGun, 0.065, 0.02, 0.28, 0.49, 0.79, friend ? glow : targetPaint);
        lens.rotation.x = Math.PI / 2;
        bipod = new THREE.Group();
        for (const sign of [-1, 1]) {
          const leg = cylinder(
            bipod,
            0.025,
            0.38,
            0.28 + sign * 0.12,
            0.06,
            1.04,
            silver,
          );
          leg.rotation.z = sign * 0.5;
        }
        primaryGun.add(bipod);
        batchJoint(bipod);
      } else {
        box(primaryGun, 0.3, 0.27, 0.26, 0.38, 0.17, 0.38, metal);
        box(primaryGun, 0.09, 0.12, 0.13, 0.28, 0.47, 0.61, dark);
      }
      batchJoint(primaryGun);
      if (a.weapons.includes("pistol")) {
        pistol = new THREE.Group();
        torso.add(pistol);
        box(pistol, 0.16, 0.15, 0.35, 0.28, 0.3, 0.46, dark);
        box(pistol, 0.12, 0.23, 0.13, 0.28, 0.14, 0.35, metal);
        const tip = cylinder(pistol, 0.027, 0.12, 0.28, 0.3, 0.6, silver);
        tip.rotation.x = Math.PI / 2;
        batchJoint(pistol);
      }
      cylinder(torso, 0.013, 0.44, -0.25, 0.87, -0.2, dark);
    }
  } else {
    box(model, 1.15, 0.15, 0.8, 0, 0.075, 0, metal);
    box(model, 0.13, 0.58, 0.16, 0, 0.43, 0, silver);
    torso.position.y = 0.92;
    model.add(torso);
    box(torso, 0.8, 0.9, 0.23, 0, 0.18, 0, orange);
    box(torso, 0.4, 0.35, 0.2, 0, 0.8, 0, orange);
    for (const x of [-0.49, 0.49])
      box(torso, 0.18, 0.45, 0.17, x, 0.22, 0, orange);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.16, 0.18, 24),
      targetPaint,
    );
    ring.position.set(0, 0.28, 0.124);
    torso.add(ring);
    box(torso, 0.04, 0.38, 0.012, 0, 0.28, 0.13, dark);
    box(torso, 0.38, 0.04, 0.012, 0, 0.28, 0.13, dark);
  }
  // Keep animated joints separate; batch rigid pieces by material within each joint.
  for (const part of [torso, ...legs, model]) batchJoint(part);
  return { root, model, torso, legs, bipod, primaryGun, pistol, arms, carryArms, barrels, rotors, beacon };
}
