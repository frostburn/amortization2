# Marine port and PORTER

Choose **MARINE PORT** in either floor selector. The squad starts in the middle of a working cargo yard: four PORTER bipeds move totes between paired loading stations, four CARTs run local errands, two CRATEs serve the sheds and one KITE links dispatch to the quay. Pan east for the moored coastal freighter and two dockside gantries. Container rows, warehouses, a workshop and a gatehouse surround the access lanes. **Shift+R / Reset port** restores the workforce, physical loads, squad and scenery. The port is a combat sandbox; it has no mission objective or enemy-wave controller.

The playable district measures **204 × 140 metres**. Continuing roads and adjacent freight sheds imply a larger commercial harbor. Standard 20-foot and 40-foot containers measure 6.06 or 12.19 × 2.44 × 2.59 m, with sparse two-high stacks and clear vehicle/cargo aisles. The freighter is 86 m long and 16 m wide. Conventional steel gantries, low retaining walls, bollards, fenders, mooring lines, warehouse rooflights and painted safety edges supply its character. The ship is moored scenery with a solid hull and wheelhouse; boarding, crane operation and vessel traffic are later work.

## PORTER

PORTER is a full-height industrial biped with broad hips, broad feet, exposed joint housings, two mechanical grippers, a small camera head and a visible battery/cooling pack. Its restrained articulated gait, load handling and quiet servos distinguish it from a combat robot. Livery varies by work route; no model name or job status floats over its head.

Prototype tuning: 1.9 m high, 92 kg, 90 integrity, 1.35 m/s empty and 1.05 m/s loaded. A 14 kg tote rests on a 0.7 m loading stand. The worker aligns, grips it with a Rapier fixed joint, lifts over 1.6 seconds, walks it to the other station, lowers and releases it, then pauses before transferring it back. Each route circulates the same tote; no replacement cargo is spawned. The hands follow the joint anchor during the lift. Displaced cargo stays where physics puts it; the worker waits when its assigned tote is out of reach.

Nearby fire cancels the handling phase, steadies an attached load for 0.7 seconds and sends the worker toward the farther safe endpoint at 0.85 m/s. It retains the tote if undamaged and resumes handling after quiet. Shots and exposed grenade pressure release the grip and rotation lock before applying impulse. Loads become ordinary loose props. Survivors only recover after settling upright on dry support; toppled robots remain stranded. Destroyed hulls remain physical. Neutral hits and destruction earn no hostile accuracy or kill credit. Retrieval of disabled small robots remains a later capability.

Joint-motor tones and restrained foot contacts use the existing **Civilian motors** slider, underneath combat sounds. At most four servo voices run; pause, floor changes and reset stop them. No additional licensed audio samples are required.

Dropped totes keep their physical collision hulls. Hovering one aims at its actual surface, including when it rests on its side, so machine guns, miniguns and pistols can push it around; grenades use the normal loose-prop blast physics. Empty-ground aiming still clears low cover. Quay gantries use connected upper/lower truss chords, alternating braces, end posts and cross members. The freighter's navigation mast carries paired radar scanners, a radome, aerials, a service ladder and shielded lights.

## Reuse and navigation

- `src/game/port.ts` authors district data, container dimensions, crane legs and ship collision solids. Existing building prefabs, continuous streets, ground fleets and air corridors are reused.
- `CityDistrict.porterRoutes` supplies cargo endpoints and station orientation. `CargoWorkers` owns neutral biped bodies and a single physical tote per route. Authored clear aisles plus local yielding avoid a new grid search on every worker tick.
- `src/render/port.ts` supplies reusable containers, loading stands, gantries and a freighter. Static parts batch by material. `PorterFleet` renders small articulated rigs and interpolates complete hull rotation when hit; this is restrained rigid-body damage, not a full limb ragdoll.
- Harbor water is excluded from ground navigation. Shared `dryGround` cuts the visible and physical ground at the quay; water covers a submerged bed six metres down. Loads knocked over the edge sink rather than resting on an invisible surface-level floor. The old shallow city canal and its bridges retain their existing behavior.

`window.amortization2.inspect().city.porters` exposes physical position, velocity, integrity, state, load position, grip state, distance and completed transfers for QA. It does not issue movement or damage commands.
