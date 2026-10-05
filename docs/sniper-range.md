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

Selecting a single robot chooses its available firearm; grenade mode persists across selections. Q selects the machine gun, E the rifle, and G grenades. Switching weapons preserves the rifle's sight and held bracing. A mixed selection fires only the robots equipped for the chosen weapon. A rifle shot is a ray through the same physics world as machine-gun shots: solid cover stops it, impacts transfer momentum, and disabled targets topple.

Hold Space to brace. NEEDLE needs 0.6 seconds of slow, stable footing before its rifle settles to a 0.0006 rad sway envelope. An unbraced rifle starts with a 0.04 rad envelope, amplified by recoil and instability. The rifle and scope use the same deterministic sway direction; the view does not promise accuracy that the simulation lacks. Unbraced self-recoil reduces stability by 0.55 and delivers actual backward momentum. The finite motor acceleration recovers from that movement. A move order releases bracing; support is also cleared on selection, pause, reset, and range changes.

## Horizontal lane

The separate range spans x = −8…98 m and z = −9…9 m. NEEDLE starts at x = −2 m; targets stand at x = 28, 58, and 88 m, staggered across the lane so nearer plates do not hide the distant plate. These are nominal 30 / 60 / 90 m marks. Low side cover, a crate, the firing line, distance boards, and a backstop give scale and obstruction examples. No hostile AI is introduced.

The overview fits the full lane across the desktop viewport. The scene, collision geometry, destination placement, and navigation grid all use the chosen range's bounds. Switching ranges resets the drill, supplies, held input, and explosives, rebuilds the environment, and restores its overview. The original three drills remain available in Proving Ground. Only rifle kills complete the new three-target drill; a wrong-weapon kill requires a reset.

## First-person bubble

At fewer than 42 screen pixels per world metre, the rifle uses the common aiming cursor. When the selected rifle operator is visible and close enough, a 300-pixel circular bubble appears beside it. A seven-degree perspective camera at the muzzle renders the real world to a reusable 512 × 512 target; a circular compositor adds the reticle, edge, and vignette. It shares the primary renderer and shadow map. The operator and tactical indicators are hidden only during this auxiliary pass.

Sight buttons choose a distant target without firing. They preserve the wide overview; zooming closer centres NEEDLE. Inside the bubble, pointer coordinates cast through its perspective camera to change the actual aim. The view's anchor stays fixed during that interaction so a stationary cursor does not continually rotate the aim. The reticle follows the shot direction, including sway. It turns mint after settling. Pause, grenade mode, deselection, an off-screen operator, and far zoom hide the bubble.

## Rifle sound

The close recording is `855602`, the field recording `855606`, and reload uses `855601`. Camera distance drives an equal-power crossfade: close only through 24 m, a blend between 24 and 64 m, and distant only beyond 64 m. Gain falls gently with distance. Stereo placement uses the shooter's position relative to the camera, rather than a fixed origin in the yard. The orthographic camera's physical offset scales with zoom, so close views produce the close recording. The two attacks are aligned to within a millisecond by a 5 ms playback offset on the close recording; both tails remain intact. Rifle shots never start the machine-gun loop. The source files and CC0 manifest remain unchanged.

## Verification

The suite contains 29 tests against the real physics simulation. Eight new checks cover model fragility and weapon eligibility, intended hits and drill completion at all three distances, actual recoil and an unbraced miss, settling and movement release, firing cadence and rifle reload, cover and weapon attribution, squad travel to the far end of the lane and reset, and camera-relative audio mixing. The original 21 range tests continue to pass.

Production Chromium 153 with a software GPU was checked at 1672 × 941, 1366 × 768, and 640 × 900. Actual controls exercised the range selector, braced 60 m fire with distant audio, zoom, first-person aiming, unbraced recoil, weapon switching with held bracing and restored rifle sight, a braced 90 m kill with close audio, reload, pause/resume, range switching, and square move orders. All seven recordings decode and no browser errors or warnings were observed. The Browser plugin was unavailable, so these checks used Playwright. Hardware performance, speaker/headphone balance, and Firefox/Safari remain untested.
