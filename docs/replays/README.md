# Recorded verification runs

## Recovery Fee: four machinegunners

[recovery-fee-assault.json](recovery-fee-assault.json) is the unchanged
current-attempt export from a complete Playwright/Chromium run of Contract 06.
Its gameplay source is
[`b82d6138d716d2f6edc6cc84de8facfb1255f9cb`](https://github.com/frostburn/amortization2/commit/b82d6138d716d2f6edc6cc84de8facfb1255f9cb).
The capture records revision `b82d613`.

| Result | Recorded value |
| --- | --- |
| Simulated duration | 54.42 seconds / 3,265 ticks |
| Outcome | Complete; cargo intact; all five guards defeated |
| Truck | Drive disabled; 780 / 900 hull integrity |
| Squad recovered | 4 / 4 |
| Robot health, IDs 1–4 | 100, 88, 160, 160 / 160 |
| Combat counters | 277 shots; 135 robot hits; no grenades |
| Enemy shots | 22, all from the two machinegunners |
| Capture | One attempt; 155 inputs; 113 snapshots; six camera observations |

Run `npm run dev`, open **Controls & settings → View replay**, select the JSON,
then Play or seek through the interception. For a textual reconstruction:

```sh
npm run inspect:replay -- docs/replays/recovery-fee-assault.json
```

The command reproduces combat counters, health, ammunition and final robot
positions within two centimetres. Future gameplay/physics changes can diverge;
use the source commit above when comparing versions.

The agent played with native keyboard and mouse: choose four machinegunners,
move through the maintenance-yard opening, stop the moving truck from the
workshop lane, pan west, close the firing distance, fight the detail, secure
the truck and return the entire squad. Target positions came from the public
read-only `inspect()` and `project()` helpers. Health, positions, enemy deaths
and objectives progressed through the ordinary simulation and controls.
Playwright's virtual clock drives normal fixed steps; capture timestamps follow
that clock. The JSON is the original recorder export.

This is a precise scripted interception early in the route. It verifies a full
assault attempt, rather than establishing human difficulty or every ambush
position. Focused tests separately exercise the other squad configurations,
late interception, route escape, braced enemy bursts, elevated routes, salvage
completion and replay reconstruction. Civilian CARTs, parked cars and the
cooperative's recovery van retain their health; civilian security is not called.

## Priority Access: four machinegunners (archived flow)

The current mission admits the technicians automatically after perimeter clearance.
This recording predates that change; use its source commit below for matching playback.
It is retained as an archived verification run, not a current-build verification.

[priority-access-assault.json](priority-access-assault.json) is the unchanged
current-attempt export from a complete Playwright/Chromium run of Contract 05.
It uses the pistol-opponent balance, stationary contractor equipment bay and
off-street squad pickup in commit
[`a6fc8e9b2185f93cfc33ccad2a7dd87ac833e900`](https://github.com/frostburn/amortization2/commit/a6fc8e9b2185f93cfc33ccad2a7dd87ac833e900).
The JSON records revision `a6fc8e9`.

| Result | Recorded value |
| --- | --- |
| Simulated duration | 130.2 seconds / 7,813 ticks |
| Outcome | Complete; dispatch restored; equipment secured |
| Opponents defeated | Six perimeter guards and six response attackers |
| Squad recovered | 4 / 4 |
| Robot health, IDs 1–4 | 160, 160, 116, 160 / 160 |
| Technician health | Both 88 / 88 |
| Combat counters | 368 shots, 162 hits, three grenade throws |
| Capture | One attempt; 229 inputs; 267 snapshots |

### Watch it

1. Run `npm ci` if needed, then `npm run dev`.
2. Open **Controls & settings → View replay** and choose
   `docs/replays/priority-access-assault.json` from a checkout of the capture’s source commit.
3. Press Play, or seek with the time slider. At the end, the viewer reports
   **combat and robot positions match the capture**.

For a textual check:

```sh
npm run inspect:replay -- docs/replays/priority-access-assault.json
```

Both the browser viewer and this command reproduced the recorded combat counters,
health, ammunition and final positions within the replay comparison tolerance.
Later gameplay or physics changes can diverge; use the capture's source commit
when comparing versions. See [human replays](../human-replays.md).

### How this run was made

This is a machine-played run using the existing human replay format. Play used
native keyboard and mouse input for selection, movement, firing, bracing, cover
sectors and grenades. Target coordinates came from the public read-only
`inspect()` and `project()` helpers. No health, positions, enemy deaths, objectives
or mission outcomes were injected into the live game.

After five seconds at deployment, the squad clears the two patrol guards,
advances into the yard to engage its posts, then climbs the west terrace to
engage the concourse guards. It secures the stationary yellow van's load and
opens the service door. Pairs cover the street and upper approach; grenades
clear the raised response. The technicians restore dispatch and all four
robots return to the off-street bay beside the west ramp.

The green service van reaches its normal stop without the blocked-lane fallback.
All three civilian CABs are cruising at extraction and have advanced during the
preceding ten seconds. Both mission vans and all civilian vehicles retain full
health; the run triggers no civilian-security dispatch. General NPC controllers
are unchanged.

Playwright's virtual clock advances the ordinary fixed simulation steps, so the
capture timestamps reflect that clock. This documents one scripted route with
precise aiming; human play remains the difficulty check. Full combat validation
here uses the assault configuration. Sniper and twin-minigun controls and damage
were exercised separately, and tests check safe deployment for all three squads.

## Confirmed-fire alert: re-simulation of human inputs

[priority-access-alert-resimulation.json](priority-access-alert-resimulation.json)
re-applies the supplied `amortization2-replay-attempt-3-2026-10-10T17-03-17-117Z.json`
inputs to gameplay commit
[`9b391c4311303544f32a2ad79e7dfacf2ac3914b`](https://github.com/frostburn/amortization2/commit/9b391c4311303544f32a2ad79e7dfacf2ac3914b).
The original used NEEDLE, completed in 95.97 seconds and recorded zero enemy shots.

The new capture uses the native recorder, unchanged recorded input order/ticks,
and original camera observations. Simulation outcomes are freshly recorded;
no positions, health, targets or objective results were injected. It is an
**offline re-simulation**, not a new human playthrough or adaptive agent run.
The recorder also saves its ordinary control synchronization, so its input count
is larger than the original. Wall-clock timestamps reflect execution time.

Guards now investigate the firing position after the first machinegun hit,
before the first rifle shot. They move away from the original aiming points.
Those fixed inputs lose the squad at **43.05 seconds**, after **27 enemy shots**,
with four perimeter guards remaining. This shows the passive-post exploit is
removed; it does not establish difficulty for a player reacting to the guards.
Weapon damage, health, pistol range and firing cadence are unchanged.

Import this JSON through **Controls & settings → View replay** to inspect it.
The following check reproduces combat counters and actor positions within 2 cm:

```sh
npm run inspect:replay -- docs/replays/priority-access-alert-resimulation.json
```

Later gameplay changes may diverge; use the documented source commit to compare.
