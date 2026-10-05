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

/** Small range navigation grid. Inflated solids and corner checks keep robot hulls clear. */
export function findPath(
  start: Vec2,
  goal: Vec2,
  boxes: Pick<BoxSpec, "x" | "z" | "w" | "d">[],
  radius = 0.55,
  bounds: RangeBounds = BOUNDS,
): Vec2[] {
  const WIDTH = Math.floor((bounds.right - bounds.left) / CELL);
  const HEIGHT = Math.floor((bounds.front - bounds.back) / CELL);
  const position = (id: number): Vec2 => ({
    x: bounds.left + ((id % WIDTH) + 0.5) * CELL,
    z: bounds.back + (Math.floor(id / WIDTH) + 0.5) * CELL,
  });
  const blocked = new Uint8Array(WIDTH * HEIGHT);
  for (let id = 0; id < blocked.length; id++) {
    const p = position(id);
    if (
      p.x < bounds.left + radius ||
      p.x > bounds.right - radius ||
      p.z < bounds.back + radius ||
      p.z > bounds.front - radius ||
      boxes.some(
        (b) =>
          Math.abs(p.x - b.x) < b.w / 2 + radius &&
          Math.abs(p.z - b.z) < b.d / 2 + radius,
      )
    )
      blocked[id] = 1;
  }
  const exactGoal =
    goal.x >= bounds.left + radius &&
    goal.x <= bounds.right - radius &&
    goal.z >= bounds.back + radius &&
    goal.z <= bounds.front - radius &&
    boxes.every(
      (b) =>
        Math.abs(goal.x - b.x) >= b.w / 2 + radius ||
        Math.abs(goal.z - b.z) >= b.d / 2 + radius,
    );
  if (exactGoal && segmentClear(start, goal, boxes, radius))
    return [{ ...goal }];
  const nearest = (p: Vec2, clearance: number | null = radius) => {
    let result = -1,
      best = Infinity;
    for (let id = 0; id < blocked.length; id++)
      if (!blocked[id]) {
        const d = distance2(position(id), p);
        if (
          d < best &&
          (clearance === null ||
            segmentClear(position(id), p, boxes, clearance))
        ) {
          best = d;
          result = id;
        }
      }
    return result;
  };
  const first = nearest(start, Math.min(radius, 0.36)),
    last = nearest(goal, exactGoal ? radius : null);
  if (first < 0 || last < 0) return [];
  const open = new Set([first]);
  const closed = new Set<number>();
  const costs = new Float64Array(WIDTH * HEIGHT).fill(Infinity);
  const previous = new Int32Array(WIDTH * HEIGHT).fill(-1);
  costs[first] = 0;
  while (open.size) {
    let current = -1,
      best = Infinity;
    for (const id of open) {
      const score = costs[id] + distance2(position(id), position(last));
      if (score < best) {
        best = score;
        current = id;
      }
    }
    if (current === last) {
      const path: Vec2[] = [];
      while (current !== first) {
        path.push(position(current));
        current = previous[current];
      }
      path.reverse();
      path.unshift(position(first));
      if (exactGoal && (!path.length || distance2(path.at(-1)!, goal) > 0.001))
        path.push({ ...goal });
      // Keep only visible turns, so following the route does not require visiting grid centres.
      const turns: Vec2[] = [];
      let anchor = start;
      for (let i = 0; i < path.length; ) {
        let next = i;
        while (
          next + 1 < path.length &&
          segmentClear(anchor, path[next + 1], boxes, radius)
        )
          next++;
        turns.push(path[next]);
        anchor = path[next];
        i = next + 1;
      }
      return turns;
    }
    open.delete(current);
    closed.add(current);
    const x = current % WIDTH,
      z = Math.floor(current / WIDTH);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (
          (!dx && !dz) ||
          x + dx < 0 ||
          x + dx >= WIDTH ||
          z + dz < 0 ||
          z + dz >= HEIGHT
        )
          continue;
        const next = current + dz * WIDTH + dx;
        if (blocked[next] || closed.has(next)) continue;
        if (
          dx &&
          dz &&
          (blocked[current + dx] || blocked[current + dz * WIDTH])
        )
          continue;
        const cost = costs[current] + CELL * Math.hypot(dx, dz);
        if (cost < costs[next]) {
          costs[next] = cost;
          previous[next] = current;
          open.add(next);
        }
      }
  }
  return [];
}
