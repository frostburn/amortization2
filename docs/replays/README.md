# Recorded verification runs

## Timber Rights: four machinegunners

[timber-rights-assault.json](timber-rights-assault.json) is the unchanged
development recorder export from a complete keyboard/mouse playthrough.
Gameplay source:
[`65c78158b08148c374da74d9fc878e2cb314ae45`](https://github.com/frostburn/amortization2/commit/65c78158b08148c374da74d9fc878e2cb314ae45).
The capture records revision `65c7815`, `range: "forest"` and `mode: "mission"`.

| Result | Recorded value |
| --- | --- |
| Simulated duration | 139.65 seconds / 8,379 ticks |
| Outcome | Complete; both rigs disabled; work order sealed; clearing secured |
| Security defeated | Four guards and two three-robot response squads |
| Squad recovered | 4 / 4 |
| Robot health, IDs 1–4 | 108, 160, 26, 16 / 160 |
| Player combat | 986 shots; 190 robot hits; no grenades |
| Enemy shots | 41 |
| Work order sealed / inspectors take possession | 83.38 s / 112.95 s |
| Capture | One attempt; 465 inputs; 285 snapshots; 11 camera observations |

The squad climbs the approach track, fights security from the western logging
lane, stops both rigs, then advances downhill to the work-order terminal.
It returns to the clearing for both contractor responses, defeats them and
retraces the woodland track to the layby. Two badly damaged robots survive
the return. Commands use the regular movement, brace, fire and reload controls.

Installed Playwright/Chromium was used because the Browser plugin was not
available. Its virtual clock advances the ordinary fixed simulation while
skipping rendered frames. Read-only `inspect()` and `project()` helpers supply
coordinates; the shared terrain module supplies the ground height for movement
clicks. Health, positions, ammunition, rig damage and objective progress were
not injected. Desktop/laptop visual checks use 1440 × 900 and 1280 × 720.

Run `npm run dev`, open **Controls & settings → View replay**, and select the
JSON. For textual reconstruction:

```sh
npm run inspect:replay -- docs/replays/timber-rights-assault.json
```

The offline inspector and browser viewer reproduce recorded combat and final
robot positions within two centimetres. Browser checks import, seek to the end,
rewind, play and exit to the live game. Later gameplay/physics changes may
diverge; compare against the source above.

This verifies the four-machinegun mission route. Tests separately cover all
three loadouts, terrain/physics agreement, uphill/downhill formation movement,
rifle and grenade damage to rigs, contested objectives, exactly two response
squads, recovery and terrain-aware arena entries. It does not establish human
difficulty or performance on physical graphics hardware.

## Recovery Fee: bridge access

[recovery-fee-bridge.json](recovery-fee-bridge.json) is the unchanged development
recorder export from native mouse/keyboard play at gameplay source
[`382248cc714b0fbafe24248ec90390a6d22cdd21`](https://github.com/frostburn/amortization2/commit/382248cc714b0fbafe24248ec90390a6d22cdd21).
It records one 19.5-second attempt (1,170 ticks), 17 inputs, 41 snapshots and
four camera observations. All four robots arrive on the 4.8-metre deck in a
square formation at full health. The contract remains in its interception
stage; this is a navigation check, not a complete mission playthrough.

The player selects the squad, holds RMB on the open upper ramp and drags onto
the bridge before any robot has reached the ramp. The squad climbs the south
approach and stays above the road. Native controls drive the ordinary fixed
simulation; read-only `inspect()` and `project()` provide coordinates. No
positions, health or mission outcomes are injected. Installed Playwright/
Chromium was used because the Browser plugin was unavailable; its virtual
clock skips rendered frames while advancing normal physics ticks.

Separate browser checks verify a second bridge click before the climb begins,
Shift+RMB queueing and a fresh street order beneath the flat span. Tests cover
both open ramps, low-ramp continuation, disconnected paths, concourse levels,
and the full squad's ascent and descent. Desktop/laptop screenshots were
inspected at 1440 × 900 and 1280 × 720 with no header clipping or console errors.

Open **Controls & settings → View replay** in development mode and select the
JSON. Browser import and seeking to the end report matching combat and robot
positions. For textual reconstruction:

```sh
npm run inspect:replay -- docs/replays/recovery-fee-bridge.json
```

The offline inspector reproduces the recording within two centimetres. Later
physics/gameplay changes may diverge; use the linked source when comparing.

## Endless Arena: Receiving with twin miniguns

[arena-receiving-minigunners.json](arena-receiving-minigunners.json) is the unchanged
current-attempt export from native keyboard/mouse play. Gameplay source:
[`fda4562f3056b1b9093c1a1c6f62b641aaec5cae`](https://github.com/frostburn/amortization2/commit/fda4562f3056b1b9093c1a1c6f62b641aaec5cae).
The capture explicitly records `mode: "arena"` and `range: "receiving"`.

| Result | Recorded value |
| --- | --- |
| Duration | 17.08 seconds / 1,025 ticks |
| Wave result | Waves 1 and 2 cleared; wave 3 warning |
| Hostiles disabled | 7 |
| Squad | 4 alive, fully repaired and rearmed |
| Player combat | 238 shots, 189 hits, no grenades |
| Enemy shots | 19 |
| Capture | One attempt, 53 inputs, 38 snapshots, four camera observations |

The squad moves off its deployment bay into the open yard, then braces and
fires at incoming squads. Wave one enters from the north; wave two uses the east
approach. The next warning names south and west. All deaths, damage, recoil,
movement and survivor repairs come from the ordinary fixed-step simulation.
There are no contract guards, cargo objectives or tutorial weapon restrictions.

QA used installed Playwright with Chromium because the Browser plugin was not
available. Its virtual clock advances normal fixed ticks; only rendered frames
are skipped for speed. `inspect()` and `project()` supply read-only coordinates.
Gameplay state, health, ammunition, kills and wave completion were not injected.
Browser import, seeking to the end, rewinding and returning to the original live
arena pass; the viewer reports matching combat and robot positions. The offline
inspector also reproduces the capture within two centimetres.

Run `npm run dev`, open **Controls & settings → View replay**, and select the
JSON. For textual inspection:

```sh
npm run inspect:replay -- docs/replays/arena-receiving-minigunners.json
```

This verifies two early waves on Receiving with twin miniguns. Simulation tests
cover all twelve maps' entrances, other loadouts, later waves, casualties,
grenades, defeat/restart, physical interiors and replay compatibility. The menu
was also checked on all maps at 1440 × 900 and 1280 × 720. This is functional
Chromium verification rather than a hardware-performance or difficulty study.


## Recovery Fee: hauling and pursuit

[recovery-fee-pursuit-assault.json](recovery-fee-pursuit-assault.json) is the
unchanged recorder export from a complete native keyboard/mouse playthrough.
Its gameplay source is
[`f5a63e0053e08d0d590195ee5abc2168073d0a8c`](https://github.com/frostburn/amortization2/commit/f5a63e0053e08d0d590195ee5abc2168073d0a8c);
the capture records revision `f5a63e0`.

| Result | Recorded value |
| --- | --- |
| Simulated duration | 70.68 seconds / 4,241 ticks |
| Outcome | Complete; bulk cargo intact; dispatch case delivered |
| Truck | Drive disabled; 780 / 900 hull integrity |
| Squad recovered | 4 / 4 |
| Robot health, IDs 1–4 | 82, 34, 116, 160 / 160 |
| Player combat counters | 544 shots; 158 robot hits; no grenades |
| Enemy shots | 36: 20 convoy detail, 16 pursuing patrol |
| Case lifted / patrol arrival | 35.07 s / 41.08 s |
| Case delivered / squad extracted | 59.82 s / 70.68 s |
| Capture | One attempt; 405 inputs; 146 snapshots; seven camera observations |

The four-machinegun squad intercepts from the workshop lane, defeats the five
convoy guards and secures the bulk load. ANCHOR picks up the case using **H**.
All four receive an extraction movement order, then the other three receive a
cover-sector order and hold a rear guard while the carrier advances through the
west service entrance. A single patrol enters after the six-second warning.
The rear guard uses normal aimed fire, defeats the pursuers, then moves to the
pickup bay. The patrol damages two supporting robots; the carrier keeps moving.
The case is accepted automatically and the squad completes extraction.

Play used installed Playwright/Chromium and its virtual clock to advance the
ordinary fixed simulation. Coordinates came from public read-only `inspect()`
and `project()` helpers. Health, positions, ammunition, enemy deaths and mission
outcomes were not injected. The source includes a separate physical-navigation
test verifying a single loaded return order completes unloading and gathering.

Run `npm run dev`, open **Controls & settings → View replay**, select the JSON,
then play or seek through the hauling/pursuit sequence. Textual reconstruction:

```sh
npm run inspect:replay -- docs/replays/recovery-fee-pursuit-assault.json
```

The offline inspector and browser viewer reproduce recorded combat and robot
positions within two centimetres at this source. The browser check imports,
plays, seeks to completion, seeks backwards and exits to the original live game.
Later gameplay/physics changes can diverge; compare against the source above.

This precise early interception verifies the four-machinegun route, not human
difficulty, every interception point or every configuration. Focused tests cover
other squad choices, intact/salvage outcomes, late guard deployment, a pursuit
that persists through dropping/recollecting cargo, and extraction with living
pursuers. The original pre-hauling run remains below as an archive.

## Recovery Fee: four machinegunners (archived flow)

This recording predates case hauling, the pursuing patrol and the west service
entrance. Use its source commit below for matching playback; it is retained as
a historical verification run.

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

## Scoped firing line: focused range verification

[scope-firing-line.json](scope-firing-line.json) records a focused Playwright
browser check at gameplay commit
[`9ba018b7aebfea87fac234c139e846d055a65d7f`](https://github.com/frostburn/amortization2/commit/9ba018b7aebfea87fac234c139e846d055a65d7f).
At 1280 × 720, NEEDLE uses the normal 30 / 60 / 90 m sight buttons, enters the
braced scope, settles and fires once at each target. All three shots hit, including
the elevated targets. The 256-tick capture takes 4.27 seconds of simulation time.
This is a range check, not a complete mission playthrough or difficulty assessment.

Navigation and keyboard controls use Playwright input. Scoped firing dispatches
ordinary mouse button events on the canvas because headless pointer capture
leaves the automation cursor on the sight button; no simulation state, health or
hit results are injected. The development recorder exports the unmodified run.
Import it through **Controls & settings → View replay**, or inspect it with:

```sh
npm run inspect:replay -- docs/replays/scope-firing-line.json
```

Physics regression tests separately exercise visible targets above low rails and
beside wall corners, nearby cover blocking the optical line, and friendly rifle
interception. Later gameplay changes may diverge from the documented source commit.
