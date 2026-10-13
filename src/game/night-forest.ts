import { FOREST_GROUND } from "./forest";
import type { Vec2 } from "./config";

export const NIGHT_SITES = {
  spawn: { x: -8, z: 14 },
  clearing: { x: 12, z: -8, radius: 15 },
  receiving: { x: 37, z: 37, radius: 10 },
};
export const NIGHT_CONVOY_START = [{ x: -62, z: 37 }, { x: -74, z: 37 }];
export const NIGHT_CONVOY_END = [{ x: 45, z: 37 }, { x: 32, z: 37 }];
export const NIGHT_GROUND_WAVES = [12, 36, 60];
export const NIGHT_DRONE_WAVES = [16, 34, 52, 70];
export const NIGHT_ROLL_DELAY = 12;
export const NIGHT_FOOTHOLD_SECONDS = 55;
export const forestPoint = (p: Vec2, offset = 0) => ({ ...p, y: FOREST_GROUND.heightAt(p) + offset });
