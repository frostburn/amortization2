# Isometric view and kinetic combat

The combat loop is track → stagger → displace → change angle → regroup. Sustained automatic fire buys room before disabling a robot. An opponent can return fire while sliding between staggers, so pushing it into blocked sight lines or away from allies matters. Walking orders survive impacts and resume after recovery, allowing retreat and lateral recovery during a volley.

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
| Minigun | 6 | 240 N·s | 30/s after wind-up |
| Pistol | 22 | 36 N·s | 1 / 0.35 s |
| Sniper rifle | 140 | 180 N·s | 1 / 1.4 s |

The fully wound minigun delivers 180 nominal damage/s and 7,200 N·s of horizontal impulse per second, versus approximately 84 damage/s and 2,520 N·s/s for the machine gun. The cold wind-up, slower heavy chassis and longer reload remain its tradeoffs. Narrow spread makes deliberate tracking practical. Moving, recoil and actual sliding velocity still worsen automatic accuracy. The rifle retains its settled/unsettled aiming model and heavy self-recoil.

Unbraced machine guns and miniguns aim at 1.65 m over empty ground. Hovering a living target below its upper chest raises aim to the chest centre; higher points retain their height, including elevated targets. This clears small arena barriers without repeatedly finding a moving silhouette's head. Tall crates still intercept shots. Player aim guides, barrel pitch and actual shots use the same point. AI/support automatic gunners prefer the upper-body line, falling back to the lower body if obstructed. Movement orders and grenades still use the ground intersection; the fixed first-person optic is unchanged.

Impulses act in the shot's horizontal direction and scale with actual chassis mass. Bracing receives 60% of an ordinary bullet's impulse and 28% of a rifle/blast impulse. Living bodies stay upright; vertical impulse is restrained. Disabled bodies still topple as single rigid bodies and remain physical obstruction.

Each live actor retains an external horizontal velocity component, bounded to 7 m/s for ordinary impacts or 13 m/s for minigun impacts and decaying by `exp(-3.2 × dt)`. A weaker hit cannot clamp existing stronger momentum downward; natural decay brings it back within the ordinary limit. The walking motor targets ordered velocity **plus** this component instead of immediately braking away a hit. Solid colliders still stop movement. Once firing stops, pressure decays and robots recover their assigned destinations. A moving practice target retains only external impact velocity, preserving its lane movement without counting its own motor velocity twice.

## Stagger and recovery

Hits stagger living actors: active walking, shots and grenade throws pause, while physical knockback, reloads and cooldowns continue. The motor retains externally imparted velocity instead of cancelling the slide. Movement paths and destinations stay assigned; held fire resumes after recovery. A hit interrupts an active AI/support burst immediately. Those controllers reacquire on recovery without continually postponing their next attack.

| Source | Unbraced stagger | Nominal braced recovery |
| --- | --- | --- |
| Machine gun | 0.18 s | 0.072 s |
| Minigun | 0.20 s | 0.080 s |
| Pistol | 0.22 s | 0.088 s |
| Sniper rifle | 0.40 s | 0.160 s |
| Grenade | 0.65 s | 0.260 s |

Bracing drains the remaining stagger 2.5× faster, including when applied after the hit. Timing resolves at the fixed 60 Hz simulation step. Ordinary rounds cannot refresh an active stagger; recovery gives 0.12 s in which ordinary hits still damage and push, but do not start another stagger. Rifle/blast shocks can override that window. This gives robots time to act during a sustained volley. Braced robots also retain their faster stability recovery and reduced incoming impulse. Snipers must settle again after a stagger before regaining accurate rifle fire.

Living bodies remain upright. The torso jolts in the horizontal impact direction, walking animation pauses while the chassis slides, and ground rings brighten through recovery. Squad cards show STAGGER; the scope reports it without moving the fixed optical reticle. Stagger coasts a minigun motor and stops its bullet stream; held input resumes retained spin. Grenade rotation skips staggered operators. Death, reset and survivor refits clear recovery state.

Arena assault robots engage within 38 m and seek positions around 30 m from their target. Waves 1–2 do not brace; wave 3 introduces braced firing positions alongside enemy snipers, who seek positions around 45 m. Entrance acquisition begins after reaching the rally point or after 2.5 s once stagger clears, preventing pressure from holding an entrant in its rally phase indefinitely. Cover, target changes, magazines, burst spacing and reloads still affect firing. Grenade and rifle friendly fire remain enabled; automatic and pistol fire pass through allies.

## Verification

The simulation test suite includes actual Rapier volleys that push a living hostile and redirect it from a second firing angle, mass/bracing resistance, recovery to an ordered destination, bounded pressure against a wall, moving-target lane recovery, physical support in the extended long-range apron, AI return fire between repeated staggers, and support fire through bullet pressure. Stagger checks exercise manual shot/throw interruption and walking recovery, bracing after impact, action windows under continuous minigun hits, rifle/blast overrides, retained motor spin, grenade rotation, death/refit/reset and actual AI firing in waves 1–3. Further checks compare a cold minigun and machine gun against an advancing robot before reaching the back wall, exercise independent twin-minigun firing/recovery, sweep across three living advancing robots, preserve stronger momentum through machine-gun support, and verify collision/recovery at the higher limit. Scene-picker checks fire actual shots above a 1.3 m barrier from empty-ground aim and leg hovers, retain tall-cover obstruction, and preserve elevated aim, ground orders and the scope. Pure camera checks measure equal projected axis lengths and 120° angles, screen-aligned panning, desktop framing and camera-relative stereo panning. Existing formation, weapon, grenade, sniper and wave tests still pass.

Production Chromium 153 / Playwright 1.62.1 checks at 1440 × 900 and 1280 × 800 exercised native continuous RMB steering with square destinations, actual incoming fire and STAGGER card/hint feedback, Space bracing, held return fire after recovery, new movement orders, reset and visible laptop controls. Observed wave-one enemies stayed unbraced; no observed staggered player was marked firing. LATCH resumed braced manual fire and registered 19 hits from 19 shots. Page identity, meaningful content, framework-overlay absence, console/request health and screenshots passed. The Browser plugin was unavailable; validation used Playwright and a software GPU. Hardware performance, physical audio-device balance, other browsers and the subjective combat balance still need playtesting.

Braced firearm aim expresses the intended firing point. Clear ground and leg shots retain their actual height. If static low cover obstructs that point and the usual automatic firing line can clear it, machine guns and miniguns fall back to 1.65 m for ground intent or the hovered robot's upper chest. The selected squad shares this assisted point; aim guides, barrel pitch and shots all follow it. Tall cover and low barriers too close to the muzzle still block fire. Direct hits on cover itself, window panes, loose cargo and civilian robots retain surface aim. Pistol and scoped rifle aim remain precise; ground-only movement and grenade placement are unchanged. The supported upper body turns toward the reticle while the feet stay planted. A fully settled braced rifle has no residual sight-line sway. Changing aim in scope resolves the reticle target through the current optical ray; the shot converges on that point from the physical muzzle. Unbraced spread, settling, recoil and cover interception still apply.
