import { distance2, type Vec2 } from "./config";
import { ARENA_ENTRIES, type RangeId } from "./ranges";
import type { Simulation } from "./simulation";
import { segmentClear } from "./navigation";

export type ArenaEntry = Vec2 & { name: string; dx: number; dz: number };
// Dry street/yard approaches rather than the visual rectangle's edges (which
// may be buildings or sea). The long range has entries inside its perimeter.
const APPROACHES: Record<RangeId, readonly Vec2[]> = {
  arena: ARENA_ENTRIES,
  proving: [{ x: 0, z: -23 }, { x: 29, z: 0 }, { x: 0, z: 17 }, { x: -29, z: 0 }],
  long: [{ x: 112, z: 8 }, { x: 85, z: -10 }, { x: 50, z: 10 }, { x: 20, z: -10 }],
  receiving: [{ x: 0, z: -12 }, { x: 36, z: 0 }, { x: 8, z: 25 }, { x: -36, z: -10 }],
  crossing: [{ x: -29, z: -12 }, { x: 28, z: -10 }, { x: 28, z: 13 }, { x: -29, z: 13 }],
  handling: [{ x: 0, z: -18 }, { x: 38, z: 18 }, { x: 0, z: 23 }, { x: -38, z: -8 }],
  escort: [{ x: -22, z: -28 }, { x: 43, z: 18 }, { x: 4, z: 24 }, { x: -43, z: 18 }],
  priority: [{ x: 0, z: -48 }, { x: 78, z: 28 }, { x: 0, z: 48 }, { x: -78, z: 28 }],
  recovery: [{ x: -62, z: -24 }, { x: 78, z: -24 }, { x: 72, z: 18 }, { x: -83, z: 23 }],
  city: [{ x: 0, z: -48 }, { x: 108, z: 10 }, { x: 0, z: 78 }, { x: -96, z: 10 }],
  concourse: [{ x: 0, z: -46 }, { x: 48, z: 0 }, { x: 0, z: 36 }, { x: -48, z: 0 }],
  port: [{ x: 0, z: -58 }, { x: 35, z: 0 }, { x: 0, z: 58 }, { x: -85, z: 0 }],
};

const ENTRY_NAMES: Partial<Record<RangeId, string[]>> = {
  long: ["FAR END", "EAST BAY", "MID RANGE", "NEAR BAY"],
  crossing: ["WEST NORTH", "EAST NORTH", "EAST SOUTH", "WEST SOUTH"],
};

export function arenaEntries(sim: Simulation): ArenaEntry[] {
  if (sim.range === "arena") return ARENA_ENTRIES.map(g => ({ ...g }));
  const goal = sim.layout.players[0], bounds = sim.layout.bounds;
  const center = { x: (bounds.left + bounds.right) / 2, z: (bounds.back + bounds.front) / 2 };
  return APPROACHES[sim.range].flatMap((seed, i) => {
    // A bounded setup-only search accommodates map fixtures. Do not start an
    // unreachable wave or silently snap a spawn through a solid wall.
    const candidates = [seed];
    for (let radius = 4; radius <= 16; radius += 4)
      for (let angle = 0; angle < 8; angle++) candidates.push({ x: seed.x + Math.cos(angle * Math.PI / 4) * radius,
        z: seed.z + Math.sin(angle * Math.PI / 4) * radius });
    const p = candidates.find(p => {
      if (!sim.canSpawnAt(p)) return false;
      const route = sim.routeBetween(p, goal);
      return route.length > 0 && distance2(route.at(-1)!, goal) < 1;
    });
    if (!p) return [];
    const dx = center.x - p.x, dz = center.z - p.z, length = Math.hypot(dx, dz) || 1;
    return [{ ...p, name: (ENTRY_NAMES[sim.range] ?? ["NORTH", "EAST", "SOUTH", "WEST"])[i], dx: dx / length, dz: dz / length }];
  });
}

export function entrySlots(sim: Simulation, gate: ArenaEntry, slot: number) {
  const side = slot % 2 === 0 ? -1.1 : 1.1, depth = Math.floor(slot / 2) * 1.9;
  return [depth, depth + 1.9, depth + 3.8, depth + 5.7, depth + 7.6].flatMap(row =>
    [side, -side, -3.3, 3.3, -5.5, 5.5].map(offset => ({
      x: gate.x + gate.dz * offset + gate.dx * row, z: gate.z - gate.dx * offset + gate.dz * row,
    }))).filter(p => sim.canSpawnAt(p) && (sim.terrain
      ? sim.terrain.segmentClear({ ...gate, y: 0 }, { ...p, y: 0 }, .6)
      : segmentClear(gate, p, [...sim.layout.barriers, ...sim.layout.platforms], .6)));
}
