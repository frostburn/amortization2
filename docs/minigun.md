# Rotary weapons and squad configurations

Choose a **squad configuration** in the entry menu or header. NEEDLE joins ANCHOR, BREECH and LATCH in the sniper squad; the twin-minigun squad puts ROOK (2) and SPINDLE (4) on heavy minigun chassis, with ANCHOR and LATCH retaining machine guns and grenades; BOLT joins ANCHOR, BREECH and LATCH in the machine-gun squad. BREECH is the assault robot in slot 2; ROOK is its minigunner replacement. Callsigns stay distinct from the generic ASSAULT, SNIPER and MINIGUNNER class labels in card tooltips and accessible names. Changing the configuration restarts the current combat floor; the choice survives range changes, resets and browser reloads. It cannot repair or replace a robot partway through an ongoing wave. Long Range remains accessible with any choice, but its precision drill and sight buttons require NEEDLE.

| Specialist / fourth robot | Integrity / mass | Equipment | Movement |
| --- | --- | --- | --- |
| NEEDLE | 64 / 48 kg | Rifle, pistol; no grenades | 4.2 m/s; 2.6 firing |
| ROOK + SPINDLE (each) | 200 / 130 kg | Minigun; no grenades | 3.2 m/s; 1.9 winding or firing |
| BOLT | 160 / 90 kg | Machine gun, grenades | 4.2 m/s; 2.6 firing |

## Fire and rotation

Each minigunner fires 30 rounds per second from its own 240-round belt, with 6 damage and a 65 m reach. Its fully wound nominal damage rate is 180/s versus the machine gun's approximately 84/s. A cold motor needs 0.5 s to reach firing speed. Winding consumes no ammunition and launches no shots. Release immediately stops bullets, while the motor and visible barrels coast for 0.7 s from full speed. Repress during the coast uses retained rotation, shortening the next wind-up. Reloading takes 3.8 s, lets the motor coast, and requires a new wind-up after the belt is restored. Selection/weapon changes, pause, reset and death cancel rotation and continuous sound.

Hold **Space** to brace. The minigun uses actual 3D muzzle height, spread, ballistic ray intersections, recoil and target impulses. An individual round applies 240 N·s horizontally, one third more than the machine gun and arriving at over twice the cadence. Minigun impacts can retain up to 13 m/s of external push versus the ordinary 7 m/s limit, giving sustained fire room to overcome an advancing robot's walking motor. Machine-gun support cannot brake that stronger momentum; it decays naturally after the volley. The 130 kg chassis resists incoming displacement better than assault robots. Moving and unbraced fire have greater spread. Automatic aim defaults to upper-body height above small arena barriers, including while hovering the legs. Tall cover remains solid. Like the other automatic weapon, it ignores allied hulls on both teams. Rifle and grenade friendly fire stays enabled. See [kinetic combat tuning](combat-feel.md).

**Q** issues an automatic-fire order when machine gunners and minigunners are selected together: each uses its own gun, magazine, cadence and reload. Machine gunners fire immediately; ROOK and SPINDLE join after their own wind-up. The minigun readout shows its belt and winding/coasting status. Selecting an assault robot gives its machine gun readout. With NEEDLE, Q retains the machine-gun/pistol cycle. E and G appear only for eligible selected robots. Only ANCHOR and LATCH participate in grenade rotation in the twin-minigun squad; BOLT adds a fourth grenadier in the machine-gun squad. Automatic kills from either gun count toward the Proving Ground plate drill.

The minigunner model has an ammunition drum, feeding hardware, armour shoulders and six visibly rotating barrels. Rotation follows simulated motor speed, including coast and interrupted wind-up. Stagger immediately stops bullets and powered acceleration; the motor coasts rather than snapping to zero. A held trigger resumes from retained spin once the robot recovers. Bracing clears stagger 2.5× faster. Elevation guides and muzzle flashes use its actual weapon reach.

## Edited sound fragments

The originals and `sounds/_readme_and_license.txt` are unchanged. The motor uses `262004__olliehahn12__saw.flac`, a compact working copy of the separately supplied CC0 AIFF, downmixed to mono and archived as 24 kHz / 16-bit FLAC. Its provenance is in `sounds/saw-source-license.txt`. The game fragments in `sounds/minigun/` are 48 kHz, mono, 16-bit PCM WAV. The two auditions store the same 48 kHz / 16-bit samples in lossless FLAC, keeping development-only files small. They are shipped in the repository: Python and FFmpeg are **developer editing tools**, not game/build dependencies.

| Fragment | Duration | Edit / playback |
| --- | --- | --- |
| `spin-up.wav` | 0.5 s | Actual recorded acceleration, shortened independently of pitch and lowered to 0.4× pitch; no added click or shaking layer |
| `motor-loop.wav` | 0.8 s | The same recording's steady motor, lowered pitch, weighted low body, circular overlap and endpoint correction |
| `fire-start.wav` | 0.4 s | Twelve aligned M240 reports, short dry transients and a restrained low-frequency body; starts without preceding shot tails |
| `fire-loop.wav` | 0.4 s | Twelve shots at exactly 30/s, varied pitch/gain, preceding tails wrapped across the seam |
| `fire-tail.wav` | 0.24 s | Decaying reports with no new shot attack |
| `spin-down.wav` | 0.7 s | Actual recorded coast-down, shortened and pitch lowered; residual motor/room tail tapers to silence |
| `impact-1/2/3.wav` | 0.079 / 0.094 / 0.130 s | Shortened, filtered and leveled metal contacts |
| `demo.flac` | 5.5 s | Full wind-up, two-second burst and release, then a cancelled short wind-up; not bundled into the game |
| `motor-demo.flac` | 4.4 s | Motor-only wind-up, two steady loops, coast-down and cancelled short wind-up; not bundled into the game |

The working-source conversion is `ffmpeg -i 262004__olliehahn12__saw.aiff -af "pan=mono|c0=0.5*c0+0.5*c1" -ar 24000 -sample_fmt s16 -compression_level 12 262004__olliehahn12__saw.flac`. This preserves the original attachment and keeps the editing source small; the generated game fragments remain 48 kHz.

The source windows are 0.025–2.15 s for acceleration, 3.35–4.31 s for steady rotation and 7.22–10 s for coast-down. FFmpeg's Rubber Band filter changes their duration and pitch independently, preserving the recorded motor sweeps instead of constructing them by sweeping a loop. Reflected analysis handles are discarded after stretching to avoid a thump at cut boundaries. Filtering retains the gear whine while softening cutting hiss; a low body layer adds weight. Shared gain, matched powered-end levels and 40 ms joins connect the ramps to the loop. The older saw, click and shaking originals remain available, but are no longer used in these motor edits. Gunfire and impact fragments retain their previous bytes.

The motor and gunfire are independent Web Audio layers. Offset playback follows actual retained spin when winding is interrupted or resumed. Gunfire starts only once the simulation fires and stops within a short fade after release, with a separate report tail. Pausing clears both loops and transient sounds; resuming does not restart old firing. Camera distance, panning, simultaneous automatic voices, master volume and compression govern the mix.

Metal hits cycle through the edited samples only at actual contact positions; concrete retains its noise-based impact. A global impact budget limits collision overlap during volleys. The supplied flyby is used only when a real bullet segment passes near the listening position, away from its muzzle; cover stops that segment. It is rate limited too.

Rebuild deterministically with Python, NumPy, SciPy and an FFmpeg build containing the **Rubber Band** filter (`ffmpeg -h filter=rubberband`):

```sh
python scripts/build-minigun-sounds.py
```

The script aligns shot attacks, edits the recorded motor phases, blends circular loops, layers the shot body and transients, applies short fades and writes the fragments and both auditions. No source file is overwritten. Fragment and weapon durations are checked together in the test suite.

## Validation

The simulation tests exercise all three configurations, both minigunners across all ranges, assault restoration after switching, grenade rotation excluding both minigunners, one staggered minigunner recovering while the other keeps firing, persistence through reset/range changes, timing before the first shot, exact sustained cadence, no ammo use on cancelled winding or coast, retained rotation, empty-belt reload, mixed automatic orders, allied-hull filtering and real target impulse, cancellation on selection/death, and refitting both surviving minigunners between arena waves. PCM checks cover format, timer/cadence alignment, motor seam continuity and headroom. Browser checks use real controls and decoded AudioContext layers; they do not establish perceived mix quality or hardware performance. Physical audio-device listening and Firefox/Safari remain playtest checks.

Production Chromium 153 / Playwright 1.62.1 checks at 1440 × 900 and 1280 × 800 used native controls to select Twin Miniguns, wind up and fire both guns with separate audio voices, coast on release, reload both belts, move ROOK and SPINDLE to assigned destinations, and track a wave-one enemy. Their combined volley registered 27 hits from 32 shots and pushed that enemy about 5.2 m before disabling it. Switching to sniper/machine-gun configurations restored slot 2 to assault; Twin Miniguns survived a browser reload and a Long Range switch. The grenade control hid when only minigunners were selected. Page identity, meaningful content, overlay absence, console/request health, screenshots and laptop control bounds passed. The Browser plugin was unavailable; the check used Playwright and a software GPU.

Additional native browser checks verified distinct callsigns in all three configurations, ROOK / MINIGUNNER and BREECH / ASSAULT card text, exact tooltips and accessible labels without another robot’s callsign, the BREECH grenade-ready hint, minigun firing, persistence after reload, and readable desktop/laptop cards. No console or request errors were observed.
