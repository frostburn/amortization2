import * as THREE from "three";
import { surface } from "./primitives";
import { HumanSurface, circle, type CrossSection, type Ring, type Weights } from "./human-surface";

export type HumanPose = "standing" | "walking" | "crouching";
const down = new THREE.Vector3(0, -1, 0), front = new THREE.Vector3(0, 0, 1);
const blend = (a: number, b: number, t: number): Weights => [[a, 1 - t], [b, t]];
const smooth = (value: number, low: number, high: number) => THREE.MathUtils.smoothstep(value, low, high);
const mat = { coat: 0, trim: 1, trousers: 2, skin: 3, hair: 4, leather: 5, sole: 6, lining: 7 };
const headSections: CrossSection[] = [
  [1.455, .043, .041, -.018], [1.485, .044, .041, -.018], [1.505, .041, .050, .003],
  [1.525, .070, .075, .005], [1.565, .086, .090, -.006], [1.625, .090, .102, -.018],
  [1.680, .086, .095, -.021], [1.720, .066, .079, -.020], [1.739, .022, .030, -.018],
];

/** One indexed skin, with connected jacket/sleeves, trousers/legs, hands/thumbs
 * and enclosed boots. A shared 16-bone skeleton deforms the garment vertices. */
export function makeHuman() {
  const root = new THREE.Group(); root.name = "Maintenance worker";
  const bones: THREE.Bone[] = [];
  const bone = (name: string, parent: THREE.Object3D, x: number, y: number, z = 0) => {
    const value = new THREE.Bone(); value.name = name; value.position.set(x, y, z); parent.add(value); bones.push(value); return value;
  };
  const hips = bone("hips", root, 0, .94), spine = bone("spine", hips, 0, .10), chest = bone("chest", spine, 0, .25),
    head = bone("head", chest, 0, .23, -.018);
  const arms = [-1, 1].map(side => {
    const upper = bone(`${side < 0 ? "left" : "right"} shoulder`, chest, side * .238, .08, -.012);
    upper.rotation.z = side * .13;
    const lower = bone(`${side < 0 ? "left" : "right"} elbow`, upper, 0, -.26);
    const hand = bone(`${side < 0 ? "left" : "right"} wrist`, lower, 0, -.255);
    return { side, upper, lower, hand };
  });
  const legs = [-1, 1].map(side => {
    const upper = bone(`${side < 0 ? "left" : "right"} hip`, hips, side * .095, -.06);
    const lower = bone(`${side < 0 ? "left" : "right"} knee`, upper, 0, -.41);
    const foot = bone(`${side < 0 ? "left" : "right"} ankle`, lower, 0, -.365);
    return { side, upper, lower, foot };
  });
  root.updateMatrixWorld(true);
  const id = (value: THREE.Bone) => bones.indexOf(value), hipId = id(hips), spineId = id(spine), chestId = id(chest), headId = id(head);
  const torsoWeights = (p: THREE.Vector3): Weights => {
    const middle = smooth(p.y, .94, 1.16), upper = smooth(p.y, 1.15, 1.34);
    return [[hipId, 1 - middle], [spineId, middle * (1 - upper)], [chestId, middle * upper]];
  };
  const neckWeights = (p: THREE.Vector3) => blend(chestId, headId, smooth(p.y, 1.48, 1.565));
  const builder = new HumanSurface();
  const seam = .019;
  const bodyAngles = [...circle(24), seam, Math.PI * 2 - seam].sort((a, b) => a - b);
  const bodySections: CrossSection[] = [
    [.828, .195, .157, -.012], [.854, .193, .153, -.012], [.970, .192, .151, -.012],
    [1.110, .194, .142, -.009], [1.220, .207, .135, -.011], [1.270, .212, .130, -.012],
    [1.305, .219, .126, -.014], [1.355, .219, .118, -.016], [1.405, .187, .101, -.018],
    [1.428, .130, .082, -.018], [1.452, .078, .064, -.018], [1.478, .066, .056, -.018],
    [1.474, .057, .048, -.018], [1.457, .055, .046, -.018],
    [1.473, .052, .047, -.018], [1.487, .052, .048, -.018],
  ];
  const holeLow = 5, holeHigh = 8;
  const holes = arms.map(arm => {
    const angle = arm.side > 0 ? Math.PI / 2 : Math.PI * 1.5;
    return { first: bodyAngles.findIndex(a => Math.abs(a - (angle - Math.PI / 4)) < 1e-6),
      last: bodyAngles.findIndex(a => Math.abs(a - (angle + Math.PI / 4)) < 1e-6) };
  });
  builder.begin("jacket");
  const rows = bodySections.map((section, row) => builder.ellipse(section, bodyAngles, torsoWeights, 0, (p, angle) => {
    if (row >= 9) p.y -= Math.max(0, Math.cos(angle)) ** 3 * (row >= 14 ? .009 : .048);
    else {
      // A small amount of hanging ease; the hem and pocket are part of the surface.
      p.z += Math.cos(angle) * .002 * Math.sin(p.y * 42 + Math.sin(angle) * 3);
      if (p.x < -.058 && p.x > -.15 && p.z > 0 && p.y >= 1.22 && p.y <= 1.27) p.z += .003;
    }
  }));
  for (let row = 0; row < rows.length - 1; row++) {
    builder.join(rows[row], rows[row + 1], i => {
      if (row >= 13) return mat.lining;
      if (row === 11 || row === 12) return mat.trim;
      const angle = bodyAngles[i];
      if (row < 9 && (angle < seam || angle >= Math.PI * 2 - seam)) return mat.trim;
      return mat.coat;
    }, false, i => row >= holeLow && row < holeHigh && holes.some(h => i >= h.first && i < h.last));
  }
  const hem = builder.ellipse([.833, .188, .150, -.012], bodyAngles, torsoWeights);
  builder.join(hem, rows[0], mat.trim);
  for (const [i, arm] of arms.entries()) {
    const center = new THREE.Vector3(arm.side * .212, 1.3375, -.016), outward = new THREE.Vector3(arm.side, 0, 0);
    const opening = builder.opening(rows, holeLow, holeHigh, holes[i].first, holes[i].last, center, outward);
    const upperId = id(arm.upper), lowerId = id(arm.lower);
    const armPoint = (distance: number, ease = 0) => new THREE.Vector3(arm.side * ease, -distance, 0).applyMatrix4(arm.upper.matrixWorld);
    const sections = [
      { center, radius: .065 },
      { center: new THREE.Vector3(arm.side * .245, 1.340, -.012), radius: .060 },
      { center: new THREE.Vector3(arm.side * .267, 1.338, -.012), radius: .069 },
      ...[[.08, .018, .071], [.14, .012, .068], [.20, .006, .065], [.235, .006, .066],
        [.26, .006, .065], [.285, .006, .062], [.32, .006, .061], [.39, .004, .055],
        [.47, .001, .048], [.485, .001, .046], [.506, 0, .045], [.509, 0, .041]].map(([distance, ease, radius]) => ({ center: armPoint(distance, ease), radius, depth: radius * .97 })),
    ];
    builder.branch(opening, sections, (p, row) => {
      if (row <= 2) return blend(chestId, upperId, row / 3);
      const local = p.clone().applyMatrix4(arm.upper.matrixWorld.clone().invert());
      return blend(upperId, lowerId, smooth(-local.y, .195, .325));
    }, row => row >= sections.length - 3 ? mat.trim : mat.coat);
  }

  // The crotch is sewn to both leg openings. They share an inner seam instead
  // of hiding disconnected thighs behind an overlapping pelvis primitive.
  builder.begin("trousers");
  const legAngles = circle(12), shared: Record<string, number> = {};
  const legWeights = (leg: typeof legs[number], p: THREE.Vector3): Weights => {
    const upper = smooth(.90 - p.y, 0, .14), lower = smooth(.55 - p.y, 0, .135), ankle = smooth(.40 - p.y, 0, .17);
    // The cuff follows the planted boot, with a soft transition up the shin.
    // Otherwise a bent knee pulls the trouser opening through the boot shaft.
    return [[hipId, 1 - upper], [id(leg.upper), upper * (1 - lower)],
      [id(leg.lower), upper * lower * (1 - ankle)], [id(leg.foot), upper * lower * ankle]];
  };
  const starts = legs.map(leg => legAngles.map((angle, i) => {
    const inner = leg.side < 0 ? i >= 2 && i <= 4 : i >= 8 && i <= 10;
    const p = new THREE.Vector3(leg.side * .095 + Math.sin(angle) * .085, .795, Math.cos(angle) * .102 - .006);
    if (inner) {
      const key = Math.cos(angle) > .25 ? "front" : Math.cos(angle) < -.25 ? "back" : "middle";
      if (shared[key] !== undefined) return shared[key];
      p.x = 0; p.y = key === "middle" ? .779 : .795; p.z = key === "front" ? .048 : key === "back" ? -.054 : -.003;
      return shared[key] = builder.vertex(p, [[hipId, .6], [id(legs[0].upper), .2], [id(legs[1].upper), .2]]);
    }
    return builder.vertex(p, legWeights(leg, p));
  }));
  const [left, right] = starts;
  const boundary = [left[2], left[1], left[0], ...[11, 10, 9, 8, 7, 6, 5, 4].map(i => left[i]),
    ...[7, 6, 5, 4, 3, 2, 1, 0, 11].map(i => right[i])];
  const pelvisAngles = boundary.map(v => { const p = builder.point(v); return Math.atan2(p.x / .18, (p.z + .01) / .135); });
  const pelvisRows = [[.963, .166, .117, -.01], [.914, .180, .135, -.018], [.859, .177, .133, -.013]] as const;
  let previous = builder.ellipse(pelvisRows[0], pelvisAngles, () => [[hipId, 1]]);
  for (const section of pelvisRows.slice(1)) {
    const ring = builder.ellipse(section, pelvisAngles, () => [[hipId, 1]]); builder.join(previous, ring, mat.trousers); previous = ring;
  }
  builder.join(previous, boundary, mat.trousers);
  for (const [i, leg] of legs.entries()) {
    let previous = starts[i];
    const sections: CrossSection[] = [[.760, .088, .102], [.680, .087, .097], [.580, .081, .088],
      [.520, .076, .082, .004], [.490, .075, .079, .006], [.465, .077, .080, .007],
      [.439, .071, .076, .006], [.412, .074, .079, .004], [.370, .068, .073],
      [.345, .063, .070], [.320, .061, .067], [.290, .059, .066], [.260, .059, .067, -.003],
      [.233, .060, .070, -.007], [.211, .061, .072, -.010], [.216, .055, .066, -.009]];
    for (const section of sections) {
      const ring = builder.ellipse(section, legAngles, p => legWeights(leg, p), leg.side * .095, (p, angle) => {
        p.z += Math.cos(angle * 3) * .0015 * Math.sin(p.y * 54);
      });
      builder.join(previous, ring, mat.trousers, true); previous = ring;
    }
  }

  for (const arm of arms) {
    builder.begin(arm.side < 0 ? "left hand" : "right hand");
    const handId = id(arm.hand), angles = circle(12), transform = arm.hand.matrixWorld;
    const sections: CrossSection[] = [[.014, .028, .023], [-.014, .032, .025], [-.035, .036, .025, .002],
      [-.060, .037, .026, .006], [-.083, .034, .024, .008], [-.107, .025, .018, .009], [-.116, .013, .012, .009]];
    const rows = sections.map(s => builder.ellipse(s, angles, () => [[handId, 1]], 0, undefined, transform));
    const medial = -arm.side, first = medial > 0 ? 2 : 8, last = first + 2;
    for (let row = 0; row < rows.length - 1; row++) builder.join(rows[row], rows[row + 1], mat.skin, true,
      i => row >= 1 && row < 3 && i >= first && i < last);
    builder.cap(rows[0], new THREE.Vector3(0, .016, 0).applyMatrix4(transform), [[handId, 1]], mat.skin);
    builder.cap(rows.at(-1)!, new THREE.Vector3(0, -.119, .009).applyMatrix4(transform), [[handId, 1]], mat.skin, true);
    const center = new THREE.Vector3(medial * .032, -.037, .002).applyMatrix4(transform);
    const outward = new THREE.Vector3(medial, 0, 0).transformDirection(transform);
    const opening = builder.opening(rows, 1, 3, first, last, center, outward);
    const thumb = [[medial * .032, -.037, .002, .017], [medial * .048, -.039, .004, .017],
      [medial * .058, -.057, .026, .015], [medial * .055, -.083, .037, .013], [medial * .047, -.100, .035, .008]];
    const ring = builder.branch(opening, thumb.map(([x, y, z, radius]) => ({ center: new THREE.Vector3(x, y, z).applyMatrix4(transform), radius })),
      () => [[handId, 1]], mat.skin);
    builder.cap(ring, new THREE.Vector3(medial * .042, -.106, .030).applyMatrix4(transform), [[handId, 1]], mat.skin);
  }

  for (const leg of legs) {
    builder.begin(leg.side < 0 ? "left boot" : "right boot");
    const footId = id(leg.foot), angles = circle(20), transform = leg.foot.matrixWorld;
    const sections: CrossSection[] = [[-.105, .057, .138, .043], [-.098, .062, .143, .043], [-.071, .064, .144, .043],
      [-.059, .065, .143, .043], [-.033, .063, .137, .043], [-.006, .059, .124, .036],
      [.022, .052, .086, .013], [.059, .049, .058, -.008], [.109, .048, .052, -.012], [.119, .047, .051, -.012]];
    const rows = sections.map(s => builder.ellipse(s, angles, () => [[footId, 1]], 0, (p, angle) => {
      // A broad closed toe box and straighter sole sides, rather than a thin foot pad.
      if (p.y < -.02) p.x = Math.sign(Math.sin(angle)) * Math.abs(Math.sin(angle)) ** .72 * s[1];
    }, transform));
    for (let row = 0; row < rows.length - 1; row++) builder.join(rows[row], rows[row + 1], row < 3 ? mat.sole : mat.leather);
    builder.cap(rows[0], new THREE.Vector3(0, -.105, .043).applyMatrix4(transform), [[footId, 1]], mat.sole, true);
    builder.cap(rows.at(-1)!, new THREE.Vector3(0, .119, -.012).applyMatrix4(transform), [[footId, 1]], mat.leather);
  }

  builder.begin("head");
  let headRing: Ring | undefined;
  for (const section of headSections) {
    const ring = builder.ellipse(section, circle(20), neckWeights);
    if (headRing) builder.join(headRing, ring, mat.skin); headRing = ring;
  }
  builder.cap(headRing!, new THREE.Vector3(0, 1.740, -.018), [[headId, 1]], mat.skin);
  for (const side of [-1, 1]) {
    const transform = new THREE.Matrix4().compose(new THREE.Vector3(side * .089, 1.600, -.028), new THREE.Quaternion(), new THREE.Vector3(.014, .030, .019));
    builder.append(new THREE.SphereGeometry(1, 10, 6), transform, [[headId, 1]], mat.skin);
  }
  builder.begin("hair");
  const hairAngles = circle(20), hairRows: Ring[] = [];
  const radiusAt = (y: number) => {
    const end = headSections.findIndex(s => s[0] >= y), a = headSections[Math.max(0, end - 1)], b = headSections[end < 0 ? headSections.length - 1 : end];
    const t = THREE.MathUtils.clamp((y - a[0]) / Math.max(.001, b[0] - a[0]), 0, 1);
    return [THREE.MathUtils.lerp(a[1], b[1], t), THREE.MathUtils.lerp(a[2], b[2], t), THREE.MathUtils.lerp(a[3] ?? 0, b[3] ?? 0, t)];
  };
  for (let row = 0; row < 6; row++) hairRows.push(hairAngles.map(angle => {
    const hairline = 1.563 + .104 * Math.sqrt((Math.cos(angle) + 1) / 2) + .004 * Math.sin(angle * 3);
    const y = [hairline, Math.max(hairline + .001, 1.565), Math.max(hairline + .002, 1.625), 1.680, 1.720, 1.739][row];
    const [x, z, offset] = radiusAt(y);
    return builder.vertex(new THREE.Vector3(Math.sin(angle) * (x + .004), y + .003, Math.cos(angle) * (z + .004) + offset), [[headId, 1]]);
  }));
  for (let row = 0; row < hairRows.length - 1; row++) builder.join(hairRows[row], hairRows[row + 1], mat.hair);
  builder.cap(hairRows.at(-1)!, new THREE.Vector3(0, 1.744, -.018), [[headId, 1]], mat.hair);

  const geometry = builder.finish(), materials = [surface(0x536d7d, 0, .95), surface(0x455b69, 0, .97),
    surface(0x42494b, 0, .97), surface(0xb68d72, 0, .92), surface(0x39342f),
    surface(0x55463a, 0, .9), surface(0x292c2b), surface(0xaaa99a)];
  const mesh = new THREE.SkinnedMesh(geometry, materials), skeleton = new THREE.Skeleton(bones);
  mesh.name = "Worker skin"; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); root.updateMatrixWorld(true); mesh.bind(skeleton);
  const hip = new THREE.Vector3(), ankle = new THREE.Vector3(), direction = new THREE.Vector3(), knee = new THREE.Vector3(), bend = new THREE.Vector3();
  const lowerRotation = new THREE.Quaternion(), planted = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  let currentPose: HumanPose = "standing";
  const pose = (next: HumanPose, time = 0) => {
    currentPose = next;
    const walking = next === "walking", crouching = next === "crouching", phase = time * Math.PI * 2 * .85;
    const hipY = crouching ? .62 : walking ? .91 + Math.cos(phase * 2) * .012 : .94, hipZ = crouching ? -.14 : 0;
    hips.position.set(0, hipY, hipZ); spine.rotation.x = crouching ? .12 : walking ? .022 : 0;
    chest.rotation.x = crouching ? .11 : walking ? .02 : 0; head.rotation.x = crouching ? -.12 : 0;
    for (const [i, leg] of legs.entries()) {
      const stride = walking ? Math.cos(phase + i * Math.PI) : 0, lift = walking ? Math.max(0, Math.sin(phase + i * Math.PI)) : 0;
      hip.set(leg.side * .095, hipY - .06, hipZ); ankle.set(leg.side * (crouching ? .13 : .095), .105 + lift * .075, crouching ? .12 : stride * .17);
      direction.copy(ankle).sub(hip); const distance = direction.length(); direction.normalize();
      const along = (.41 ** 2 - .365 ** 2 + distance ** 2) / (2 * distance), height = Math.sqrt(Math.max(0, .41 ** 2 - along ** 2));
      bend.copy(front).addScaledVector(direction, -front.dot(direction)).normalize();
      knee.copy(hip).addScaledVector(direction, along).addScaledVector(bend, height);
      leg.upper.quaternion.setFromUnitVectors(down, direction.copy(knee).sub(hip).normalize());
      lowerRotation.setFromUnitVectors(down, direction.copy(ankle).sub(knee).normalize());
      leg.lower.quaternion.copy(leg.upper.quaternion).invert().multiply(lowerRotation);
      planted.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -lift * .12);
      leg.foot.quaternion.copy(inverse.copy(lowerRotation).invert()).multiply(planted);
    }
    for (const [i, arm] of arms.entries()) {
      const swing = walking ? Math.cos(phase + i * Math.PI) * .28 : 0;
      arm.upper.rotation.set(crouching ? -.70 : swing, 0, arm.side * .13);
      arm.lower.rotation.x = crouching ? -.43 : -.10 - Math.max(0, -swing) * .45;
      arm.hand.rotation.x = crouching ? -.08 : .025;
    }
    root.updateMatrixWorld(true); skeleton.update(); mesh.computeBoundingBox(); mesh.computeBoundingSphere();
  };
  pose("standing");
  return { root, mesh, skeleton, pose, get currentPose() { return currentPose; }, dispose() {
    geometry.dispose(); materials.forEach(m => m.dispose()); skeleton.dispose(); root.removeFromParent();
  } };
}
