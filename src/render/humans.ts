import * as THREE from "three";
import { batchRigid, surface } from "./primitives";

export type HumanPose = "standing" | "walking" | "crouching";
type Section = readonly [y: number, halfWidth: number, halfDepth: number, z?: number];
const down = new THREE.Vector3(0, -1, 0);

/** Elliptical cloth/anatomy sections, rather than the cast's rigid box panels. */
function loft(sections: readonly Section[], sides = 12) {
  const positions: number[] = [], indices: number[] = [];
  for (const [y, x, z, offset = 0] of sections) for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2;
    positions.push(Math.sin(angle) * x, y, Math.cos(angle) * z + offset);
  }
  for (let j = 0; j < sections.length - 1; j++) for (let i = 0; i < sides; i++) {
    const a = j * sides + i, b = j * sides + (i + 1) % sides, c = a + sides, d = b + sides;
    // Sections may run either up (torso/head) or down (limbs).
    if (sections[1][0] > sections[0][0]) indices.push(a, b, c, b, d, c);
    else indices.push(a, c, b, b, c, d);
  }
  for (const [ring, outward] of [[0, -1], [sections.length - 1, 1]]) {
    const [y, , , z = 0] = sections[ring], center = positions.length / 3;
    positions.push(0, y, z);
    for (let i = 0; i < sides; i++) {
      const a = ring * sides + i, b = ring * sides + (i + 1) % sides;
      if (outward * Math.sign(sections[1][0] - sections[0][0]) > 0) indices.push(center, a, b);
      else indices.push(center, b, a);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material) {
  const result = new THREE.Mesh(geometry, material);
  result.castShadow = result.receiveShadow = true; parent.add(result); return result;
}
function oval(parent: THREE.Object3D, x: number, y: number, z: number, scale: THREE.Vector3, material: THREE.Material) {
  const result = mesh(parent, new THREE.SphereGeometry(1, 12, 8), material);
  result.position.set(x, y, z); result.scale.copy(scale); return result;
}
function batchHuman(group: THREE.Group) {
  // The prefab batcher expects an identity root. Preserve articulated joint offsets
  // and give the untextured lofts the same attributes as Three's primitives.
  const parent = group.parent, position = group.position.clone(), rotation = group.quaternion.clone();
  group.removeFromParent(); group.position.set(0, 0, 0); group.quaternion.identity();
  group.traverse(o => { if (o instanceof THREE.Mesh) {
    if (!o.geometry.getAttribute("uv")) o.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(new Float32Array(o.geometry.getAttribute("position").count * 2), 2));
    if (o.geometry.index) { const indexed = o.geometry; o.geometry = indexed.toNonIndexed(); indexed.dispose(); }
  } });
  batchRigid(group); group.position.copy(position); group.quaternion.copy(rotation); parent?.add(group);
}
const headSections: Section[] = [
  [-.025, .041, .05, .021], [.005, .07, .075, .023], [.045, .086, .09, .012],
  [.105, .09, .102], [.16, .086, .095, -.003], [.2, .066, .079, -.002], [.219, .022, .03],
];
function headRadius(y: number) {
  const end = headSections.findIndex(s => s[0] >= y);
  const a = headSections[Math.max(0, end - 1)], b = headSections[end < 0 ? headSections.length - 1 : end];
  const t = THREE.MathUtils.clamp((y - a[0]) / Math.max(.001, b[0] - a[0]), 0, 1);
  return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t), THREE.MathUtils.lerp(a[3] ?? 0, b[3] ?? 0, t)];
}
function hairCap() {
  const sides = 20, rings = 6, positions: number[] = [], indices: number[] = [];
  for (let j = 0; j < rings; j++) for (let i = 0; i < sides; i++) {
    const angle = i / sides * Math.PI * 2, front = (Math.cos(angle) + 1) / 2;
    const hairline = .043 + .104 * Math.sqrt(front) + .004 * Math.sin(angle * 3);
    // Follow every skull section so the cap cannot cut across its widest point.
    const y = [hairline, Math.max(hairline + .001, .045), Math.max(hairline + .002, .105), .16, .2, .219][j];
    const [x, z, offset] = headRadius(y);
    positions.push(Math.sin(angle) * (x + .004), y + .003, Math.cos(angle) * (z + .004) + offset);
  }
  for (let j = 0; j < rings - 1; j++) for (let i = 0; i < sides; i++) {
    const a = j * sides + i, b = j * sides + (i + 1) % sides;
    indices.push(a, b, a + sides, b, b + sides, a + sides);
  }
  const tip = positions.length / 3; positions.push(0, .224, 0);
  for (let i = 0; i < sides; i++) indices.push(tip, (rings - 1) * sides + i, (rings - 1) * sides + (i + 1) % sides);
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
function bootSole() {
  const outline = new THREE.Shape();
  outline.moveTo(-.043, .086); outline.quadraticCurveTo(-.058, .088, -.058, .06);
  outline.lineTo(-.062, -.1); outline.quadraticCurveTo(-.065, -.18, -.025, -.18);
  outline.lineTo(.025, -.18); outline.quadraticCurveTo(.065, -.18, .062, -.1);
  outline.lineTo(.058, .06); outline.quadraticCurveTo(.058, .088, .043, .086); outline.closePath();
  const geometry = new THREE.ExtrudeGeometry(outline, { depth: .035, bevelEnabled: true, bevelThickness: .003, bevelSize: .003, bevelSegments: 1, curveSegments: 4 });
  geometry.rotateX(-Math.PI / 2); geometry.translate(0, -.099, 0); return geometry;
}

/** Original 1.74 m civilian. +Z faces forward; feet rest on Y=0. No external art assets. */
export function makeHuman() {
  const root = new THREE.Group(), torso = new THREE.Group(), head = new THREE.Group(), pelvis = new THREE.Group();
  root.name = "Maintenance worker"; root.add(torso, pelvis); head.position.set(0, .58, -.018);
  const coat = surface(0x536d7d, 0, .93), seam = surface(0x364b59), shirt = surface(0xaaa99a),
    trousers = surface(0x3f4648), skin = surface(0xb68d72, 0, .92), hair = surface(0x39342f),
    leather = surface(0x554940, 0, .94), sole = surface(0x292c2b), cuff = surface(0x465e6d);
  mesh(torso, loft([[-.005, .174, .13, .008], [.05, .172, .13, .008], [.18, .185, .125],
    [.33, .205, .132, -.007], [.43, .227, .122, -.022], [.485, .187, .098, -.025]], 16), coat);
  mesh(torso, loft([[.48, .047, .052, -.018], [.58, .05, .049, -.018]], 12), skin);
  mesh(torso, loft([[.48, .09, .08, -.018], [.515, .059, .058, -.018]], 12), shirt);
  // A folded collar and an offset pocket are enough detail to read as workwear.
  for (const side of [-1, 1]) {
    const collar = mesh(torso, new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([
      side * .042, .518, .047, side * .115, .463, .095, side * .063, .408, .124,
    ], 3)), coat);
    collar.geometry.setIndex(side < 0 ? [0, 1, 2] : [0, 2, 1]); collar.geometry.computeVertexNormals();
  }
  const zipper = mesh(torso, new THREE.PlaneGeometry(.009, .35), seam); zipper.position.set(0, .23, .131);
  const pocket = mesh(torso, new THREE.PlaneGeometry(.105, .063), cuff); pocket.position.set(-.11, .294, .117); pocket.rotation.y = -.26;
  const pocketEdge = mesh(torso, new THREE.PlaneGeometry(.107, .012), seam); pocketEdge.position.set(-.11, .327, .118); pocketEdge.rotation.y = -.26;
  // Batch only rigid clothing; the head and limbs retain independent joints.
  batchHuman(torso); torso.add(head);
  mesh(head, loft(headSections, 20), skin); mesh(head, hairCap(), hair);
  for (const side of [-1, 1]) oval(head, side * .089, .08, -.01, new THREE.Vector3(.014, .032, .019), skin);
  batchHuman(head);
  mesh(pelvis, loft([[.012, .166, .123], [-.05, .176, .129], [-.12, .152, .111]]), trousers);

  const legs = [-1, 1].map(side => {
    const upper = new THREE.Group(), lower = new THREE.Group(), foot = new THREE.Group(); root.add(upper, lower, foot);
    mesh(upper, loft([[0, .084, .096], [-.09, .091, .092], [-.23, .076, .077], [-.41, .063, .065]]), trousers);
    mesh(lower, loft([[0, .063, .065], [-.11, .068, .068], [-.28, .049, .052], [-.37, .043, .046]]), trousers);
    oval(lower, 0, -.007, 0, new THREE.Vector3(.064, .067, .066), trousers);
    mesh(foot, bootSole(), sole);
    mesh(foot, loft([[-.065, .058, .123, .046], [-.025, .061, .104, .038], [.014, .051, .064, -.004], [.045, .044, .048, -.008]]), leather);
    batchHuman(foot); return { side, upper, lower, foot };
  });
  const arms = [-1, 1].map(side => {
    const upper = new THREE.Group(), lower = new THREE.Group(), hand = new THREE.Group();
    upper.position.set(side * .222, .432, -.02); lower.position.y = -.255; hand.position.y = -.255;
    torso.add(upper); upper.add(lower); lower.add(hand);
    mesh(upper, loft([[.02, .066, .075], [-.055, .073, .071], [-.19, .059, .06], [-.255, .057, .058]]), coat);
    oval(upper, 0, -.005, 0, new THREE.Vector3(.068, .063, .074), coat);
    oval(upper, 0, -.251, 0, new THREE.Vector3(.057, .047, .058), coat);
    mesh(lower, loft([[0, .057, .058], [-.1, .06, .061], [-.21, .045, .047], [-.25, .04, .042]]), coat);
    mesh(lower, loft([[-.21, .046, .048], [-.255, .042, .044]]), cuff); batchHuman(lower); lower.add(hand);
    mesh(hand, loft([[0, .034, .027], [-.055, .039, .027, .006], [-.105, .029, .022, .007]], 10), skin);
    oval(hand, -side * .033, -.042, .023, new THREE.Vector3(.017, .039, .02), skin); batchHuman(hand);
    return { side, upper, lower };
  });
  const hip = new THREE.Vector3(), ankle = new THREE.Vector3(), direction = new THREE.Vector3(), knee = new THREE.Vector3(), bend = new THREE.Vector3();
  let currentPose: HumanPose = "standing";
  const pose = (next: HumanPose, time = 0) => {
    currentPose = next;
    const walking = next === "walking", crouching = next === "crouching", phase = time * Math.PI * 2 * .85;
    const hipY = crouching ? .62 : walking ? .91 + Math.cos(phase * 2) * .012 : .94;
    const hipZ = crouching ? -.14 : 0;
    torso.position.set(0, hipY, hipZ); pelvis.position.copy(torso.position);
    torso.rotation.x = crouching ? .25 : walking ? .045 : 0;
    for (const [i, leg] of legs.entries()) {
      const stride = walking ? Math.cos(phase + i * Math.PI) : 0;
      hip.set(leg.side * .095, hipY - .06, hipZ);
      ankle.set(leg.side * (crouching ? .13 : .095), .105 + (walking ? Math.max(0, Math.sin(phase + i * Math.PI)) * .075 : 0), crouching ? .12 : stride * .17);
      direction.copy(ankle).sub(hip); const distance = direction.length(); direction.normalize();
      const along = (.41 ** 2 - .37 ** 2 + distance ** 2) / (2 * distance);
      const height = Math.sqrt(Math.max(0, .41 ** 2 - along ** 2));
      bend.set(0, direction.z, -direction.y).normalize(); knee.copy(hip).addScaledVector(direction, along).addScaledVector(bend, height);
      leg.upper.position.copy(hip); leg.upper.quaternion.setFromUnitVectors(down, direction.copy(knee).sub(hip).normalize());
      leg.lower.position.copy(knee); leg.lower.quaternion.setFromUnitVectors(down, direction.copy(ankle).sub(knee).normalize());
      leg.foot.position.copy(ankle);
    }
    for (const [i, arm] of arms.entries()) {
      const swing = walking ? Math.cos(phase + i * Math.PI) * .32 : 0;
      arm.upper.rotation.set(crouching ? -.75 : swing - .04, 0, arm.side * .09);
      arm.lower.rotation.x = crouching ? -.55 : -.13 - Math.max(0, -swing) * .5;
    }
    root.updateMatrixWorld(true);
  };
  pose("standing");
  return { root, pose, get currentPose() { return currentPose; }, dispose() {
    const geometry = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>();
    root.traverse(o => { if (o instanceof THREE.Mesh) { geometry.add(o.geometry); materials.add(o.material as THREE.Material); } });
    geometry.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.removeFromParent();
  } };
}
