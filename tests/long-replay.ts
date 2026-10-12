import { test } from "vitest";

/** Long capture/resimulation checks are explicitly opt-in, never part of CI. */
export function longReplayTest(name: string, run: () => void | Promise<void>, timeout?: number) {
  test.runIf(process.env.AMORTIZATION2_LONG_REPLAYS === "1")(
    `long replay: ${name}`, run, Math.max(timeout ?? 0, 60_000));
}
