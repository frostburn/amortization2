import * as THREE from "three";
import { block, tube } from "./primitives";

const shell = new THREE.MeshStandardMaterial({ color: 0x3d484d, metalness: .45, roughness: .55 });
const guard = new THREE.MeshStandardMaterial({ color: 0x1f292d, metalness: .4, roughness: .6 });
const stripe = new THREE.MeshStandardMaterial({ color: 0xd39b42, roughness: .7 });
const enemyShell = new THREE.MeshStandardMaterial({ color: 0xad5431, metalness: .25, roughness: .7 });
const enemyStripe = new THREE.MeshStandardMaterial({ color: 0xef9a64, roughness: .7 });
const lens = new THREE.MeshBasicMaterial({ color: 0xef7461 });
function owned(mesh: THREE.Mesh) { mesh.geometry.userData.owned = true; return mesh; }

/** WATCH: guarded inspection quadrotor, sensor nose and a small belly gun. */
export function makeWatch(model: THREE.Group, gimbal: THREE.Group, contract = false) {
  const body = contract ? enemyShell : shell, trim = contract ? enemyStripe : stripe;
  model.position.y = 0;
  block(model, .76, .28, .64, 0, .02, 0, body);
  block(model, .58, .035, .44, 0, .18, 0, trim);
  block(model, .22, .13, .055, 0, .025, .35, guard);
  const eye = owned(new THREE.Mesh(new THREE.SphereGeometry(.075, 8, 6), lens));
  eye.position.set(0, .025, .39); eye.scale.set(1, 1, .35); model.add(eye);
  const rotors: THREE.Group[] = [];
  for (const x of [-.76, .76]) for (const z of [-.66, .66]) {
    const arm = block(model, .11, .075, Math.hypot(x, z), x / 2, .025, z / 2, body);
    arm.rotation.y = Math.atan2(x, z);
    const hoop = owned(new THREE.Mesh(new THREE.TorusGeometry(.41, .045, 5, 20), guard));
    hoop.rotation.x = Math.PI / 2; hoop.position.set(x, .13, z); model.add(hoop);
    tube(model, .09, .14, x, .08, z, body, 10);
    const rotor = new THREE.Group(); rotor.position.set(x, .145, z); model.add(rotor);
    owned(block(rotor, .73, .018, .055, 0, 0, 0, guard));
    owned(block(rotor, .055, .018, .73, 0, 0, 0, guard)); rotors.push(rotor);
  }
  for (const x of [-.32, .32]) {
    block(model, .055, .24, .055, x, -.21, -.16, guard);
    block(model, .075, .045, .65, x, -.35, 0, guard);
  }
  gimbal.position.set(0, -.28, 0); model.add(gimbal);
  const pivot = owned(new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), body)); gimbal.add(pivot);
  block(gimbal, .11, .12, .42, 0, -.025, .26, guard);
  const barrel = tube(gimbal, .055, .23, 0, 0, .5, body, 8); barrel.rotation.x = Math.PI / 2;
  const beacon = owned(new THREE.Mesh(new THREE.SphereGeometry(.085, 8, 6), lens));
  beacon.position.set(0, .265, -.1);
  const lamp = new THREE.Group(); lamp.add(beacon); model.add(lamp);
  return { rotors, beacon };
}
