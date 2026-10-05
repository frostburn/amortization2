# Amortization II — Futures Contract

A desktop browser real-time tactics prototype about controlling a squad of machines. The first playable space is **Proving Ground**, a three-lane combat range for testing machine-gun fire, physical displacement, and thrown grenades.

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

Four robots can move and fire together. Bracing improves control and reduces knockback. Targets and loose crates react physically; disabled robots topple and settle as single rigid bodies. Range supplies are unlimited. Reset restores targets, squad integrity, ammunition, and drill progress.

Four selected robots default to a 2 × 2 square; three form an equilateral triangle. Both use 2.2 metres between corners. Numbered ground markers show the assigned destinations and stay visible while the group moves. The formation shifts as a whole near cover, targets, and yard edges. Robots follow clear segments between route corners and pass or yield to nearby units without rebuilding their route around teammates. Shift + right drag previews the queued formation in amber before release commits it. Two robots use a line.

## Controls

| Input                       | Action                                                                        |
| --------------------------- | ----------------------------------------------------------------------------- |
| Hold left mouse             | Fire the machine gun                                                          |
| Left click in grenade mode  | Throw from the next ready selected robot (round-robin)                        |
| Right click / drag          | Move selected robots / continuously steer their destination                   |
| Shift + right click / drag  | Queue one move at the release point                                           |
| 1–4 / click a robot         | Select a robot                                                                |
| Shift + left drag           | Select the living robots inside the box; an empty box keeps the current group |
| Shift + 1–4 / Shift + click | Add or remove a robot from selection                                          |
| 5 / ALL                     | Select the living squad                                                       |
| Q / G                       | Machine gun / grenade                                                         |
| R                           | Reload selected robots                                                        |
| Hold Space                  | Brace; release to resume a pending move                                       |
| WASD / middle drag          | Pan camera                                                                    |
| Mouse wheel                 | Zoom                                                                          |
| F                           | Centre camera toward the selected robot                                       |
| Escape / ?                  | Pause, controls, volume, and reduced motion                                   |
| Shift + R / Reset range     | Restore the entire range                                                      |
| Ctrl + left mouse           | Force fire when the cursor is over a squad member                             |

The game pauses on focus loss. Sound and motion preferences are saved locally. Explosions can damage the squad; concrete also protects it. Machine-gun accuracy counts hits on living targets and excludes grenade hits. Destroying a drill target with the wrong weapon requires a reset before that drill can be completed. Shift-drag selection never fires or throws, including in grenade mode; ordinary left-button firing works while right-drag steering.

## Sound

The supplied qubodup recordings drive the machine-gun attack, looping sustain, release, and grenade blast. The simulation cadence matches the ten-shot loop. Web Audio adds quiet impact details and a short low-frequency blast layer, with stereo placement, voice normalization, master volume, and compression. No external synthesizer or service is required to run the game.

See [CREDITS.md](CREDITS.md) for sample provenance and licenses. The original files and their included license manifest are preserved in `sounds/`.

## Development

TypeScript + Vite, Three.js rendering, Rapier physics, native DOM controls, and Web Audio. No backend is required.

- [Range design and implementation](docs/proving-ground.md)
- [Visual direction](docs/art-direction.md)

In the browser console, `window.amortization2.inspect()` returns current state, `project({ x, y, z })` maps a world point to the screen, and `exportReport()` returns a JSON bug report. These are inspection helpers, not a save game or replay format.

This is a combat test range, not yet a campaign: hostile AI, missions, progression, multiplayer, controller support, and mobile controls remain future work. Visuals are deliberately economical 3D models. Hardware performance and Firefox/Safari audio still need testing beyond the Chromium smoke test.

Code is [MIT licensed](LICENSE). Asset licensing is documented separately in the credits.
