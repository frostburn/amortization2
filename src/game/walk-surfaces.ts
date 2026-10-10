import { distance2, type BoxSpec, type RangeBounds, type Vec2, type Vec3 } from "./config";
import { Frontier } from "./navigation";

/** Rectangular walking plane. Slopes are rise/metre along the world axes. */
export type WalkSurface = Vec2 & { id: string; w: number; d: number; height: number;
  slopeX?: number; slopeZ?: number; thickness: number; filled?: boolean };
export const surfaceHeight = (s: WalkSurface, p: Vec2) => s.height +
  (p.x - s.x) * (s.slopeX ?? 0) + (p.z - s.z) * (s.slopeZ ?? 0);
const contains = (s: { x: number; z: number; w: number; d: number }, p: Vec2, margin = 0) =>
  Math.abs(p.x - s.x) <= s.w / 2 + margin && Math.abs(p.z - s.z) <= s.d / 2 + margin;
type Obstacle = Pick<BoxSpec, "x" | "z" | "w" | "d"> & { y?: number; h?: number };

/** The exact same closed prism supplies rendering and physical collision. */
export function surfacePrism(s: WalkSurface) {
  const vertices: number[] = [];
  for (const bottom of [false, true]) for (const [x, z] of [
    [s.x - s.w / 2, s.z - s.d / 2], [s.x + s.w / 2, s.z - s.d / 2],
    [s.x + s.w / 2, s.z + s.d / 2], [s.x - s.w / 2, s.z + s.d / 2],
  ]) {
    const top = surfaceHeight(s, { x, z });
    vertices.push(x, bottom ? s.filled ? -0.12 : top - s.thickness : top, z);
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array([
    0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7,
    0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5,
    2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7,
  ]) };
}

/** A point can have both a street floor and an overhead pedestrian deck. */
export class WalkTerrain {
  private hulls: WalkSurface[];
  constructor(readonly surfaces: WalkSurface[], readonly volumes: WalkSurface[],
    readonly boxes: Obstacle[], readonly bounds: RangeBounds) { this.hulls = [...surfaces, ...volumes]; }
  heights(p: Vec2) {
    const heights = [0];
    for (const s of this.surfaces) if (contains(s, p, 0.001)) {
      const y = surfaceHeight(s, p);
      if (!heights.some(h => Math.abs(y - h) < 0.02)) heights.push(y);
    }
    return heights;
  }
  resolve(p: Vec2): Vec3 {
    const heights = this.heights(p);
    const y = p.y === undefined ? Math.max(...heights)
      : heights.reduce((best, h) => Math.abs(h - p.y!) < Math.abs(best - p.y!) ? h : best);
    return { x: p.x, y, z: p.z };
  }
  private blocked(p: Vec3, boxes: Obstacle[], radius: number) {
    return boxes.some(b => contains(b, p, radius - 0.0001) &&
      p.y + 1.86 > (b.y ?? 0) + 0.02 && p.y < (b.y ?? 0) + (b.h ?? 2) - 0.02);
  }
  obstaclesClear(p: Vec3, dynamic: Obstacle[], radius = 0.55) { return !this.blocked(p, dynamic, radius); }
  obstacleSegmentClear(a: Vec3, b: Vec3, boxes: Obstacle[], radius = 0.55) {
    return boxes.every(box => {
      let enter = 0, leave = 1;
      for (const axis of ["x", "y", "z"] as const) {
        const min = axis === "y" ? (box.y ?? 0) - 1.86 : box[axis] - (axis === "x" ? box.w : box.d) / 2 - radius;
        const max = axis === "y" ? (box.y ?? 0) + (box.h ?? 2) : box[axis] + (axis === "x" ? box.w : box.d) / 2 + radius;
        const delta = b[axis] - a[axis];
        if (Math.abs(delta) < 1e-8) { if (a[axis] <= min || a[axis] >= max) return true; }
        else {
          const lo = (min - a[axis]) / delta, hi = (max - a[axis]) / delta;
          enter = Math.max(enter, Math.min(lo, hi)); leave = Math.min(leave, Math.max(lo, hi));
          if (enter >= leave) return true;
        }
      }
      return false;
    });
  }
  canStand(p: Vec3, radius = 0.55, dynamic: Obstacle[] = []) {
    const b = this.bounds;
    if (p.x < b.left + radius || p.x > b.right - radius ||
        p.z < b.back + radius || p.z > b.front - radius ||
        this.blocked(p, this.boxes, radius) || this.blocked(p, dynamic, radius)) return false;
    // Footprint support across adjoining pieces keeps internal seams open,
    // but prevents pathfinding around an unguarded edge or up a retaining wall.
    for (const [dx, dz] of [[0, 0], [-radius, -radius], [radius, -radius],
      [radius, radius], [-radius, radius]]) {
      const q = { x: p.x + dx, z: p.z + dz };
      if (!this.heights(q).some(y => Math.abs(y - p.y) <= Math.hypot(dx, dz) * 0.3 + 0.025 &&
        this.hulls.every(s => {
          if (!contains(s, q, -0.001)) return true;
          const top = surfaceHeight(s, q), bottom = s.filled ? -0.12 : top - s.thickness;
          return y >= top - 0.03 || y + 1.86 <= bottom + 0.03;
        }))) return false;
    }
    return true;
  }
  segmentClear(a: Vec2, b: Vec2, radius = 0.55, dynamic: Obstacle[] = []) {
    let height = a.y ?? this.resolve(a).y;
    const count = Math.max(1, Math.ceil(distance2(a, b) / 0.25));
    const step = distance2(a, b) / count;
    for (let i = 1; i <= count; i++) {
      const q = { x: a.x + (b.x - a.x) * i / count, z: a.z + (b.z - a.z) * i / count };
      const heights = this.heights(q).filter(y => Math.abs(y - height) <= step * 0.3 + 0.025 &&
        this.canStand({ ...q, y }, radius, dynamic));
      if (!heights.length) return false;
      height = heights.reduce((best, y) => Math.abs(y - height) < Math.abs(best - height) ? y : best);
    }
    return b.y === undefined || Math.abs(height - b.y) < 0.05;
  }
  /** Pick only walking planes, independently of robots, railings and roofs. */
  pick(origin: Vec3, direction: Vec3) {
    let t = -origin.y / direction.y;
    let result = { x: origin.x + direction.x * t, y: 0, z: origin.z + direction.z * t };
    for (const s of this.surfaces) {
      const sx = s.slopeX ?? 0, sz = s.slopeZ ?? 0;
      const divisor = direction.y - sx * direction.x - sz * direction.z;
      if (Math.abs(divisor) < 1e-8) continue;
      const hit = (s.height + sx * (origin.x - s.x) + sz * (origin.z - s.z) - origin.y) / divisor;
      const p = { x: origin.x + direction.x * hit, y: origin.y + direction.y * hit, z: origin.z + direction.z * hit };
      if (hit > 0 && hit < t && contains(s, p)) { t = hit; result = p; }
    }
    return result;
  }
}

const CELL = 0.75;
/** Cached layered A*: ground and overhead nodes share XY cells, not connectivity. */
export class SurfaceNavigation {
  private width: number;
  private height: number;
  private cells: number[][];
  private nodes: Vec3[] = [];
  private links: (number[] | undefined)[] = [];
  private blocked: Uint8Array;
  private costs: Float64Array;
  private previous: Int32Array;
  private seen: Uint32Array;
  private closed: Uint32Array;
  private generation = 0;
  private frontier = new Frontier();
  private routes: { start: Vec3; goal: Vec3; path: Vec3[] }[] = [];
  constructor(readonly terrain: WalkTerrain, private radius = 0.55) {
    const b = terrain.bounds;
    this.width = Math.floor((b.right - b.left) / CELL);
    this.height = Math.floor((b.front - b.back) / CELL);
    this.cells = Array.from({ length: this.width * this.height }, () => []);
    for (let z = 0; z < this.height; z++) for (let x = 0; x < this.width; x++) {
      const p = { x: b.left + (x + 0.5) * CELL, z: b.back + (z + 0.5) * CELL };
      for (const y of terrain.heights(p)) if (terrain.canStand({ ...p, y }, radius)) {
        this.cells[z * this.width + x].push(this.nodes.length);
        this.nodes.push({ ...p, y });
      }
    }
    const n = this.nodes.length;
    this.blocked = new Uint8Array(n); this.costs = new Float64Array(n);
    this.previous = new Int32Array(n); this.seen = new Uint32Array(n); this.closed = new Uint32Array(n);
  }
  private cell(p: Vec2) {
    const b = this.terrain.bounds;
    return { x: Math.max(0, Math.min(this.width - 1, Math.floor((p.x - b.left) / CELL))),
      z: Math.max(0, Math.min(this.height - 1, Math.floor((p.z - b.back) / CELL))) };
  }
  private neighbours(id: number) {
    if (this.links[id]) return this.links[id]!;
    const p = this.nodes[id], c = this.cell(p), result: number[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const x = c.x + dx, z = c.z + dz;
      if ((!dx && !dz) || x < 0 || x >= this.width || z < 0 || z >= this.height) continue;
      for (const next of this.cells[z * this.width + x]) {
        const q = this.nodes[next], rise = Math.hypot(dx, dz) * CELL * 0.3 + 0.025;
        if (Math.abs(p.y - q.y) > rise) continue;
        // Both nodes already have full footprint support. A diagonal also
        // needs its cardinal cells; this prevents inflated-corner cutting.
        if (dx && dz && [this.cells[c.z * this.width + x], this.cells[z * this.width + c.x]].some(cell =>
          !cell.some(id => Math.abs(this.nodes[id].y - p.y) <= rise && Math.abs(this.nodes[id].y - q.y) <= rise))) continue;
        const middle = { x: (p.x + q.x) / 2, z: (p.z + q.z) / 2 };
        if (Math.abs(p.y - q.y) > .001) {
          // At ramp mouths, endpoint/midpoint support alone can miss a corner
          // of a retaining wall. Keep the full continuous check for slopes.
          if (this.terrain.segmentClear(p, q, this.radius)) result.push(next);
        } else if (this.terrain.heights(middle).some(y => Math.abs(y - p.y) < .025 &&
            this.terrain.canStand({ ...middle, y }, this.radius))) result.push(next);
      }
    }
    return this.links[id] = result;
  }
  private nearest(p: Vec3, dynamic: Obstacle[], connect: boolean) {
    const c = this.cell(p), b = this.terrain.bounds;
    let best = Infinity, result = -1;
    const check = (x: number, z: number) => {
      if (x < 0 || x >= this.width || z < 0 || z >= this.height) return;
      for (const id of this.cells[z * this.width + x]) {
        if (this.blocked[id]) continue;
        const q = this.nodes[id], cost = distance2(p, q) ** 2 + (p.y - q.y) ** 2 * 4;
        if (cost < best && Math.abs(p.y - q.y) < 1 && (!connect ||
            this.terrain.segmentClear(p, q, Math.min(this.radius, 0.36), dynamic))) { result = id; best = cost; }
      }
    };
    for (let ring = 0; ring < Math.max(this.width, this.height); ring++) {
      const left = c.x - ring, right = c.x + ring, back = c.z - ring, front = c.z + ring;
      for (let x = Math.max(0, left); x <= Math.min(this.width - 1, right); x++) { check(x, back); if (ring) check(x, front); }
      for (let z = Math.max(0, back + 1); z <= Math.min(this.height - 1, front - 1); z++) { check(left, z); if (ring) check(right, z); }
      const outside = Math.min(left > 0 ? Math.abs(p.x - (b.left + (left - 0.5) * CELL)) : Infinity,
        right < this.width - 1 ? Math.abs(b.left + (right + 1.5) * CELL - p.x) : Infinity,
        back > 0 ? Math.abs(p.z - (b.back + (back - 0.5) * CELL)) : Infinity,
        front < this.height - 1 ? Math.abs(b.back + (front + 1.5) * CELL - p.z) : Infinity);
      if (result >= 0 && best <= outside ** 2) break;
    }
    return result;
  }
  findPath(start: Vec2, goal: Vec2, dynamic: Obstacle[] = []): Vec2[] {
    const a = this.terrain.resolve(start), b = this.terrain.resolve(goal);
    const exact = this.terrain.canStand(b, this.radius, dynamic);
    if (exact && this.terrain.segmentClear(a, b, this.radius, dynamic)) return [b];
    // Nearby squad slots can reuse a verified corridor instead of searching
    // its whole fringe four times. Every shifted leg is checked against live
    // obstacles, support and elevation; stale/blocked corridors are rejected.
    if (exact) for (const route of this.routes) {
      if (distance2(a, route.start) > 3.3 || distance2(b, route.goal) > 3.3 ||
          Math.abs(a.y - route.start.y) > .7 || Math.abs(b.y - route.goal.y) > .7) continue;
      const length = route.path.reduce((n, p, i) => n + distance2(i ? route.path[i - 1] : route.start, p), 0);
      let travelled = 0, previous = route.start;
      const path = route.path.map(p => {
        travelled += distance2(previous, p); previous = p;
        const t = Math.min(1, travelled / (length || 1));
        return this.terrain.resolve({ x: p.x + (a.x - route.start.x) * (1 - t) + (b.x - route.goal.x) * t,
          z: p.z + (a.z - route.start.z) * (1 - t) + (b.z - route.goal.z) * t, y: p.y });
      });
      path[path.length - 1] = b;
      if (path.every((p, i) => this.terrain.segmentClear(i ? path[i - 1] : a, p, this.radius, dynamic))) return path;
      // A shifted corner can leave a narrow mouth. Share the original safe
      // turn instead; local yielding handles the transit, then reforms at b.
      const shared = [...route.path.slice(0, -1).map(p => ({ ...p })), b];
      if (shared.every((p, i) => this.terrain.segmentClear(i ? shared[i - 1] : a, p, this.radius, dynamic))) return shared;
    }
    this.blocked.fill(0);
    if (dynamic.length) for (let i = 0; i < this.nodes.length; i++)
      if (!this.terrain.obstaclesClear(this.nodes[i], dynamic, this.radius)) this.blocked[i] = 1;
    const first = this.nearest(a, dynamic, true), last = this.nearest(b, dynamic, exact);
    if (first < 0 || last < 0) return [];
    this.generation = (this.generation + 1) >>> 0;
    if (!this.generation) { this.seen.fill(0); this.closed.fill(0); this.generation = 1; }
    const stamp = this.generation;
    const estimate = (id: number) => Math.hypot(this.nodes[id].x - this.nodes[last].x,
      this.nodes[id].y - this.nodes[last].y, this.nodes[id].z - this.nodes[last].z);
    this.frontier.clear(); this.frontier.push(first, estimate(first));
    this.costs[first] = 0; this.seen[first] = stamp;
    while (this.frontier.length) {
      let current = this.frontier.pop();
      if (this.closed[current] === stamp) continue;
      if (current === last) {
        const path: Vec3[] = [];
        while (current !== first) { path.push(this.nodes[current]); current = this.previous[current]; }
        path.reverse(); path.unshift(this.nodes[first]);
        if (exact) path.push(b);
        const turns: Vec3[] = []; let anchor = a;
        for (let i = 0; i < path.length;) {
          let next = i;
          while (next + 1 < path.length && this.terrain.segmentClear(anchor, path[next + 1], this.radius, dynamic)) next++;
          turns.push({ ...path[next] }); anchor = path[next]; i = next + 1;
        }
        this.routes.unshift({ start: a, goal: b, path: turns }); this.routes.length = Math.min(this.routes.length, 8);
        return turns;
      }
      this.closed[current] = stamp;
      for (const next of this.neighbours(current)) {
        if (this.blocked[next] || this.closed[next] === stamp || dynamic.length &&
            !this.terrain.obstacleSegmentClear(this.nodes[current], this.nodes[next], dynamic, this.radius)) continue;
        const cost = this.costs[current] + Math.hypot(this.nodes[current].x - this.nodes[next].x,
          this.nodes[current].y - this.nodes[next].y, this.nodes[current].z - this.nodes[next].z);
        if (this.seen[next] !== stamp || cost < this.costs[next]) {
          this.costs[next] = cost; this.previous[next] = current; this.seen[next] = stamp;
          this.frontier.push(next, cost + estimate(next));
        }
      }
    }
    return [];
  }
}
