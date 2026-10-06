import { describe, expect, test } from "vitest";
import { OrthographicCamera, Vector2, Vector3 } from "three";
import { TACTICAL_CAMERA_OFFSET, tacticalHalfHeight, tacticalPan } from "../src/render/tactical-camera";
import { spatialPan } from "../src/audio/spatial";
import { RANGES, type RangeId } from "../src/game/ranges";

function camera(range: RangeId = "proving", aspect = 16 / 10) {
  const half = tacticalHalfHeight(range, aspect, 1);
  const c = new OrthographicCamera(-half * aspect, half * aspect, half, -half, 0.1, 400);
  c.position.copy(TACTICAL_CAMERA_OFFSET);
  c.lookAt(0, 0, 0);
  c.updateMatrixWorld();
  return c;
}
describe("tactical isometric view", () => {
  test("the three world axes project at equal lengths and 120-degree angles", () => {
    const c = camera("proving", 1);
    const origin = new Vector3().project(c);
    const axes = [new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 0, 1)]
      .map(v => v.project(c).sub(origin))
      .map(v => new Vector2(v.x, v.y));
    for (let i = 0; i < 3; i++) {
      expect(axes[i].length()).toBeCloseTo(axes[0].length(), 8);
      expect(axes[i].dot(axes[(i + 1) % 3]) / axes[i].length() / axes[(i + 1) % 3].length()).toBeCloseTo(-0.5, 8);
    }
  });
  test("WASD follows screen axes with a rotated view", () => {
    const c = camera();
    const origin = new Vector3().project(c);
    const right = tacticalPan(1, 0), up = tacticalPan(0, -1);
    const projectedRight = new Vector3(right.x, 0, right.z).project(c).sub(origin);
    const projectedUp = new Vector3(up.x, 0, up.z).project(c).sub(origin);
    expect(projectedRight.x).toBeGreaterThan(0);
    expect(projectedRight.y).toBeCloseTo(0, 8);
    expect(projectedUp.y).toBeGreaterThan(0);
    expect(projectedUp.x).toBeCloseTo(0, 8);
  });
  test("default framing reduces robot size and preserves usable width on laptops", () => {
    for (const range of ["proving", "arena", "long"] as const) {
      const wide = tacticalHalfHeight(range, 16 / 10, 1);
      const laptop = tacticalHalfHeight(range, 4 / 3, 1);
      expect(wide).toBeGreaterThanOrEqual(24);
      expect(laptop * 4 / 3).toBeGreaterThanOrEqual(({ proving: 34, arena: 44, long: 66 })[range] - 1e-6);
      expect(tacticalHalfHeight(range, 16 / 10, 2)).toBeCloseTo(wide / 2);
    }
    expect(RANGES.proving.bounds.right - RANGES.proving.bounds.left).toBe(66);
    expect(RANGES.arena.bounds.right - RANGES.arena.bounds.left).toBe(112);
    expect(RANGES.long.bounds.right - RANGES.long.bounds.left).toBe(144);
  });
  test("audio pans across the screen and keeps the diagonal view centre balanced", () => {
    const c = camera();
    const right = { x: c.matrixWorld.elements[0], z: c.matrixWorld.elements[2] };
    expect(spatialPan({ x: 0, y: 0, z: 0 }, c.position, right)).toBeCloseTo(0, 8);
    expect(spatialPan({ x: 10, y: 0, z: -10 }, c.position, right)).toBeGreaterThan(0);
    expect(spatialPan({ x: -10, y: 0, z: 10 }, c.position, right)).toBeLessThan(0);
  });
});
