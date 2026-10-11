import { RANGES, type RangeId } from "./ranges";

export const GAME_MODES = { mission: "CONTRACTS", arena: "ENDLESS ARENA", practice: "PRACTICE / DEBUG" } as const;
export type GameMode = keyof typeof GAME_MODES;
export const LEVEL_ORDER: RangeId[] = ["receiving", "crossing", "handling", "escort", "priority", "recovery",
  "arena", "proving", "long", "city", "concourse", "port"];
export function defaultMode(range: RangeId): GameMode {
  return range === "arena" ? "arena" : RANGES[range].contract ? "mission" : "practice";
}
export function levelsForMode(mode: GameMode) {
  return LEVEL_ORDER.filter(id => mode === "arena" || (mode === "mission" ? RANGES[id].contract : !RANGES[id].contract && id !== "arena"));
}
export function levelName(range: RangeId, mode: GameMode) {
  return range === "arena" ? "TRAINING ARENA" : mode === "arena" ? RANGES[range].name.replace(/^\d+ · /, "") : RANGES[range].name;
}
