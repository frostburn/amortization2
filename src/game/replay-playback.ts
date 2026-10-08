import { STEP } from "./config";
import { applyReplayAction, validateSession, type ReplaySession } from "./replay";
import type { Simulation } from "./simulation";

/** Incremental resimulation: callers bound the work per frame, including seeks. */
export class ReplayPlayback {
  tick = 0;
  private cursor = 0;
  constructor(readonly sim: Simulation, readonly session: ReplaySession) {
    validateSession(session);
    if (sim.onInput || sim.onReset) throw new Error("Playback needs its own unrecorded simulation");
    this.rewind();
  }
  rewind() {
    this.sim.reset(this.session.range, this.session.fourthModel);
    this.tick = this.cursor = 0;
    this.commands();
  }
  private commands() {
    while (this.cursor < this.session.inputs.length && this.session.inputs[this.cursor].tick === this.tick)
      applyReplayAction(this.sim, this.session.inputs[this.cursor++].data);
  }
  advanceTo(target: number, maxSteps = 120, milliseconds = Infinity, discardEvents = false) {
    if (!Number.isFinite(target)) throw new Error("Invalid replay time");
    target = Math.max(0, Math.min(this.session.endTick, Math.round(target)));
    if (target < this.tick) this.rewind();
    const start = performance.now();
    let steps = 0;
    while (this.tick < target && steps < maxSteps && performance.now() - start < milliseconds) {
      this.sim.step();
      if (Math.round(this.sim.time / STEP) !== this.tick + 1)
        throw new Error(`Replay stopped unexpectedly at tick ${this.tick}`);
      this.tick++;
      this.commands();
      if (discardEvents) this.sim.events.length = 0;
      steps++;
    }
    return this.tick === target;
  }
}
