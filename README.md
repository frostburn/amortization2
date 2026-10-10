# Amortization II — Futures Contract

A desktop browser real-time tactics game about controlling a squad of machines. The first playable contract, **Receiving**, is a low-stakes, pistols-only job at a cooperative's pickup yard: clear four guards, release the cargo and return to the service van. Morrow and Vale introduce the operation using the returning cast's portraits. The existing ranges, endless arena and city/port sandboxes remain under **Practice / debug**.

The overhead view is true isometric: 45° yaw, 35.3° elevation, and world axes projected at 120°. Wider maps and a lower default zoom give the squad more room to manoeuvre. Automatic fire centres on **herding**: track an opponent to push it out of cover, change firing angle to redirect it, and regroup during a reload. Hits briefly stagger robots, interrupting walking and firing while physical knockback continues. Orders resume after recovery, and robots can return fire between staggers. **Bracing recovers 2.5× faster.** Torso jolts, bright ground rings and squad-card status show the reaction. See [camera and kinetic combat tuning](docs/combat-feel.md).

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints, then select **Deploy squad** to start the contract and enable sound, or choose a practice floor. Keyboard and mouse are recommended. The renderer requires WebGL 2 and WebAssembly.

```sh
npm test            # headless tests against the actual physics simulation
npm run build      # TypeScript checks and a static production build
npm run preview    # serve the production build locally
```

The `dist/` directory is self-contained and uses relative asset URLs. Serve it over HTTP(S); opening `index.html` as a local file will not work. To share a development server on a trusted network, use `npm run dev -- --host 0.0.0.0`.

## Receiving

Four basic chassis carry pistols; heavy equipment is unavailable for this job. Clear the four guards, keep a robot on the yellow dispatch pad for two seconds to release the cargo, then bring every surviving squad member back to the van. PORTER work resumes after release. There are no reinforcements, timed failure or objective refits. Losing the squad triggers recovery; completing the return opens Morrow's debrief. **Replay contract** deploys a fresh squad; **Shift+R** restores the briefing. Debug squad preferences stay available in the ranges. See [the first mission](docs/first-mission.md).

## Crossing

**02 · Crossing** continues with the fixed four-pistol squad. A canal footbridge carries one robot at a time. Select covering robots, press **C**, then click a direction: they hold, brace, watch that sector and fire at visible hostiles. **X** ceases fire; moving replaces their cover order. Selection changes preserve it. Three far-bank guards overwhelm an unsupported crossing. The last robot entering the bridge trips an alarm and calls three west-bank pursuers; reverse the far-bank cover, then bring every survivor to the van. Group movement queues on dry bank slots and reforms on arrival. Physical overload can collapse the bridge. See [Crossing and covering orders](docs/crossing.md).

## Handling

**03 · Handling** teaches hauling with the fixed pistol squad. Select robots and press **H** (or the box icon) to collect cargo; RMB moves the team, and H puts it down. Deliver a one-robot return box to open the guarded service hall, eliminate its three guards, then recover a heavy tool chest with two robots. Carriers cannot shoot, so keep the other pistols defending. Inventory drones arrive while cargo is carried; setting it down pauses new waves. The entire surviving squad must return to the van. See [Handling and physical cargo](docs/handling.md).

## Release

**04 · Release** is a pistols-only rescue and escort. Enter Gannet's street-corner records office through its front lobby, fight through reception and the archive, and reach **Ren Quill**. He follows a robot at walking pace; click him or press **H** to wait, resume or change guides. He unlocks the rear staff exit. Cover the east street against a fresh four-robot squad, then withdraw through the rear alley to the back-street van. Quill has his own health, and both he and every surviving chassis must reach the van. Handling's debrief offers this next contract; it is also available in the deployment selector. See [Release and human escorts](docs/escort.md).

## Proving Ground

- **Ballistics:** clear six orange plate targets with the machine gun or minigun. Sustained fire has recoil, spread, a 90-round magazine, and a 2.2-second reload.
- **Displacement:** push either of the two orange robot targets at least two metres. Impacts impart real momentum; aim follows the target under the cursor. A moving plate offers additional tracking practice.
- **Fragments:** throw a grenade into the three-target bay behind the concrete barrier. The arc shows the first collision, not a guaranteed final resting place. Grenades bounce and explode after 2.4 seconds; cover blocks blast pressure. Each assault robot rearms for four seconds after throwing. Clicks cycle through selected, living assault robots whose grenades are ready; the arc follows the next thrower. A click while all selected robots are rearming does nothing and is not queued.

Before firing, firearm barrels pitch toward the aim. A crosshair marks the actual aim height, a vertical stem connects it to its ground projection, and thin guides run from eligible robots to the first obstruction or weapon range limit. Machine guns and miniguns default to upper-body height, clearing small arena barriers even when aiming at empty ground. Hovering the lower body keeps that upper-body line; elevated silhouettes preserve their height. Tall cover still blocks shots. The firearm hint shows raised or lowered aim relative to the robot’s shoulder. These guides show the nominal direction before bullet spread.

Choose a **sniper, twin-minigun or machine-gun squad** in the entry menu or header; changing the configuration restarts the combat floor. The sniper squad has ANCHOR, BREECH and LATCH as assault robots, plus NEEDLE. The twin-minigun squad replaces BREECH (2) with ROOK and robot 4 with SPINDLE, both heavy minigunners, leaving ANCHOR and LATCH as assault robots. The machine-gun squad has four assault robots, including BREECH (2) and BOLT (4). The choice persists across ranges, resets and browser reloads. Assault robots carry machine guns and grenades; NEEDLE carries a rifle and pistol; ROOK and SPINDLE carry miniguns in the twin-minigun configuration. Neither specialist carries grenades. Q selects automatic weapons or the pistol and cycles machine gun/pistol with NEEDLE in a mixed selection. Selected assault robots and minigunners fire their own automatic weapons together on LMB, each with its own magazine and timing. Bracing improves control and reduces knockback. Targets and loose crates react physically; disabled robots topple and settle as single rigid bodies. Range supplies are unlimited. Reset restores targets, squad integrity, ammunition, and drill progress.

Four selected robots default to a 2 × 2 square; three form an equilateral triangle. Both use 2.2 metres between corners. Numbered ground markers show the assigned destinations and stay visible while the group moves. The formation shifts as a whole near cover, targets, and yard edges. Robots follow clear segments between route corners and pass or yield to nearby units without rebuilding their route around teammates. Shift + right drag previews the queued formation in amber before release commits it. Two robots use a line.

## Minigun

ROOK and SPINDLE each have a heavy **200-integrity / 130 kg chassis**, a visibly rotating six-barrel gun and a 240-round belt. Hold LMB through a **0.5 s wind-up** to fire **30 rounds/s** at up to 65 m, with 6 damage per round and a 3.8 s reload. At full speed each delivers roughly **2.1× the damage and 2.9× the bullet pressure** of a machine gun, with a higher momentum limit to drive advancing robots backward. Release stops bullets immediately; the motor coasts for 0.7 s from full speed. Repress during the coast to wind up faster. Hold Space to brace and control recoil. Both minigunners walk at 3.2 m/s, reduced to 1.9 m/s while winding or firing. Each survivor receives a full 240-round refit between arena waves. See [the minigun design and audio recipe](docs/minigun.md).

## Long Range

Choose **Long Range** and **NEEDLE** as robot 4 for the precision drill. NEEDLE has **64 integrity and a 48 kg chassis**, compared with an assault robot's 160 integrity / 90 kg. Its pistol has a separate 12-round magazine, 22 damage, 28 m reach, a 0.35 s firing interval and a 1.6 s reload. Switching weapons preserves each magazine and lets an ongoing reload finish. Its rifle deals 140 damage, reaches 140 m, cycles every 1.4 s, and reloads a five-round magazine in 3 s. Press **Space** to toggle braced first-person sniping. Support stays engaged after key release, and aim settles in 0.6 s. Firing unbraced from the overhead view produces wide sway, heavy backward recoil, and a loss of stability.

Use the **30 / 60 / 90 m** sight buttons to find a target before entering sniping. The rifle view fills the field at any overhead zoom. Move the mouse to turn and aim through the centred scope in both axes, adjust magnification with the wheel, and fire with LMB. The mouse is captured so aiming continues beyond screen edges. If capture is unavailable, mouse movement still turns the view and holding the pointer near an edge keeps turning. **Invert X axis** and **Invert Y axis** in the controls menu reverse either axis independently and persist across reloads. The scope crosshair is etched at the optical centre: target distance, cover, recoil and shot spread never move it. It turns mint when settled; unsteady shots can still deviate around the sight line. **Space**, **RMB**, or **Escape** returns to the previous overhead camera. Selecting another robot, changing weapons, pausing, or resetting also releases sniping.

While you snipe, the other living squad members **continue their movement orders and provide automatic cover fire**, including unselected robots. They acquire visible enemies, fire short bursts with their equipped weapons and reload when needed. Movement and queued destinations stay active; firing uses the normal slower walking speed and moving-shot spread. Idle robots stay at their assigned positions. They can aim above low cover, but never chase enemies or fire at practice targets. Their own aim and accuracy counters are separate from yours. Allies remain visible in the scope because they can intercept rifle shots. The scope reports how many robots are covering; their squad cards show **COVER**. Leaving sniper mode stops automatic fire without changing teammates’ movement orders or stance.

The 30 m target stands on the ground; the 60 and 90 m targets stand on solid **2 m and 5 m platforms**. Aim at the elevated silhouette: the rifle's muzzle, sight and shot all account for height, and shots aimed too low hit the platform. Rifle kills on all three targets complete the drill; cover still blocks shots.

## Endless Arena

Choose **Endless Arena** in the entry menu or header. The whole squad starts selected in a square. Four marked entrances and a four-second warning precede the first three-robot assault squad. Clearing a wave gives surviving robots full integrity and ammunition, followed by a six-second warning for the next entrances. Disabled squad members stay down until **Shift+R** or **Restart arena** restores the whole squad.

Enemy squads enter, acquire targets and move around blocked sight lines. **Waves 1–2 never brace**, making them easier to stagger and herd. Wave 3 introduces braced firing positions and fragile enemy snipers with the same rifle/pistol loadout as NEEDLE. Robots can return fire while sliding between staggers. Automatic aim clears low cover by default; tall cover needs a flank. From wave 4, assault robots lob grenades at clustered targets; orange ground rings and an incoming warning identify live enemy grenades. Cover blocks shots and blast pressure, and live explosives must resolve before the wave ends.

Each wave adds robots up to three four-member squads, then continues indefinitely. Entrances rotate and avoid nearby survivors when the warning is planned; occupied entrance slots shift before spawning. Enemy attacks become more frequent in later waves. The HUD shows wave, remaining hostiles, total disabled hostiles and surviving squad members. Enemy shots do not count toward the player's accuracy. The arena remains an independent combat sandbox with no mission objective or ammunition economy.

## City district

Choose **City District** for a 234 × 147 metre urban sandbox. Twenty six-wheel CARTs circulate between shops and homes; five heavier **CRATE** parcel cabinets serve the depot, station hall, canal library and apartments, opening one of three compartments per visit. Both chassis yield to the squad and one another. Pan east for a shallow canal with two paved crossings, stone banks, quay furniture and a pump house; ground orders use the crossings. Nearby gunfire interrupts collection and closes local shop shutters; activity resumes after quiet. Hits launch and tumble civilian hulls, including wrecks, with CRATE's greater mass resisting bullet pressure. Their quiet motor mix is independently adjustable in the pause menu. Buildings, streets, paving and canals use reusable geometry and shared collision/navigation data. The district has no mission or scheduled enemy waves. Damage to civilians calls airborne WATCH security; continued attacks escalate the response. See [city construction and behavior](docs/city-district.md) and [the civilian cast through 2040](docs/civilian-robots.md).

## Raised concourse

Choose **Raised Concourse** under **Practice / debug** for a 120 × 98 metre district with a pedestrian loop at **4.8 m and 8.4 m**. Broad ramps connect its terraces, a bridge crosses the working street, and a second gallery gives the block a layered isometric silhouette. Right-click raised paving to order the squad onto that surface; markers and aim guides follow its elevation. Street orders can pass beneath the bridge. Orange targets at ground, bridge and gallery height let you test cross-level fire and grenades. CART deliveries and cars continue on the streets below. There is no contract or scheduled combat wave. See [raised surfaces and navigation](docs/raised-concourse.md).

## Marine port

Choose **Marine Port** for a 204 × 140 metre cargo district with warehouses, stacked intermodal containers, two quay gantries and a moored coastal freighter. Four **PORTER** working bipeds lift and carry physical totes between loading stands, alongside CART, CRATE and KITE traffic. Nearby gunfire makes them steady their loads and withdraw; hits release the cargo and tumble their heavy hulls. Their quiet servos and foot contacts share the **Civilian motors** mix. Clear access lanes and water-aware navigation keep movement on the quay; loose cargo knocked into the harbor sinks. Buildings, containers, loading stations and port props are reusable. Attacking civilian workers, cars or aircraft calls WATCH drones; shooting a held tote out of PORTER’s hands also counts. See [Marine port and PORTER](docs/marine-port.md).

WATCH security responds to actual player damage to civilian robots and vehicles in City District, Marine Port and Receiving. A pair of guarded quadrotors arrives after a short dispatch delay and descends over clear ground. Each carries a pistol; weapons can stagger, push and destroy it, and sniper support fire recognises it as hostile. Continuing damage draws additional pairs, up to six active drones. After 26 seconds without further civilian/security attacks, survivors stop firing and climb out. Rotor noise and dispatch chirps use the existing sound mix. See [security response](docs/security-response.md).

## Controls

| Input                       | Action                                                                         |
| --------------------------- | ------------------------------------------------------------------------------ |
| Hold left mouse             | Fire selected automatic weapons, pistol or rifle                                                 |
| Left click in grenade mode  | Throw from the next ready selected assault robot (round-robin)                         |
| Right click / drag          | Move selected robots / continuously steer; in sniping, return overhead         |
| Shift + right click / drag  | Queue one move at the release point                                            |
| 1–4 / click a robot         | Select a robot                                                                 |
| Shift + left drag           | Select the living robots inside the box; an empty box keeps the current group  |
| Shift + 1–4 / Shift + click | Add or remove a robot from selection                                           |
| 5 / ALL                     | Select the living squad                                                        |
| Q / E / G                   | Automatic weapons or pistol (cycles with NEEDLE) / sniper rifle / assault grenade                                           |
| C, then LMB / X             | Hold and cover a sector / ceasefire                                             |
| H / box icon                | Collect or put down cargo in Handling; select two robots for the chest           |
| R                           | Reload the selected firearm for eligible robots                                                         |
| Space with the rifle        | Toggle braced first-person sniping                                             |
| Hold Space with automatic weapons/pistol | Brace; release to resume a pending move                                        |
| WASD / middle drag          | Pan the overhead view                                                          |
| Mouse wheel                 | Zoom overhead / adjust scope magnification                                     |
| F                           | Centre camera toward the selected robot                                        |
| Escape / ?                  | Escape leaves sniping first; otherwise pause and open controls / settings       |
| Shift + R / Reset or restart     | Restore the entire combat floor and squad                                                       |
| Ctrl + left mouse           | Force fire when the cursor is over a squad member                              |

Uncheck **Aux labels** in **? → settings** to hide repeated control hints, weapon descriptions, unit role captions and shooting statistics. Painted signs, range distances and elevations, arena entrance names, formation numbers, drill objectives and scope measurements stay visible, along with crosshairs, health, ammunition, readiness meters and arena status. Squad cards always show call signs; ROOK and SPINDLE have broad chassis icons with a drum and three-barrel gun silhouette. The choice persists across ranges, resets and browser reloads.

The game pauses on focus loss. Sound, motion, labels, aiming and squad preferences are saved locally. **Friendly fire is on for grenades and the sniper rifle on both teams:** rifle shots, sight rays and aim guides stop at allied hulls, and grenades damage, suppress and displace anyone in an exposed blast, including the thrower. Machine gun, minigun and pistol shots still pass through allies safely. Concrete protects against shots and blast pressure. Loose props retain their physical reactions. Firearm accuracy counts manual hits on living hostile targets and excludes grenade and automatic cover-fire hits. Destroying a drill target with the wrong weapon requires a reset before that drill can be completed. Shift-drag selection never fires or throws, including in grenade mode; ordinary left-button firing works while right-drag steering.

## Sound

The city has three KITE parcel quadrotors alongside CART and CRATE. Their four-motor flutter is synthesized locally, pans with the camera and fades with distance and rotor shutdown. All three models share the independent **Civilian motors** slider; gunfire retains its own mix. KITE flies marked depot-to-pad delivery routes, waits above occupied pads and aborts collection during nearby combat. Damaged aircraft lose lift and leave physical wrecks. See [City district](docs/city-district.md) and [Civilian roster](docs/civilian-robots.md) for the reusable route and model design.

The supplied soft M4A1 shot (`854226`) stands in for the contract pistols and NEEDLE’s sidearm, played once per shot with its tail intact. It never starts a machine-gun loop. The other supplied qubodup recordings drive the machine-gun attack, looping sustain, release, grenade blast, and rifle reload. Rifle shots blend the sharp post recording near the camera with the field recording at distance; panning follows the active camera, and overhead zoom moves the listening position. First-person sniping hears the close recording from the robot's eye position. The simulation cadence matches the ten-shot machine-gun loop. Enemy machine-gun bursts use the same spatial loops, normalized with friendly voices and attenuated by camera distance. The minigun motor uses olliehahn12's CC0 saw recording: its actual acceleration and coast-down are shortened and lowered in pitch around a steady loop. Repeated M240 reports, dry transients and a low-frequency shot body supply the firing layer. Spin-up, firing start/loop/tail and spin-down follow the real motor and trigger state; cancelled wind-up has no gunfire. Metal bullet impacts use three edited contact recordings, and near-camera bullet passes use the supplied flyby. Impact/flyby voices are rate limited. Web Audio also adds concrete impacts and a short low-frequency blast layer, with voice normalization, master volume, and compression. No external synthesizer or service is required to run the game.

See [CREDITS.md](CREDITS.md) for sample provenance and licenses. The original files and their included license manifest are preserved in `sounds/`.

## Development

TypeScript + Vite, Three.js rendering, Rapier physics, native DOM controls, and Web Audio. No backend is required.

Open **`/model-room.html`** (or **Controls & settings → Model room**) to orbit the original faceless maintenance worker beside the squad, civilian robots and self-driving vehicles. Switch between standing, walking and crouching, inspect the front/back, or use the game's isometric and tactical-scale camera. Models retain their original relative sizes. See [faceless human direction and viewer controls](docs/faceless-humans.md).

- [Range design and implementation](docs/proving-ground.md)
- [Receiving — first playable contract](docs/first-mission.md)
- [Crossing — covering orders](docs/crossing.md)
- [Handling — two-robot cargo and drone defence](docs/handling.md)
- [Isometric camera and kinetic combat](docs/combat-feel.md)
- [Sniper model, scope, and long range](docs/sniper-range.md)
- [Arena waves and enemy combat](docs/arena.md)
- [Squad choice, minigun and edited audio](docs/minigun.md)
- [Visual direction](docs/art-direction.md)
- [Campaign story outline](docs/story.md)
- [Friendly human operations and support cast](docs/friendly-cast.md)
- [Portrait assets, references and generation prompts](docs/story-art.md)

In the browser console, `window.amortization2.inspect()` returns current state, `project({ x, y, z })` maps a world point to the screen, and `exportReport()` returns a JSON bug report. These are current-state inspection helpers. In Vite development mode, **Controls & settings → Export human replay** (also available in the mission debrief) downloads commands and observed combat for the current attempt. **Export all attempts** includes earlier retries from the page session. Use **View replay** to watch it in development with pause, seeking, speed and attempt controls; bundled histories open on the latest attempt. Inspect it with `npm run inspect:replay -- /path/to/replay.json`. See [human replays](docs/human-replays.md) for capture limits and version matching.

Three tutorial contracts now accompany the combat sandboxes. Campaign progression, multiplayer, controller support and mobile controls remain future work. The arena refines live combat; the city district establishes reusable mission scenery and civilian activity. Visuals are deliberately economical 3D models. Hardware performance and Firefox/Safari audio still need testing beyond the Chromium smoke test.

Code is [MIT licensed](LICENSE). Asset licensing is documented separately in the credits.
