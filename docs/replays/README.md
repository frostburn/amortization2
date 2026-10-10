# Recorded verification runs

## Priority Access: four machinegunners

[priority-access-assault.json](priority-access-assault.json) is the unchanged
current-attempt export from a complete Playwright/Chromium run of Contract 05.
It uses the pistol-opponent balance and the patrol placement clear of civilian
traffic in commit [`c86ee85ca6320bfb7b39101064b1e80469711e7f`](https://github.com/frostburn/amortization2/commit/c86ee85ca6320bfb7b39101064b1e80469711e7f).
The JSON records revision `c86ee85`.

| Result | Recorded value |
| --- | --- |
| Simulated duration | 128.4 seconds / 7,704 ticks |
| Outcome | Complete; dispatch restored; equipment secured |
| Opponents defeated | Six perimeter guards and six response attackers |
| Squad recovered | 4 / 4 |
| Robot health, IDs 1–4 | 160, 160, 72, 160 / 160 |
| Technician health | Both 88 / 88 |
| Combat counters | 360 shots, 162 hits, four grenade throws |
| Capture | One attempt; 193 inputs; 263 snapshots |

### Watch it

1. Run `npm ci` if needed, then `npm run dev`.
2. Open **Controls & settings → View replay** and choose
   `docs/replays/priority-access-assault.json` from this checkout.
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

After five seconds at deployment, the squad clears the frontage, climbs the west
terrace to engage the concourse posts, secures the loading van and opens the
service door. Pairs cover the street and upper approach; grenades clear the raised
response. The technicians restore dispatch and all four robots return west.

Playwright's virtual clock advances the ordinary fixed simulation steps, so the
capture timestamps reflect that clock. This documents one scripted route with
precise aiming; human play remains the difficulty check. Full combat validation
here uses the assault configuration. Sniper and twin-minigun controls and damage
were exercised separately, and tests check safe deployment for all three squads.
