# Amortization II — Futures Contract

A desktop browser real-time tactics prototype about controlling a squad of machines. **Proving Ground** tests machine-gun fire, physical displacement, and thrown grenades. **Long Range** is a horizontal 30 / 60 / 90 metre lane for the fragile NEEDLE sniper model.

## Run locally

Use Node.js 24 and npm.

```sh
npm ci
npm run dev
```

Open the URL Vite prints, then select **Enter range** to start and enable sound. Keyboard and mouse are recommended. The renderer requires WebGL 2 and WebAssembly.

```sh
npm test            # headless tests against the actual physics simulation
npm run build      # TypeScript checks and a static production build
npm run preview    # serve the production build locally
```

The `dist/` directory is self-contained and uses relative asset URLs. Serve it over HTTP(S); opening `index.html` as a local file will not work. To share a development server on a trusted network, use `npm run dev -- --host 0.0.0.0`.

## Proving Ground

- **Ballistics:** clear six orange plate targets with the machine gun. Sustained fire has recoil, spread, a 90-round magazine, and a 2.2-second reload.
- **Displacement:** push either of the two orange robot targets at least two metres. Impacts impart real momentum; aim follows the target under the cursor. A moving plate offers additional tracking practice.
- **Fragments:** throw a grenade into the three-target bay behind the concrete barrier. The arc shows the first collision, not a guaranteed final resting place. Grenades bounce and explode after 2.4 seconds; cover blocks blast pressure. Each robot rearms for four seconds after throwing. Clicks cycle through selected, living robots whose grenades are ready; the arc follows the next thrower. A click while all selected robots are rearming does nothing and is not queued.

The squad has three assault robots and one light sniper, NEEDLE (4). A weapon order fires the selected robots equipped for that weapon; everyone can throw grenades. Bracing improves control and reduces knockback. Targets and loose crates react physically; disabled robots topple and settle as single rigid bodies. Range supplies are unlimited. Reset restores targets, squad integrity, ammunition, and drill progress.

Four selected robots default to a 2 × 2 square; three form an equilateral triangle. Both use 2.2 metres between corners. Numbered ground markers show the assigned destinations and stay visible while the group moves. The formation shifts as a whole near cover, targets, and yard edges. Robots follow clear segments between route corners and pass or yield to nearby units without rebuilding their route around teammates. Shift + right drag previews the queued formation in amber before release commits it. Two robots use a line.

## Long Range

Choose **Long Range** in the entry menu or the header. NEEDLE has **64 integrity and a 48 kg chassis**, compared with an assault robot's 160 integrity / 90 kg. Its rifle deals 140 damage, reaches 140 m, cycles every 1.4 s, and reloads a five-round magazine in 3 s. Press **Space** to toggle braced first-person sniping. Support stays engaged after key release, and aim settles in 0.6 s. Firing unbraced from the overhead view produces wide sway, heavy backward recoil, and a loss of stability.

Use the **30 / 60 / 90 m** sight buttons to find a target before entering sniping. The rifle view fills the field at any overhead zoom. Move the mouse to turn and aim through the centred scope in both axes, adjust magnification with the wheel, and fire with LMB. The mouse is captured so aiming continues beyond screen edges. If capture is unavailable, mouse movement still turns the view and holding the pointer near an edge keeps turning. **Invert X axis** and **Invert Y axis** in the controls menu reverse either axis independently and persist across reloads. The reticle shows the rifle's actual shot impact, including sway, and turns mint when settled. **Space**, **RMB**, or **Escape** returns to the previous overhead camera. Selecting another robot, changing weapons, pausing, or resetting also releases sniping.

The 30 m target stands on the ground; the 60 and 90 m targets stand on solid **2 m and 5 m platforms**. Aim at the elevated silhouette: the rifle's muzzle, sight and shot all account for height, and shots aimed too low hit the platform. Rifle kills on all three targets complete the drill; cover still blocks shots.

## Controls

| Input                       | Action                                                                         |
| --------------------------- | ------------------------------------------------------------------------------ |
| Hold left mouse             | Fire the selected gun or rifle                                                 |
| Left click in grenade mode  | Throw from the next ready selected robot (round-robin)                         |
| Right click / drag          | Move selected robots / continuously steer; in sniping, return overhead         |
| Shift + right click / drag  | Queue one move at the release point                                            |
| 1–4 / click a robot         | Select a robot                                                                 |
| Shift + left drag           | Select the living robots inside the box; an empty box keeps the current group  |
| Shift + 1–4 / Shift + click | Add or remove a robot from selection                                           |
| 5 / ALL                     | Select the living squad                                                        |
| Q / E / G                   | Machine gun / sniper rifle / grenade                                           |
| R                           | Reload selected robots                                                         |
| Space with the rifle        | Toggle braced first-person sniping                                             |
| Hold Space with machine gun | Brace; release to resume a pending move                                        |
| WASD / middle drag          | Pan the overhead view                                                          |
| Mouse wheel                 | Zoom overhead / adjust scope magnification                                     |
| F                           | Centre camera toward the selected robot                                        |
| Escape / ?                  | Escape leaves sniping first; otherwise pause and open controls / settings       |
| Shift + R / Reset range     | Restore the entire range                                                       |
| Ctrl + left mouse           | Force fire when the cursor is over a squad member                              |

The game pauses on focus loss. Sound, motion and aiming preferences are saved locally. Explosions can damage the squad; concrete also protects it. Gun/rifle accuracy counts hits on living targets and excludes grenade hits. Destroying a drill target with the wrong weapon requires a reset before that drill can be completed. Shift-drag selection never fires or throws, including in grenade mode; ordinary left-button firing works while right-drag steering.

## Sound

The supplied qubodup recordings drive the machine-gun attack, looping sustain, release, grenade blast, and rifle reload. Rifle shots blend the sharp post recording near the camera with the field recording at distance; panning follows the active camera, and overhead zoom moves the listening position. First-person sniping hears the close recording from the robot's eye position. The simulation cadence matches the ten-shot machine-gun loop. Web Audio adds quiet impact details and a short low-frequency blast layer, with voice normalization, master volume, and compression. No external synthesizer or service is required to run the game.

See [CREDITS.md](CREDITS.md) for sample provenance and licenses. The original files and their included license manifest are preserved in `sounds/`.

## Development

TypeScript + Vite, Three.js rendering, Rapier physics, native DOM controls, and Web Audio. No backend is required.

- [Range design and implementation](docs/proving-ground.md)
- [Sniper model, scope, and long range](docs/sniper-range.md)
- [Visual direction](docs/art-direction.md)

In the browser console, `window.amortization2.inspect()` returns current state, `project({ x, y, z })` maps a world point to the screen, and `exportReport()` returns a JSON bug report. These are inspection helpers, not a save game or replay format.

This is a combat test range, not yet a campaign: hostile AI, missions, progression, multiplayer, controller support, and mobile controls remain future work. Visuals are deliberately economical 3D models. Hardware performance and Firefox/Safari audio still need testing beyond the Chromium smoke test.

Code is [MIT licensed](LICENSE). Asset licensing is documented separately in the credits.
