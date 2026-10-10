import {
  BOUNDS,
  distance2,
  type BoxSpec,
  type RangeBounds,
  type Vec2,
} from "./config";

const CELL = 0.75;

export function segmentClear(
  a: Vec2,
  b: Vec2,
  boxes: Pick<BoxSpec, "x" | "z" | "w" | "d">[],
  radius = 0.55,
) {
  return boxes.every((box) => {
    let enter = 0,
      leave = 1;
    for (const axis of ["x", "z"] as const) {
      const half = (axis === "x" ? box.w : box.d) / 2 + radius;
      const min = box[axis] - half,
        max = box[axis] + half,
        delta = b[axis] - a[axis];
      if (Math.abs(delta) < 1e-9) {
        if (a[axis] <= min || a[axis] >= max) return true;
      } else {
        const lo = (min - a[axis]) / delta,
          hi = (max - a[axis]) / delta;
        enter = Math.max(enter, Math.min(lo, hi));
        leave = Math.min(leave, Math.max(lo, hi));
        if (enter >= leave) return true;
      }
    }
    return false;
  });
}


type Obstacle = Pick<BoxSpec, "x" | "z" | "w" | "d">;

/** Binary heap: choose the next A* cell without scanning the whole frontier. */
export class Frontier {
  private ids: number[] = [];
  private scores: number[] = [];
  get length() { return this.ids.length; }
  clear() { this.ids.length = this.scores.length = 0; }
  push(id: number, score: number) {
    let i = this.ids.length;
    this.ids.push(id); this.scores.push(score);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.scores[parent] <= score) break;
      this.ids[i] = this.ids[parent]; this.scores[i] = this.scores[parent]; i = parent;
    }
    this.ids[i] = id; this.scores[i] = score;
  }
  pop() {
    const result = this.ids[0], id = this.ids.pop()!, score = this.scores.pop()!;
    if (!this.ids.length) return result;
    let i = 0;
    while (i * 2 + 1 < this.ids.length) {
      let child = i * 2 + 1;
      if (child + 1 < this.ids.length && this.scores[child + 1] < this.scores[child]) child++;
      if (this.scores[child] >= score) break;
      this.ids[i] = this.ids[child]; this.scores[i] = this.scores[child]; i = child;
    }
    this.ids[i] = id; this.scores[i] = score;
    return result;
  }
}

/** Reuse static occupancy and search storage throughout a level. Dynamic solids remain live. */
export class NavigationGrid {
  private width: number;
  private height: number;
  private base: Uint8Array;
  private blocked: Uint8Array;
  private costs: Float64Array;
  private previous: Int32Array;
  private seen: Uint32Array;
  private closed: Uint32Array;
  private generation = 0;
  private frontier = new Frontier();
  constructor(private solids: Obstacle[], private radius = 0.55, private bounds: RangeBounds = BOUNDS) {
    this.width = Math.floor((bounds.right - bounds.left) / CELL);
    this.height = Math.floor((bounds.front - bounds.back) / CELL);
    const size = this.width * this.height;
    this.base = new Uint8Array(size); this.blocked = new Uint8Array(size);
    this.costs = new Float64Array(size); this.previous = new Int32Array(size);
    this.seen = new Uint32Array(size); this.closed = new Uint32Array(size);
    for (let id = 0; id < size; id++) {
      if (!this.inBounds(this.position(id))) this.base[id] = 1;
    }
    for (const box of solids) this.rasterize(this.base, box);
  }
  private position(id: number): Vec2 {
    return { x: this.bounds.left + ((id % this.width) + 0.5) * CELL,
      z: this.bounds.back + (Math.floor(id / this.width) + 0.5) * CELL };
  }
  private inBounds(p: Vec2) {
    return p.x >= this.bounds.left + this.radius && p.x <= this.bounds.right - this.radius &&
      p.z >= this.bounds.back + this.radius && p.z <= this.bounds.front - this.radius;
  }
  private rasterize(grid: Uint8Array, box: Obstacle) {
    // Strict interior coverage matches segment clearance; visit only the rectangle's rows.
    const left = Math.max(0, Math.floor((box.x - box.w / 2 - this.radius - this.bounds.left) / CELL - 0.5) + 1);
    const right = Math.min(this.width - 1, Math.ceil((box.x + box.w / 2 + this.radius - this.bounds.left) / CELL - 0.5) - 1);
    const back = Math.max(0, Math.floor((box.z - box.d / 2 - this.radius - this.bounds.back) / CELL - 0.5) + 1);
    const front = Math.min(this.height - 1, Math.ceil((box.z + box.d / 2 + this.radius - this.bounds.back) / CELL - 0.5) - 1);
    if (left > right || back > front) return;
    for (let z = back; z <= front; z++) grid.fill(1, z * this.width + left, z * this.width + right + 1);
  }
  private nearest(p: Vec2, boxes: Obstacle[], clearance: number | null) {
    const cx = Math.max(0, Math.min(this.width - 1, Math.floor((p.x - this.bounds.left) / CELL)));
    const cz = Math.max(0, Math.min(this.height - 1, Math.floor((p.z - this.bounds.back) / CELL)));
    let result = -1, best = Infinity;
    const check = (x: number, z: number) => {
      if (x < 0 || x >= this.width || z < 0 || z >= this.height) return;
      const id = z * this.width + x;
      if (this.blocked[id]) return;
      const point = this.position(id), d = (point.x - p.x) ** 2 + (point.z - p.z) ** 2;
      if (d < best && (clearance === null || segmentClear(point, p, boxes, clearance))) { result = id; best = d; }
    };
    for (let ring = 0; ring < Math.max(this.width, this.height); ring++) {
      const left = cx - ring, right = cx + ring, back = cz - ring, front = cz + ring;
      for (let x = Math.max(0, left); x <= Math.min(this.width - 1, right); x++) {
        check(x, back); if (ring) check(x, front);
      }
      for (let z = Math.max(0, back + 1); z <= Math.min(this.height - 1, front - 1); z++) {
        check(left, z); if (ring) check(right, z);
      }
      // Unvisited points lie beyond at least one of these next rows/columns.
      const outside = Math.min(
        left > 0 ? Math.abs(p.x - (this.bounds.left + (left - 0.5) * CELL)) : Infinity,
        right < this.width - 1 ? Math.abs(this.bounds.left + (right + 1.5) * CELL - p.x) : Infinity,
        back > 0 ? Math.abs(p.z - (this.bounds.back + (back - 0.5) * CELL)) : Infinity,
        front < this.height - 1 ? Math.abs(this.bounds.back + (front + 1.5) * CELL - p.z) : Infinity);
      if (result >= 0 && best <= outside * outside) break;
    }
    return result;
  }
  findPath(start: Vec2, goal: Vec2, dynamic: Obstacle[] = []): Vec2[] {
    const boxes = dynamic.length ? [...this.solids, ...dynamic] : this.solids;
    const exactGoal = this.inBounds(goal) && boxes.every(b =>
      Math.abs(goal.x - b.x) >= b.w / 2 + this.radius || Math.abs(goal.z - b.z) >= b.d / 2 + this.radius);
    // Clear orders need neither rasterization nor a search.
    if (this.inBounds(start) && exactGoal && segmentClear(start, goal, boxes, this.radius)) return [{ ...goal }];
    const clearance = Math.min(this.radius, 0.36);
    if (boxes.some(b => Math.abs(start.x - b.x) < b.w / 2 + clearance &&
      Math.abs(start.z - b.z) < b.d / 2 + clearance)) return [];
    this.blocked.set(this.base);
    for (const box of dynamic) this.rasterize(this.blocked, box);
    const first = this.nearest(start, boxes, clearance), last = this.nearest(goal, boxes, exactGoal ? this.radius : null);
    if (first < 0 || last < 0) return [];
    this.generation = (this.generation + 1) >>> 0;
    if (!this.generation) { this.seen.fill(0); this.closed.fill(0); this.generation = 1; }
    const stamp = this.generation, lx = last % this.width, lz = Math.floor(last / this.width);
    const estimate = (id: number) => {
      const dx = Math.abs(id % this.width - lx), dz = Math.abs(Math.floor(id / this.width) - lz);
      return CELL * (Math.max(dx, dz) + (Math.SQRT2 - 1) * Math.min(dx, dz));
    };
    this.frontier.clear(); this.frontier.push(first, estimate(first));
    this.costs[first] = 0; this.seen[first] = stamp;
    while (this.frontier.length) {
      let current = this.frontier.pop();
      if (this.closed[current] === stamp) continue;
      if (current === last) {
        const path: Vec2[] = [];
        while (current !== first) { path.push(this.position(current)); current = this.previous[current]; }
        path.reverse(); path.unshift(this.position(first));
        if (exactGoal && distance2(path.at(-1)!, goal) > 0.001) path.push({ ...goal });
        const turns: Vec2[] = [];
        let anchor = start;
        for (let i = 0; i < path.length;) {
          let next = i;
          while (next + 1 < path.length && segmentClear(anchor, path[next + 1], boxes, this.radius)) next++;
          turns.push(path[next]); anchor = path[next]; i = next + 1;
        }
        return turns;
      }
      this.closed[current] = stamp;
      const x = current % this.width, z = Math.floor(current / this.width);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if ((!dx && !dz) || x + dx < 0 || x + dx >= this.width || z + dz < 0 || z + dz >= this.height) continue;
        const next = current + dz * this.width + dx;
        if (this.blocked[next] || this.closed[next] === stamp) continue;
        if (dx && dz && (this.blocked[current + dx] || this.blocked[current + dz * this.width])) continue;
        const cost = this.costs[current] + CELL * (dx && dz ? Math.SQRT2 : 1);
        if (this.seen[next] !== stamp || cost < this.costs[next]) {
          this.costs[next] = cost; this.previous[next] = current; this.seen[next] = stamp;
          this.frontier.push(next, cost + estimate(next));
        }
      }
    }
    return [];
  }
}

/** One-off queries; the simulation holds a reusable grid instead. */
export function findPath(start: Vec2, goal: Vec2, boxes: Obstacle[], radius = 0.55, bounds: RangeBounds = BOUNDS): Vec2[] {
  return new NavigationGrid(boxes, radius, bounds).findPath(start, goal);
}
