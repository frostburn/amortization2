# Rotary weapon and fourth squad slot

Choose **robot 4** in the entry menu or header. ANCHOR, ROOK and LATCH remain assault robots. The fourth slot offers NEEDLE (sniper), SPINDLE (minigunner) or BOLT (another assault robot). Changing it restarts the current combat floor; the choice survives range changes, resets and browser reloads. It cannot repair or replace a robot partway through an ongoing wave. Long Range remains accessible with any choice, but its precision drill and sight buttons require NEEDLE.

| Fourth robot | Integrity / mass | Equipment | Movement |
| --- | --- | --- | --- |
| NEEDLE | 64 / 48 kg | Rifle, pistol; no grenades | 4.2 m/s; 2.6 firing |
| SPINDLE | 200 / 130 kg | Minigun; no grenades | 3.2 m/s; 1.9 winding or firing |
| BOLT | 160 / 90 kg | Machine gun, grenades | 4.2 m/s; 2.6 firing |

## Fire and rotation

SPINDLE fires 30 rounds per second from a 240-round belt, with 9 damage and a 65 m reach. A cold motor needs 0.5 s to reach firing speed. Winding consumes no ammunition and launches no shots. Release immediately stops bullets, while the motor and visible barrels coast for 0.7 s from full speed. Repress during the coast uses retained rotation, shortening the next wind-up. Reloading takes 3.8 s, lets the motor coast, and requires a new wind-up after the belt is restored. Selection/weapon changes, pause, reset and death cancel rotation and continuous sound.

Hold **Space** to brace. The minigun uses actual 3D muzzle height, spread, ballistic ray intersections, recoil and target impulses. Its individual rounds push less than a machine gun round, but its higher cadence gives stronger sustained displacement. Moving and unbraced fire have greater spread. Like the other automatic weapon, it ignores allied hulls on both teams. Rifle and grenade friendly fire stays enabled.

**Q** issues an automatic-fire order when machine gunners and SPINDLE are selected together: each uses its own gun, magazine, cadence and reload. Machine gunners fire immediately; SPINDLE joins after winding. The minigun readout shows its belt and winding/coasting status. Selecting an assault robot gives its machine gun readout. With NEEDLE, Q retains the machine-gun/pistol cycle. E and G appear only for eligible selected robots. BOLT participates in the existing round-robin grenade order. Automatic kills from either gun count toward the Proving Ground plate drill.

SPINDLE's model has an ammunition drum, feeding hardware, armour shoulders and six visibly rotating barrels. Rotation follows simulated motor speed, including coast and interrupted wind-up. Elevation guides and muzzle flashes use its actual weapon reach.

## Edited sound fragments

The originals and `sounds/_readme_and_license.txt` are unchanged. The derived files in `sounds/minigun/` are 48 kHz, mono, 16-bit PCM WAV. They are shipped in the repository: Python and FFmpeg are **developer editing tools**, not game/build dependencies.

| Fragment | Duration | Edit / playback |
| --- | --- | --- |
| `spin-up.wav` | 0.5 s | Filtered saw motor rising from 0.25× to 1×, with a quiet mechanism click and shaking layer |
| `motor-loop.wav` | 0.8 s | Stable saw section, softened high frequencies, circular overlap and endpoint correction |
| `fire-start.wav` | 0.4 s | Twelve aligned M240 reports, short dry transients and a restrained low-frequency body; starts without preceding shot tails |
| `fire-loop.wav` | 0.4 s | Twelve shots at exactly 30/s, varied pitch/gain, preceding tails wrapped across the seam |
| `fire-tail.wav` | 0.24 s | Decaying reports with no new shot attack |
| `spin-down.wav` | 0.7 s | Falling motor pitch and amplitude, ending with a mechanism click |
| `impact-1/2/3.wav` | 0.079 / 0.094 / 0.130 s | Shortened, filtered and leveled metal contacts |
| `demo.wav` | 5.5 s | Full wind-up, two-second burst and release, then a cancelled short wind-up; not bundled into the game |

The motor and gunfire are independent Web Audio layers. Offset playback follows actual retained spin when winding is interrupted or resumed. Gunfire starts only once the simulation fires and stops within a short fade after release, with a separate report tail. Pausing clears both loops and transient sounds; resuming does not restart old firing. Camera distance, panning, simultaneous automatic voices, master volume and compression govern the mix.

Metal hits cycle through the edited samples only at actual contact positions; concrete retains its noise-based impact. A global impact budget limits collision overlap during volleys. The supplied flyby is used only when a real bullet segment passes near the listening position, away from its muzzle; cover stops that segment. It is rate limited too.

Rebuild deterministically with FFmpeg, Python, NumPy and SciPy:

```sh
python scripts/build-minigun-sounds.py
```

The script aligns shot attacks, filters the motor, blends circular loops, layers the shot body and transients, applies short fades and writes the fragments and audition. No source file is overwritten. Fragment and weapon durations are checked together in the test suite.

## Validation

The simulation tests exercise all three loadouts, persistence through reset/range changes, timing before the first shot, exact sustained cadence, no ammo use on cancelled winding or coast, retained rotation, empty-belt reload, mixed automatic orders, allied-hull filtering and real target impulse, cancellation on selection/death, and arena survivor refits. PCM checks cover format, timer/cadence alignment, motor seam continuity and headroom. Browser checks use real controls and decoded AudioContext layers; they do not establish perceived mix quality or hardware performance. Physical audio-device listening and Firefox/Safari remain playtest checks.
