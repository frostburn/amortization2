import { clamp, type RangeBounds, type Vec2, type Vec3 } from "./config";

/** Triangulated natural ground. Physics, picking, navigation and rendering share these samples. */
export class HeightField {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly columns: number;
  readonly rows: number;
  readonly maxHeight: number;
  constructor(readonly bounds: RangeBounds, readonly cell: number, height: (x: number, z: number) => number) {
    this.columns = Math.round((bounds.right - bounds.left) / cell) + 1;
    this.rows = Math.round((bounds.front - bounds.back) / cell) + 1;
    this.vertices = new Float32Array(this.columns * this.rows * 3);
    let max = 0;
    for (let z = 0; z < this.rows; z++) for (let x = 0; x < this.columns; x++) {
      const i = (z * this.columns + x) * 3, px = bounds.left + x * cell, pz = bounds.back + z * cell;
      this.vertices.set([px, height(px, pz), pz], i); max = Math.max(max, this.vertices[i + 1]);
    }
    this.maxHeight = max;
    const indices: number[] = [];
    for (let z = 0; z < this.rows - 1; z++) for (let x = 0; x < this.columns - 1; x++) {
      const a = z * this.columns + x, b = a + 1, c = a + this.columns, d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
    this.indices = new Uint32Array(indices);
  }
  heightAt(p: Vec2) {
    const gx = clamp((p.x - this.bounds.left) / this.cell, 0, this.columns - 1.000001);
    const gz = clamp((p.z - this.bounds.back) / this.cell, 0, this.rows - 1.000001);
    const x = Math.floor(gx), z = Math.floor(gz), u = gx - x, v = gz - z, a = z * this.columns + x;
    const h = (i: number) => this.vertices[i * 3 + 1];
    // Interpolate within the rendered triangles, rather than a bilinear surface above/below them.
    return u + v <= 1 ? h(a) + (h(a + 1) - h(a)) * u + (h(a + this.columns) - h(a)) * v
      : h(a + this.columns + 1) + (h(a + this.columns) - h(a + this.columns + 1)) * (1 - u)
        + (h(a + 1) - h(a + this.columns + 1)) * (1 - v);
  }
  pick(origin: Vec3, direction: Vec3): Vec3 | null {
    let enter = 0, leave = Infinity;
    for (const [axis, min, max] of [["x", this.bounds.left, this.bounds.right], ["y", 0, this.maxHeight + .01],
      ["z", this.bounds.back, this.bounds.front]] as const) {
      if (Math.abs(direction[axis]) < 1e-10) { if (origin[axis] < min || origin[axis] > max) return null; }
      else {
        const a = (min - origin[axis]) / direction[axis], b = (max - origin[axis]) / direction[axis];
        enter = Math.max(enter, Math.min(a, b)); leave = Math.min(leave, Math.max(a, b));
      }
    }
    if (enter > leave || !Number.isFinite(leave)) return null;
    const point = (t: number) => ({ x: origin.x + direction.x * t, y: origin.y + direction.y * t, z: origin.z + direction.z * t });
    const gap = (t: number) => { const p = point(t); return p.y - this.heightAt(p); };
    const step = Math.min(4, this.cell / Math.max(.01, Math.abs(direction.x) + Math.abs(direction.z)) / 2);
    let previous = enter;
    for (let t = enter; t <= leave + step; t += step) {
      const end = Math.min(t, leave);
      if (gap(end) <= 0) {
        let lo = previous, hi = end;
        for (let i = 0; i < 20; i++) { const mid = (lo + hi) / 2; if (gap(mid) > 0) lo = mid; else hi = mid; }
        return point(hi);
      }
      previous = end;
    }
    return null;
  }
}
