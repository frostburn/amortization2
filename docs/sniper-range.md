# NEEDLE and Long Range

Robot 4 is NEEDLE: a pale, narrow chassis with exposed joints, a long barrel, an optic, and a folding bipod. It trades durability and mass for a rifle that can disable an exposed practice target in one shot. The other three models remain assault robots. All four retain grenade capability and the existing selection, formation, steering, and queued-movement controls.

## Combat tuning

| Property                       | Assault      | NEEDLE       |
| ------------------------------ | ------------ | ------------ |
| Integrity                      | 160          | 64           |
| Mass                           | 90 kg        | 48 kg        |
| Gun damage against targets     | 14           | 140          |
| Gun reach                      | 65 m         | 140 m        |
| Magazine                       | 90           | 5            |
| Shot interval                  | 0.07145625 s | 1.4 s        |
| Reload                         | 2.2 s        | 3 s          |
| Self-recoil, unbraced / braced | 5 / 1 N·s    | 180 / 12 N·s |

Selecting a single robot chooses its available firearm; grenade mode persists across selections. Q selects the machine gun, E the rifle, and G grenades. Switching weapons preserves the rifle's sight but exits first-person sniping. A mixed selection fires only the robots equipped for the chosen weapon. A rifle shot is a ray through the same physics world as machine-gun shots: solid cover stops it, impacts transfer momentum, and disabled targets topple.

Space toggles braced first-person sniping when the rifle is selected. Only NEEDLE braces, even with a mixed selection. Key release and keyboard repeat do not change the mode. NEEDLE needs 0.6 seconds of slow, stable footing before its rifle settles to a 0.0006 rad sway envelope. An unbraced rifle starts with a 0.04 rad envelope, amplified by recoil and instability. The rifle and scope use the same deterministic sway direction; the view does not promise accuracy that the simulation lacks. Unbraced self-recoil reduces stability by 0.55 and delivers actual backward momentum. The finite motor acceleration recovers from that movement. Moving, selection changes, weapon changes, pause, death, reset, and range changes exit sniping and release its support. Assault robots retain hold-to-brace controls.

## Horizontal lane

The separate range spans x = −8…98 m and z = −9…9 m. NEEDLE starts at x = −2 m; targets stand at x = 28, 58, and 88 m, staggered across the lane so nearer plates do not hide the distant plate. These are nominal 30 / 60 / 90 m marks. The first target stands on the ground; the second and third stand on 2 m and 5 m concrete platforms. Their spawn heights and support colliders agree with the rendered decks. Platforms participate in navigation and stop low shots; live targets remain supported under gravity. The barrel pitches toward the aim, and the muzzle and shot use the full three-dimensional direction. Low side cover, a crate, the firing line, distance boards, and a backstop give scale and obstruction examples. No hostile AI is introduced.

The overview fits the full lane across the desktop viewport. The scene, collision geometry, destination placement, and navigation grid all use the chosen range's bounds. Switching ranges resets the drill, supplies, held input, and explosives, rebuilds the environment, and restores its overview. The original three drills remain available in Proving Ground. Only rifle kills complete the new three-target drill; a wrong-weapon kill requires a reset.

## First-person sniping

Space enters the first-person view at any overhead zoom. A perspective camera at the robot's eye height renders the real scene across the entire field, using the existing renderer and shadow map. The operator and tactical indicators are hidden only during this pass. An inexpensive transparent overlay adds the actual shot reticle and a rectangular edge vignette; there is no auxiliary render target or second world pass. The top readout shows sight distance, relative height, settling and reload state.

Sight buttons choose a distant target without firing. They preserve the wide overview. In sniping, the free cursor aims directly through the perspective image in both axes. Middle-drag turns the view with yaw and pitch, limited short of vertical; its orientation is independent of the aim point, so a stationary cursor cannot create view drift. Aim rays use the physics world and never snap to a target's centre or height. The wheel adjusts the scope from 6 to 24 degrees of vertical field of view; default is 12 degrees. The reticle follows the projected physics intersection of the shot ray, including sway and muzzle/eye parallax, and turns mint after settling. Space, right click, or Escape leaves sniping, restoring the exact overhead camera. A second Escape pauses. The header and weapon controls remain reachable throughout, and the common overhead crosshair remains available at all zoom levels.

## Rifle sound

The close recording is `855602`, the field recording `855606`, and reload uses `855601`. Camera distance drives an equal-power crossfade: close only through 24 m, a blend between 24 and 64 m, and distant only beyond 64 m. Gain falls gently with distance. Stereo placement uses the shooter's position relative to the active camera, rather than a fixed origin in the yard. The orthographic camera's physical offset scales with zoom; first-person sniping uses the eye as the listening position. The two attacks are aligned to within a millisecond by a 5 ms playback offset on the close recording; both tails remain intact. Rifle shots never start the machine-gun loop. The source files and CC0 manifest remain unchanged.

## Verification

The suite contains 31 tests against the real physics simulation. Ten sniper checks cover model fragility and weapon eligibility, intended hits and drill completion at all three distances and elevations, actual recoil and an unbraced miss, settling and movement release, firing cadence and rifle reload, cover and weapon attribution, squad travel to the far end of the lane and reset, camera-relative audio mixing, sniping transitions, and physically supported targets with height-sensitive shots. The original 21 range tests continue to pass.

Production Chromium 153 with a software GPU was checked at 1672 × 941, 1366 × 768, and 640 × 900. Ordinary keyboard and mouse controls exercised Space toggling and repeat suppression, a stationary sight, a low shot into the platform, elevated 60 and 90 m kills, middle-drag turning, magnification, rifle reload, weapon and robot selection, Space/Escape/right-click exits, pause/resume, camera-relative sound, range switching, and square squad movement. All seven recordings decode; no browser errors or warnings were observed. The Browser plugin was unavailable, so these checks used Playwright. Hardware performance, speaker/headphone balance, and Firefox/Safari remain untested.
