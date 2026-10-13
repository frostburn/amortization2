# Recorded verification runs

These captures have been losslessly re-encoded as compact version 2 JSON. The
gameplay data, original revisions, timestamps and verification results below are
unchanged. The current viewer and `inspect:replay` decode either format. For an
older source checkout, first expand the file using the current checkout:

```sh
npm run format:replay -- docs/replays/timber-rights-terrain.json /tmp/terrain-v1.json --expand
```

Then load the expanded file in the original gameplay checkout. See
[human replays](../human-replays.md) for the encoding and conversion commands.

## Timber Rights: slope movement and failed-attempt controls

Two unchanged native keyboard/mouse captures verify the terrain correction and
failed-attempt export flow at gameplay source
[`fce02df333f13ad30266014d8607fa4534866ddf`](https://github.com/frostburn/amortization2/commit/fce02df333f13ad30266014d8607fa4534866ddf).
Both record revision `fce02df` and `range: "forest", mode: "mission"`.

| Capture | Result | Recorded data |
| --- | --- | --- |
| [timber-rights-terrain.json](timber-rights-terrain.json) | Twin-minigun squad clears the uphill approach with one movement order; all four at full health; first objective remains active | 18.60 s / 1,116 ticks; 13 inputs; 39 snapshots; 3 camera observations |
| [timber-rights-failure.json](timber-rights-failure.json) | Four machinegunners deliberately take fire without shooting; all four disabled; exported from the retained failure dialog | 44.38 s / 2,663 ticks; 21 inputs; 91 snapshots; 5 camera observations; 65 enemy shots |

The movement check uses the first destination from the supplied human replay.
It needs no retreat/reissue order and records no stationary navigation snags.
All three squad configurations also have a physical regression test for that
approach. In the reproduced machinegun and twin-minigun cases, hulls spent over
eleven seconds stationary with an active route before the fix. After the fix
they arrive without a prolonged stop. The ground
motor applies its impulse along the support plane, and route queries use the
surface beneath the capsule's rounded bottom. Bodies still move through normal
Rapier physics; no position snapping or teleporting is used.

The failed run tests the UI, not mission difficulty. The player braces after
security opens fire and deliberately does not fight back. Holding/repeating and
releasing Space leaves the debrief open. Its native export button downloads the
second JSON before any restart. Subsequent browser checks open the confirmation,
block held Enter and Space, cancel through the button and Escape, then restart
with a fresh Enter press. A second deliberate failure verifies click confirmation.
Dialog confirmation/export remains fully visible at 1440 × 900 and 1280 × 720.
These UI interactions are checked separately; the replay records game commands,
not dialog button focus or raw key events.

Installed Playwright/Chromium was used because the Browser plugin was not
available. A virtual clock advances normal fixed ticks while skipping rendered
frames. Only public read-only inspection/projection and terrain height queries
supply coordinates; health, positions, damage, ammunition and objectives are
not injected. Both captures reproduce within 2 cm in the offline inspector and
browser viewer. Browser import, end seek, rewind, play and exit pass without
console errors.

Run `npm run dev`, open **Controls & settings → View replay**, and choose either
JSON. Textual reconstruction:

```sh
npm run inspect:replay -- docs/replays/timber-rights-terrain.json
npm run inspect:replay -- docs/replays/timber-rights-failure.json
```

These are focused navigation and failure-flow checks, not a fresh completed
mission run. Movement changes affect earlier captures' trajectories; use each
recording's linked gameplay source for matching playback.

## Timber Rights: four machinegunners

This complete run predates the slope-motor fix. Use its linked source for matching
playback; the current focused checks are above.

[timber-rights-assault.json](timber-rights-assault.json) is the unchanged
development recorder export from a complete keyboard/mouse playthrough after
the pressure retune. Gameplay source:
[`9fc991a90394b54037eb2f4df9aff7183d1c1874`](https://github.com/frostburn/amortization2/commit/9fc991a90394b54037eb2f4df9aff7183d1c1874).
The capture records revision `9fc991a`, `range: "forest"` and `mode: "mission"`.

| Result | Recorded value |
| --- | --- |
| Simulated duration | 131.77 seconds / 7,906 ticks |
| Outcome | Complete; both rigs disabled; work order sealed; clearing secured |
| Security defeated | Four guards and two four-robot response squads |
| Squad recovered | 2 / 4 |
| Robot health, IDs 1–4 | 0, 160, 76, 0 / 160 |
| Manual player combat | 589 shots; 203 robot hits; no grenades |
| Automated covering fire | 61 shots; 61 robot hits |
| Enemy shots | 58 |
| Work order sealed / inspectors take possession | 79.88 s / 107.67 s |
| Capture | One recorded attempt; 394 inputs; 269 snapshots; 10 camera observations |

The squad climbs the approach track, fights security from the western logging
lane and stops both rigs. It establishes two cover sectors in the clearing
before sending ANCHOR alone to seal the terminal. The other three keep covering
while ANCHOR returns. The squad engages the northern response, then the southern
response. BOLT and ANCHOR are lost during the hold; BREACH and LATCH defeat the
remaining gunner and retrace the woodland track to the layby. Commands use the
regular selection, movement, cover, brace, fire and reload controls.

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
rewind, play and exit to the live game without console errors. Later
gameplay/physics changes may diverge; compare against the source above.

This verifies the four-machinegun mission route. Tests separately cover all
three loadouts, terrain/physics agreement, uphill/downhill formation movement,
rifle and grenade damage to rigs, actual firing/blast locations for guard alerts,
contested objectives, opposed responses firing during their approach, pressure
on a lone braced SPINDLE, recovery and terrain-aware arena entries. Human play
remains the difficulty check; this run uses precise scripted aiming.

The [pre-retune capture](https://github.com/frostburn/amortization2/blob/f38bc43b36dbae08517104872472d334a81e48c9/docs/replays/timber-rights-assault.json)
is retained in git history. It completed at gameplay source `65c7815` with four
survivors against ten security robots; it is not a current-build verification.

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


## Night Shift: one road escort, three clearing defenders

[night-shift-minigunner.json](night-shift-minigunner.json) is a complete agent
verification using the normal simulation input API and development recorder.
Gameplay source: [`ea2fff3`](https://github.com/frostburn/amortization2/commit/ea2fff3ab39f7bd97e635a5f3420775138aae08e).
This is an agent run, not a human keyboard/mouse performance. The controller
uses squad-detected contacts only. It gives ANCHOR movement and covering orders
beside the convoy while ROOK, LATCH and SPINDLE fight the ground squads. Health,
positions, damage, ammunition, enemy spawns and objective state are not injected.

| Result | Value |
| --- | --- |
| Duration | 131.78 seconds / 7,907 fixed ticks |
| Squad recovered | 4 / 4 |
| Final integrity | ANCHOR 116; ROOK 194; LATCH 70; SPINDLE 166 |
| Convoy received | VAN 56 / 320; TRUCK 620 / 620 |
| Contractor responses | Three ground squads; four pistol-drone pairs |
| Peak unattended occupation | About 28% before the team moved into the clearing |
| Outcome | Complete; no hostiles remaining |

Deterministic reconstruction matches the recorded final snapshot exactly. The
capture is compact replay v2, approximately 465 KiB. It is an inspection artifact
and is not loaded by the default tests or CI. Run `npm run dev`, choose **View
replay**, and load the JSON; use its linked gameplay source for matching playback.

```sh
npm run inspect:replay -- docs/replays/night-shift-minigunner.json
```

## Demurrage: paired crane restart and contested return

[demurrage-minigunner.json](demurrage-minigunner.json) records a complete agent
run at gameplay source
[`66a8f47`](https://github.com/frostburn/amortization2/commit/66a8f47783b1f903435648f498be796b9b70de94).
The controller uses the normal simulation input API and development recorder,
with squad-detected contacts and physical firing-line checks. It clears the
yard, sends ROOK and LATCH to the separated crane controls, covers the restart,
then regroups and fights through the west response to the service gate. Health,
positions, ammunition, damage, spawns and objective state are not injected.

| Result | Value |
| --- | --- |
| Duration | 121.70 seconds / 7,302 fixed ticks |
| Squad recovered | 4 / 4 |
| Final integrity | ANCHOR 76; ROOK 154; LATCH 108; SPINDLE 90 |
| Cranes restored | 62.42 seconds |
| Opponents defeated | Seven guards; six quay responders; three gate responders |
| Combat counters | 327 shots; 316 hits; 32 enemy shots |
| Outcome | Complete; no contract hostiles remaining |

Deterministic reconstruction matches the final snapshot exactly. The compact
v2 JSON is about 440 KiB, with camera observations sampled every two seconds.
This is an agent verification with precise aiming, not a human difficulty test.
Only the twin-minigun configuration has a full run here; bounded tests check all
three squad configurations. The file is an inspection artifact and is not loaded
by default tests or CI.

Run `npm run dev`, open **Controls & settings → View replay**, and select this
JSON. Use the linked source commit for matching playback after gameplay changes.

```sh
npm run inspect:replay -- docs/replays/demurrage-minigunner.json
```
