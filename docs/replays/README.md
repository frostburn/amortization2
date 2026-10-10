# Recorded verification runs

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
