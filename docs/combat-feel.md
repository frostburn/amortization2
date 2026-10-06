# Isometric view and kinetic combat

The combat loop is track → displace → change angle → regroup. Sustained automatic fire buys room before disabling a robot. An opponent can return fire while sliding, so pushing it into blocked sight lines or away from allies matters. Walking orders remain active through impacts, allowing retreat and lateral recovery during a volley.

## Camera and space

The orthographic camera looks along equal X/Y/Z offsets: 45° yaw and 35.264° elevation. The three world axes project at equal lengths, separated by 120°. Framing is wider at default zoom, with a minimum horizontal span on smaller desktop displays. At 1440 × 900, an upright robot projects to roughly 24 pixels high in Proving Ground. Wheel zoom remains available; WASD and middle drag map to screen right/up rather than fixed world axes.

| Floor | Playable dimensions | Default vertical half-span at 16:10 |
| --- | --- | --- |
| Proving Ground | 66 × 48 m | 24 m |
| Endless Arena | 112 × 80 m | 28 m |
| Long Range | 144 × 32 m | 41.25 m |

The arena has extra outer cover and entrances at ±54 m east/west and ±38 m north/south. The overview can pan across the floor; it does not fit every corner at once. Near-facing walls stay low. Rendered floors, physical support, route bounds, fog and shadow coverage expand together. Physical ground extends beyond open entrances so a displaced robot can recover inward. Long Range keeps its 30/60/90 m targets and elevated decks. Space still toggles the centred, braced first-person scope.

Audio panning follows the active camera's right axis. The diagonal listening position no longer pushes all centred action into one channel. Scope turning changes the stereo axis too; existing sample layers and distance blending remain in use.

## Bullet pressure

| Weapon | Damage per hit | Horizontal impulse before bracing | Cadence |
| --- | --- | --- | --- |
| Machine gun | 6 | 180 N·s | ~14/s |
| Minigun | 5 | 180 N·s | 30/s after wind-up |
| Pistol | 22 | 36 N·s | 1 / 0.35 s |
| Sniper rifle | 140 | 180 N·s | 1 / 1.4 s |

The fully wound minigun delivers 150 nominal damage/s and 5,400 N·s of horizontal impulse per second, versus approximately 84 damage/s and 2,520 N·s/s for the machine gun. The cold wind-up, slower heavy chassis and longer reload remain its tradeoffs. Narrow spread makes deliberate tracking practical. Moving, recoil and actual sliding velocity still worsen automatic accuracy. The rifle retains its settled/unsettled aiming model and heavy self-recoil.

Machine guns and miniguns aim at 1.65 m over empty ground. Hovering a living target below its upper chest raises aim to the chest centre; higher points retain their height, including elevated targets. This clears small arena barriers without repeatedly finding a moving silhouette's head. Tall crates still intercept shots. Player aim guides, barrel pitch and actual shots use the same point. AI/support automatic gunners prefer the upper-body line, falling back to the lower body if obstructed. Movement orders and grenades still use the ground intersection; rifle/pistol surface aim and the fixed first-person optic are unchanged.

Impulses act in the shot's horizontal direction and scale with actual chassis mass. Bracing receives 60% of an ordinary bullet's impulse and 28% of a rifle/blast impulse. Living bodies stay upright; vertical impulse is restrained. Disabled bodies still topple as single rigid bodies and remain physical obstruction.

Each live actor retains an external horizontal velocity component, bounded to 7 m/s for ordinary impacts or 11 m/s for minigun impacts and decaying by `exp(-3.2 × dt)`. A weaker hit cannot clamp existing stronger momentum downward; natural decay brings it back within the ordinary limit. The walking motor targets ordered velocity **plus** this component instead of immediately braking away a hit. Solid colliders still stop movement. Once firing stops, pressure decays and robots recover their assigned destinations. A moving practice target retains only external impact velocity, preserving its lane movement without counting its own motor velocity twice.

## Return fire and interruptions

Ordinary bullet hits make small stability disturbances. They do not reset the next burst or require a machine gunner to become stationary before shooting. Supporting robots follow the same rule while executing movement orders during sniping. Rifle hits interrupt AI/support attacks for 0.25 s; grenade hits interrupt for 0.5 s. Snipers still require stable footing and their existing 0.6 s settle time for an accurate rifle shot.

Arena assault robots engage within 38 m and seek positions around 30 m from their target. Enemy snipers seek positions around 45 m. Entrance acquisition begins after reaching the rally point or after 2.5 s, preventing a pushed entrant from remaining passive indefinitely. Cover, target changes, magazines, burst spacing and reloads still affect firing. Grenade and rifle friendly fire remain enabled; automatic and pistol fire pass through allies.

## Verification

The 99-test suite includes actual Rapier volleys that push a living hostile and redirect it from a second firing angle, mass/bracing resistance, recovery to an ordered destination, bounded pressure against a wall, moving-target lane recovery, physical support in the extended long-range apron, AI return fire while continuously hit, and support fire through bullet pressure. New checks compare a cold minigun and machine gun against an advancing robot, sweep across three living advancing robots, preserve stronger momentum through machine-gun support, and verify collision/recovery at the higher limit. Scene-picker checks fire actual shots above a 1.3 m barrier from empty-ground aim and leg hovers, retain tall-cover obstruction, and preserve elevated aim, ground orders and the scope. Pure camera checks measure equal projected axis lengths and 120° angles, screen-aligned panning, desktop framing and camera-relative stereo panning. Existing formation, weapon, grenade, sniper and wave tests still pass.

Production Chromium 153 / Playwright 1.62.1 checks at 1440 × 900 and 1280 × 800 exercised the SPINDLE arena loadout, native continuous RMB steering behind low cover, held bracing, cold wind-up, fixed-ground firing, release/coast, Shift selection and square destinations. With the cursor stationary on empty ground, 8 hits from 19 shots pushed a still-live enemy back 2.9 m through a low-barrier firing lane. Page identity, meaningful content, framework-overlay absence, console/request health, laptop control visibility and screenshots passed. The Browser plugin was unavailable; validation used Playwright and a software GPU. Hardware performance, physical audio-device balance, other browsers and the subjective combat balance still need playtesting.
