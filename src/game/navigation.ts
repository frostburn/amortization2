import { BOUNDS, distance2, type BoxSpec, type Vec2 } from "./config";

const CELL = 0.75;
const WIDTH = Math.floor((BOUNDS.right - BOUNDS.left) / CELL);
const HEIGHT = Math.floor((BOUNDS.front - BOUNDS.back) / CELL);
const position = (id: number): Vec2 => ({
  x: BOUNDS.left + ((id % WIDTH) + 0.5) * CELL,
  z: BOUNDS.back + (Math.floor(id / WIDTH) + 0.5) * CELL,
});

function segmentClear(
  a: Vec2,
  b: Vec2,
  boxes: Pick<BoxSpec, "x" | "z" | "w" | "d">[],
  radius: number,
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
): Vec2[] {
  const blocked = new Uint8Array(WIDTH * HEIGHT);
  for (let id = 0; id < blocked.length; id++) {
    const p = position(id);
    if (
      p.x < BOUNDS.left + radius ||
      p.x > BOUNDS.right - radius ||
      p.z < BOUNDS.back + radius ||
      p.z > BOUNDS.front - radius ||
      boxes.some(
        (b) =>
          Math.abs(p.x - b.x) < b.w / 2 + radius &&
          Math.abs(p.z - b.z) < b.d / 2 + radius,
      )
    )
      blocked[id] = 1;
  }
  const exactGoal =
    goal.x >= BOUNDS.left + radius &&
    goal.x <= BOUNDS.right - radius &&
    goal.z >= BOUNDS.back + radius &&
    goal.z <= BOUNDS.front - radius &&
    boxes.every(
      (b) =>
        Math.abs(goal.x - b.x) >= b.w / 2 + radius ||
        Math.abs(goal.z - b.z) >= b.d / 2 + radius,
    );
  const nearest = (p: Vec2, visible = false) => {
    let result = -1,
      best = Infinity;
    for (let id = 0; id < blocked.length; id++)
      if (!blocked[id]) {
        const d = distance2(position(id), p);
        if (
          d < best &&
          (!visible || segmentClear(position(id), p, boxes, radius))
        ) {
          best = d;
          result = id;
        }
      }
    return result;
  };
  const first = nearest(start),
    last = nearest(goal, exactGoal);
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
      if (exactGoal && (!path.length || distance2(path.at(-1)!, goal) > 0.001))
        path.push({ ...goal });
      return path;
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
