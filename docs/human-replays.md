# Human replay inspection

Run `npm run dev` and play normally. Open **Controls & settings → Export human
replay** to download a JSON capture. The mission debrief also has the export
button, so a failure or completed contract can be exported immediately. The
recorder starts when the game loads. **Export human replay** downloads the current
attempt, including after Retry, Reset or Shift+R; its filename includes the attempt
number. **Export all attempts** includes earlier retries and debug floors from
that page session. Either export keeps recording. Reloading the page starts a new capture.

This is **Vite development mode**; this project does not use Vue. Production
builds omit the recorder, its controls and the replay console helpers. Debug
ranges and the existing current-state `exportReport()` remain available.

## Viewing an export in the game

In development, open **Controls & settings → View replay** (also in the debrief)
and choose an exported JSON file. The viewer starts paused on the latest attempt
in the file; earlier attempts remain available in the selector. Use Play/Pause, the
time slider, ±5 seconds, the speed selector (¼×–4×) and the attempt selector.
**Exit replay** or Escape returns to your live game, paused, with its camera and
squad state preserved. Each file is read locally; it is never uploaded.

The viewer re-simulates commands on a separate physics world and follows recorded
overhead and scope cameras. Pauses in the original playthrough are skipped.
Seeking runs in bounded batches so long captures do not block the UI. Playback
cannot issue squad orders and does not enter the human recorder. At the end,
combat counters, robot health/ammo and final positions are checked against the
capture; differing code or physics can produce a visible divergence warning.
`window.amortization2.inspectPlayback()` exposes viewer progress in development.
The viewer and file controls are absent from production builds.

## Inspecting an export

Attach the JSON when describing a combat or movement problem. In the matching
source checkout, run:

```sh
npm run inspect:replay -- /path/to/amortization2-replay.json
```

The command reports each attempt's duration, outcome, commands, per-robot shots,
disabled robots, final health/ammunition/positions and camera sample count. It
also re-simulates gameplay intentions at the original fixed ticks and compares
combat counters and actor positions with the recorded outcome. A divergence is
reported explicitly. The recorded observations remain useful when inspecting a
capture from older code, but re-simulation requires matching source and physics
versions. The revision records the checkout at dev-server startup, including a
`-dirty` suffix for local changes; restart the server after editing code if a
precise revision is needed.

For console inspection in development, `window.amortization2.exportReplay()`
returns the current attempt; `exportReplay("all")` returns the full page history.
`inspectReplay()` reports the attempt number and current/total recorded time. Exporting
pauses neither the game nor the recorder and never resets an attempt.

## Contents and limits

The versioned capture includes resolved selection, movement/queued movement,
weapon, reload, brace/scope and grenade commands; changes in aim and trigger;
shot endpoints, impacts and other simulation events; observed snapshots twice a
second and at mission/arena phase changes; and changed overhead/scope camera
states, viewport, axis inversion and pause state. Commands include the game's
resolved release/cancel operations. Camera samples retain wall time as well as
simulation ticks, so a long pause does not become a long gameplay wait.

Every attempt starts from its floor's authored initial state, squad preference,
and simulation seed. This is an inspection format, not a save game or video. It
does not record audio, browser credentials, other page content or raw keystrokes.
Direct console mutations of simulation internals are outside the command format.

Capture is bounded to **20 minutes of simulated play, 32 attempts/floors, or
60,000 entries**, whichever comes first. The game keeps running; the settings and
debrief show that recording stopped and exports mark the partial capture. Export
and reload the page for another recording. The reader rejects unsupported
versions, unordered commands and captures exceeding these bounds.

Handling captures the H cargo command alongside movement and selection. Playback
recreates physical grips, gate acceptance, guard clearance, drone arrivals and
cargo extraction from the same fixed simulation ticks.
