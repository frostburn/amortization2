# Human replay inspection

Run `npm run dev` and play normally. Open **Controls & settings → Export human
replay** to download a JSON capture. The mission debrief also has the export
button, so a failure or completed contract can be exported immediately. The
recorder starts when the game loads; exports include earlier retries and debug
floors from that page session. Reloading the page starts a new capture.

This is **Vite development mode**; this project does not use Vue. Production
builds omit the recorder, its controls and the replay console helpers. Debug
ranges and the existing current-state `exportReport()` remain available.

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
returns the same JSON and `inspectReplay()` reports recorder status. Exporting
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
