import type { Actor } from "./simulation";

/** Rook assesses the returned hardware; Morrow reports the contract outcome. */
export function rookDebrief(squad: readonly Pick<Actor, "dead" | "hp" | "maxHp">[], complete: boolean) {
  const living = squad.filter(a => !a.dead);
  if (!complete) return !living.length
    ? "No chassis back. I'll take the recovery rig out. Leave their last telemetry on my bench."
    : "Keep the surviving chassis where they are. I'll bring the recovery rig. Don't send another machine in after them.";

  const count = living.length, missing = squad.length - count;
  const returned = ["No chassis back.", "One back.", "Two back.", "Three back.", "All four back."][count] ?? `${count} back.`;
  const critical = living.filter(a => a.hp / a.maxHp <= 0.35).length;
  const worn = living.some(a => a.hp / a.maxHp < 0.75);
  const damaged = living.some(a => a.hp < a.maxHp);
  const condition = critical ? critical === 1
    ? " That battered frame comes straight to my bench. No more walking on it."
    : " Those battered frames come straight to my bench. No more walking on them."
    : worn ? count === 1 ? " It needs more than a paint job. Power it down in the service bay."
      : " They need more than a paint job. Power them down in the service bay."
    : damaged ? " A few dents. Nothing we can't fix."
    : count === 1 ? " Still in one piece. Park it under cover."
    : " No holes, no bent joints. I could get used to this.";
  const recovery = !missing ? "" : missing === 1
    ? " I'll send a recovery rig for the missing chassis."
    : ` I'll send a recovery rig for the other ${missing === 2 ? "two" : "three"}.`;
  return returned + condition + recovery;
}
