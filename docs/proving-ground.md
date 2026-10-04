# Proving Ground: first playable

## Purpose

Establish the feel of a four-robot squad before adding hostile AI or campaign structure. The player should read a hit through sound, a short spark, a change in position, and the target's reaction. Momentum matters while inputs stay responsive. Physics supports the combat: it does not turn every impact into a loose-limbed performance.

## Layout

The playable yard is approximately 44 × 32 metres, viewed through a panning, zooming orthographic camera. World Y is up; negative Z leads away from the firing line.

| Lane              | Contents                                               | Question it answers                                              |
| ----------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| 01 / Ballistics   | Six plate targets at staggered distances               | Can the player acquire and clear targets quickly?                |
| 02 / Displacement | Two reinforced robot targets, one moving plate, crates | Can a stream of hits move a target without making it unreadable? |
| 03 / Fragments    | Three targets in a concrete bay, loose props           | Can a thrown grenade exploit a route that direct fire cannot?    |

Four squad members start across the apron. All lanes share one simulation, so units can cross between drills. Completion records persist until reset. There is no score pressure or limited ammunition reserve in this range.

## Initial tuning

| Parameter                     | Value                                                      |
| ----------------------------- | ---------------------------------------------------------- |
| Simulation                    | Fixed 60 Hz; at most six catch-up steps per rendered frame |
| Machine-gun cadence           | 10 shots / 0.7145625 s, matching the supplied loop         |
| Magazine / reload             | 90 rounds / 2.2 s                                          |
| Target damage per bullet      | 14                                                         |
| Bullet impulse                | 48 N·s horizontally before bracing reduction               |
| Walk / firing movement speed  | 4.2 / 2.6 m/s                                              |
| Grenade fuse / nominal radius | 2.4 s / 6.5 m                                              |
| Maximum throw distance        | 28 m                                                       |
| Gravity                       | 12 m/s²                                                    |
| Drill displacement threshold  | 2 m                                                        |

Balance constants and authored geometry live in `src/game/config.ts`. Weapon interaction and target durability are in `src/game/simulation.ts`. These are starting values for playtesting, not a campaign balance contract.

## Physical response

Living actors have upright rigid bodies. Finite motor acceleration lets external impulses move a robot before it recovers and continues its route. Bracing reduces incoming impulse and increases recovery authority. Death unlocks rigid-body rotation; damping and restrained vertical blast force keep the outcome compact. There are no skeletal ragdolls.

Bullets use physics ray casts. Grenades are continuous-collision rigid bodies with an actual fuse. Blast damage and impulse fall with distance; three visibility samples per actor account for partial cover. The aim arc stops at its first predicted contact and does not predict all subsequent bounces. Loose props can shield actors and be pushed by impacts.

Movement uses a small A\* grid with inflated obstacles, diagonal corner protection, and optional queued destinations. Loose props are included when a route is requested. Routes are not continuously rebuilt after a prop moves; issue another move if an altered obstacle blocks the route.

## Audio behavior

The entry gesture creates the audio context and decodes the four supplied files. Each firing robot has a scheduled start, looping sustain, and release tail. Firing voices are normalized as the squad joins in. Muzzle loops stop on release, empty magazine, reload, deselection, pause, or death. Reload and impact details use filtered noise and short tones; the blast recording gets a brief 75→34 Hz layer. Master compression contains simultaneous bursts.

The audio bus currently pans from world X. It has no physical propagation delay, acoustic occlusion, or environmental convolution yet. Final loudness and timbre require headphone and speaker listening tests; successful browser decoding alone does not establish mix quality.

## Code boundaries

| File                         | Responsibility                                             |
| ---------------------------- | ---------------------------------------------------------- |
| `src/main.ts`                | Startup, input, pause, fixed-step loop, preferences        |
| `src/game/config.ts`         | Units, layout, shared tuning, throw solution               |
| `src/game/simulation.ts`     | Physics, weapons, damage, squad, drill state               |
| `src/game/navigation.ts`     | Grid route finding                                         |
| `src/render/scene.ts`        | Geometry, lighting, camera, aiming, effects, interpolation |
| `src/audio/audio.ts`         | Sample scheduling and procedural audio layers              |
| `src/ui.ts`, `src/style.css` | Accessible DOM controls and live HUD                       |

Rendering and sound consume simulation events. Visual particles never affect damage. Rigid model parts are merged by material, static architecture is batched, sparks use instancing, and particles/decals have fixed budgets. The simulation can be tested without a renderer or browser.

## Verification and limits

Nine automated tests cover cadence/reload, hit obstruction, displacement, grenade flight/fuse, blast cover, brace recovery, moving-target travel, route clearance, reset, and completion of all three authored drills. Browser smoke checks cover actual mouse/keyboard input, sample decoding, loop start/stop, grenade impact, movement, bracing, pause, reset, and desktop layout.

The current compatibility distribution of Rapier inlines its WebAssembly into a roughly 4.3 MB JavaScript chunk (about 1.7 MB gzip). This is the main initial-load cost; Vite reports a large-chunk warning. It is loaded as an engine chunk. Consider the external-WASM distribution when measuring production startup, rather than hiding the warning.

The first browser check uses headless Chromium with a software GPU. It catches rendering and interaction faults but is not a representative hardware frame-rate benchmark. Desktop GPU measurements and Firefox/Safari checks remain open. The narrow layout avoids overflow; touch play is not implemented.

## Next combat slice

Add a single hostile firing lane with a telegraphed burst, cover, and a retreat route. This will test the intended volley → displacement → regroup loop under pressure. Tune impact strength and recovery against that encounter before adding more weapons or progression.
