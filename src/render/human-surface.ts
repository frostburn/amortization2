import * as THREE from "three";

export type Weights = readonly (readonly [bone: number, weight: number])[];
export type Ring = number[];
export type CrossSection = readonly [y: number, width: number, depth: number, z?: number];
export const circle = (count: number) => Array.from({ length: count }, (_, i) => i * Math.PI * 2 / count);

/** Indexed garment surfaces. Branches reuse their opening's vertices: there are
 * no intersecting shoulder caps, elbow spheres or separate thumb primitives. */
export class HumanSurface {
  positions: number[] = [];
  private skinIndices: number[] = [];
  private skinWeights: number[] = [];
  private faces: { indices: number[]; material: number }[] = [];
  private parts: Record<string, { start: number; end: number }> = {};
  private part?: string;
  vertex(point: THREE.Vector3, weights: Weights) {
    const id = this.positions.length / 3;
    this.positions.push(point.x, point.y, point.z);
    const total = weights.reduce((sum, [, weight]) => sum + weight, 0);
    for (let i = 0; i < 4; i++) {
      this.skinIndices.push(weights[i]?.[0] ?? 0); this.skinWeights.push((weights[i]?.[1] ?? 0) / total);
    }
    return id;
  }
  point(id: number) { return new THREE.Vector3().fromArray(this.positions, id * 3); }
  begin(name: string) {
    if (this.part) this.parts[this.part].end = this.positions.length / 3;
    this.part = name; this.parts[name] = { start: this.positions.length / 3, end: 0 };
  }
  triangle(a: number, b: number, c: number, material: number) { this.faces.push({ indices: [a, b, c], material }); }
  join(a: Ring, b: Ring, material: number | ((i: number) => number), reverse = false, skip?: (i: number) => boolean) {
    for (let i = 0; i < a.length; i++) {
      if (skip?.(i)) continue;
      const j = (i + 1) % a.length, mat = typeof material === "number" ? material : material(i);
      if (reverse) { this.triangle(a[i], b[i], a[j], mat); this.triangle(a[j], b[i], b[j], mat); }
      else { this.triangle(a[i], a[j], b[i], mat); this.triangle(a[j], b[j], b[i], mat); }
    }
  }
  cap(ring: Ring, center: THREE.Vector3, weights: Weights, material: number, reverse = false) {
    const tip = this.vertex(center, weights);
    for (let i = 0; i < ring.length; i++) {
      const j = (i + 1) % ring.length;
      this.triangle(tip, reverse ? ring[j] : ring[i], reverse ? ring[i] : ring[j], material);
    }
  }
  ellipse(section: CrossSection, angles: number[], weights: (point: THREE.Vector3) => Weights, x = 0,
    shape?: (point: THREE.Vector3, angle: number) => void, transform?: THREE.Matrix4) {
    const [y, width, depth, z = 0] = section;
    return angles.map(angle => {
      const point = new THREE.Vector3(x + Math.sin(angle) * width, y, z + Math.cos(angle) * depth);
      shape?.(point, angle); if (transform) point.applyMatrix4(transform);
      return this.vertex(point, weights(point));
    });
  }
  /** A rectangular opening in a loft, ordered around the outward branch axis. */
  opening(rows: Ring[], low: number, high: number, first: number, last: number, center: THREE.Vector3, outward: THREE.Vector3) {
    const boundary: Ring = [];
    for (let i = first; i <= last; i++) boundary.push(rows[low][i]);
    for (let j = low + 1; j < high; j++) boundary.push(rows[j][last]);
    for (let i = last; i >= first; i--) boundary.push(rows[high][i]);
    for (let j = high - 1; j > low; j--) boundary.push(rows[j][first]);
    const front = new THREE.Vector3(0, 0, 1), around = outward.clone().cross(front);
    boundary.sort((a, b) => {
      const angle = (id: number) => { const p = this.point(id).sub(center); return Math.atan2(p.dot(around), p.dot(front)); };
      return angle(a) - angle(b);
    });
    return boundary;
  }
  /** Bend a branch from its sewn opening into a sleeve or thumb. */
  branch(opening: Ring, sections: { center: THREE.Vector3; radius: number; depth?: number }[],
    weights: (point: THREE.Vector3, row: number) => Weights, material: number | ((row: number) => number)) {
    const origin = sections[0].center, initial = sections[1].center.clone().sub(origin).normalize();
    const front = new THREE.Vector3(0, 0, 1).addScaledVector(initial, -initial.z).normalize();
    const around = initial.clone().cross(front).normalize();
    const angles = opening.map(id => { const p = this.point(id).sub(origin); return Math.atan2(p.dot(around), p.dot(front)); });
    // Unwrap the boundary once, before relaxing it to evenly spaced rings.
    for (let i = 1; i < angles.length; i++) while (angles[i] < angles[i - 1]) angles[i] += Math.PI * 2;
    let previous = opening;
    for (let row = 1; row < sections.length; row++) {
      const section = sections[row], before = sections[Math.max(0, row - 1)].center, after = sections[Math.min(sections.length - 1, row + 1)].center;
      const tangent = after.clone().sub(before).normalize();
      const forward = front.clone().addScaledVector(tangent, -front.dot(tangent)).normalize();
      const radial = tangent.clone().cross(forward).normalize();
      const ring = angles.map((angle, i) => {
        const t = Math.min(1, row / 3), theta = THREE.MathUtils.lerp(angle, angles[0] + i * Math.PI * 2 / angles.length, t);
        const p = section.center.clone().addScaledVector(forward, Math.cos(theta) * (section.depth ?? section.radius)).addScaledVector(radial, Math.sin(theta) * section.radius);
        return this.vertex(p, weights(p, row));
      });
      this.join(previous, ring, typeof material === "number" ? material : material(row)); previous = ring;
    }
    return previous;
  }
  append(geometry: THREE.BufferGeometry, transform: THREE.Matrix4, weights: Weights, material: number) {
    const start = this.positions.length / 3, positions = geometry.getAttribute("position"), p = new THREE.Vector3();
    for (let i = 0; i < positions.count; i++) this.vertex(p.fromBufferAttribute(positions, i).applyMatrix4(transform), weights);
    const index = geometry.index;
    for (let i = 0; i < (index?.count ?? positions.count); i += 3) {
      this.triangle(start + (index?.getX(i) ?? i), start + (index?.getX(i + 1) ?? i + 1), start + (index?.getX(i + 2) ?? i + 2), material);
    }
    geometry.dispose();
  }
  finish() {
    if (this.part) this.parts[this.part].end = this.positions.length / 3;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(this.skinIndices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(this.skinWeights, 4));
    const indices: number[] = [];
    for (const material of [...new Set(this.faces.map(f => f.material))].sort((a, b) => a - b)) {
      const start = indices.length;
      for (const face of this.faces) if (face.material === material) indices.push(...face.indices);
      geometry.addGroup(start, indices.length - start, material);
    }
    geometry.setIndex(indices); geometry.computeVertexNormals(); geometry.userData.parts = this.parts;
    return geometry;
  }
}
