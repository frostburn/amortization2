import type { Simulation } from "./simulation";

export type PointerHit = { actor?: number; cargo?: number };
export type PointerAction =
  | { type: "fire" | "select" | "cover" | "group" }
  | { type: "haul"; cargo: number; verb: "collect" | "drop" }
  | { type: "blocked"; message?: string };

/** Overhead clicks express an order; Ctrl explicitly requests a weapon shot. */
export function pointerAction(sim: Simulation, hit: PointerHit | null,
  modifiers: { forceFire?: boolean; selecting?: boolean; covering?: boolean } = {}): PointerAction {
  if (modifiers.selecting) return { type: "group" };
  if (modifiers.covering) return { type: "cover" };
  if (!modifiers.forceFire) {
    if (hit?.cargo !== undefined && sim.hauling) {
      const intent = sim.hauling.intent(hit.cargo);
      return intent.action === "blocked" ? { type: "blocked", message: intent.message }
        : { type: "haul", cargo: hit.cargo, verb: intent.action };
    }
    const actor = sim.squad.find(a => a.id === hit?.actor);
    if (actor) return { type: actor.dead ? "blocked" : "select" };
  }
  return { type: sim.active.some(a => !a.haul && sim.followsOrder(a, sim.weapon)) ? "fire" : "blocked" };
}
