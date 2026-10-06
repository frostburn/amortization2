import { expect, test, vi } from "vitest";
import { NavigationGrid, segmentClear } from "../src/game/navigation";
import type { Vec2 } from "../src/game/config";
import { Simulation } from "../src/game/simulation";

const bounds = { left: -12, right: 12, back: -12, front: 12 };
const start = { x: -8, z: 0 }, goal = { x: 8, z: 0 };
const assertClear = (path: Vec2[], boxes: { x: number; z: number; w: number; d: number }[], radius = 0.55) => {
  expect(path.length).toBeGreaterThan(0);
  expect(path.at(-1)).toEqual(goal);
  path.forEach((p, i) => expect(segmentClear(i ? path[i - 1] : start, p, boxes, radius)).toBe(true));
};

test("reused grids respect moving props and removed targets across successive orders", () => {
  const wall = { x: 0, z: 0, w: 1.2, d: 13 }, grid = new NavigationGrid([], 0.55, bounds);
  for (let i = 0; i < 8; i++) {
    assertClear(grid.findPath(start, goal, [wall]), [wall]);
    expect(grid.findPath(start, goal, [{ ...wall, z: 9 }])).toEqual([goal]);
    expect(grid.findPath(start, goal)).toEqual([goal]);
  }
});

test("failed searches leave no stale frontier or costs in the next reachable order", () => {
  const sealed = { x: 0, z: 0, w: 2, d: 30 }, wall = { ...sealed, d: 12 };
  const grid = new NavigationGrid([], 0.7, bounds);
  expect(grid.findPath(start, goal, [sealed])).toEqual([]);
  assertClear(grid.findPath(start, goal, [wall]), [wall], 0.7);
  expect(grid.findPath(start, goal)).toEqual([goal]);
});

test("narrow diagonal gaps do not permit cutting inflated obstacle corners", () => {
  const boxes = [{ x: 0, z: -3, w: 4, d: 6 }, { x: 4, z: 3, w: 4, d: 6 }];
  assertClear(new NavigationGrid(boxes, 0.7, bounds).findPath(start, goal), boxes, 0.7);
});

test("blocked and out-of-bounds destinations resolve to safe endpoints", () => {
  const box = { x: 8, z: 0, w: 2, d: 2 }, grid = new NavigationGrid([box], 0.55, bounds);
  for (const destination of [goal, { x: 100, z: 2 }]) {
    const path = grid.findPath(start, destination);
    expect(path.length).toBeGreaterThan(0);
    path.forEach((p, i) => {
      expect(segmentClear(i ? path[i - 1] : start, p, [box])).toBe(true);
      expect(p.x).toBeLessThanOrEqual(bounds.right - 0.55);
    });
    expect(path.at(-1)).not.toEqual(destination);
  }
});

test("blocked arrival recovery retries on a timer and resumes when a loose obstacle moves", async () => {
  const sim = await Simulation.create("proving"), actor = sim.squad[0], prop = sim.props[0];
  const search = vi.spyOn(NavigationGrid.prototype, "findPath");
  try {
    actor.moveTarget = { x: actor.spawn.x + 2, z: actor.spawn.z };
    // Navigation uses the live footprint, independently of the prop's physics hull.
    prop.w = prop.d = 100;
    for (let i = 0; i < 15; i++) sim.step();
    expect(search).toHaveBeenCalledTimes(1);
    expect(actor.path).toEqual([]);
    for (let i = 0; i < 18; i++) sim.step();
    expect(search).toHaveBeenCalledTimes(2);
    prop.w = prop.d = 1;
    for (let i = 0; i < 31; i++) sim.step();
    expect(actor.path.length).toBeGreaterThan(0);
    expect(actor.body.translation().x).toBeGreaterThan(actor.spawn.x + 0.01);
  } finally { search.mockRestore(); sim.world.free(); }
});
