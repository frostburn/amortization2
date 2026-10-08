import type { RangeId } from "../game/ranges";

// Equal X/Y/Z offsets project the three world axes at 120 degrees.
export const TACTICAL_CAMERA_OFFSET = { x: 48, y: 48, z: 48 };
const views = {
  receiving: { halfHeight: 30, halfWidth: 46 },
  city: { halfHeight: 35, halfWidth: 53 },
  port: { halfHeight: 36, halfWidth: 55 },
  proving: { halfHeight: 24, halfWidth: 34 },
  arena: { halfHeight: 28, halfWidth: 44 },
  long: { halfHeight: 40, halfWidth: 66 },
};

export function tacticalHalfHeight(range: RangeId, aspect: number, zoom: number) {
  const view = views[range];
  return Math.max(view.halfHeight, view.halfWidth / Math.max(0.1, aspect)) / zoom;
}

/** Screen right/down to ground X/Z; WASD stays aligned with the screen. */
export function tacticalPan(right: number, down: number) {
  return { x: (right + down) * Math.SQRT1_2, z: (down - right) * Math.SQRT1_2 };
}
