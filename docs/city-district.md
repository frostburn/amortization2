# City district

A city should feel large through connected streets, repeated architecture, movement and responses. Playable missions can occupy a small district in real-world dimensions. This first district is 120 × 104 metres (about 1.25 hectares), with a central intersection, four building groups, perimeter streets and adjacent skyline blocks. The roads continue beyond the playable area. It is an activity sandbox, without a campaign objective or enemy wave controller.

## Play

Choose **CITY DISTRICT** in either combat-floor selector. The squad begins selected at the intersection. Sixteen CARTs make local and cross-town deliveries. Walk alongside them, occupy a delivery lane, fire nearby or throw a grenade to see their responses. Ordinary squad controls, specialist loadouts and sniping remain available. **Shift+R / Reset district** restores the fleet, cargo visits and squad.

CART is a small commercial six-wheeler: a roughly 0.8 m-wide, 0.94 m-long hull, 0.62 m high, with a mast. Prototype tuning uses 35 kg, 36 integrity and 1.6 m/s cruising speed. A CART slows for turns, yields to nearby hulls and observes alternating crossing signals. Stops at shops and homes open its lid. Blocked routes can reverse along their existing loop rather than repeatedly invoking squad pathfinding.

Nearby shots interrupt deliveries. CARTs brake briefly and choose a direction away from the disturbance along their known route. Nearby shop shutters close. Local service resumes after a quiet period; unaffected streets keep working. Bullet hits lift and tumble the lightweight chassis; exposed grenades launch them several metres. Steering and upright rotation control disengage during impacts. A surviving CART resumes its route only after it settles on its wheels with a clear route connection; tipped hulls remain stranded. Disabled hulls can still be knocked around by further fire or explosions. Bullets and exposed blasts hit neutral hulls, but civilian damage contributes no hostile accuracy, grenade-hit or kill credit. Tall building hulls block shots and blast exposure. Empty-ground automatic aim remains above low CARTs; hovering a CART explicitly aims at its hull.

Motor whirrs are synthesized locally with two quiet oscillator components per moving voice. The pause menu has an independent **Civilian motors** mix slider, saved with other preferences; it defaults to 40% of the original motor level and can silence them without changing weapon sounds. At most six nearby CART motors play, with speed-dependent pitch, panning and distance attenuation. Pause, floor changes, resets and disabled/stopped/tumbling carts release voices. There are no new downloaded samples or runtime services.

## Reusable construction

- `src/game/city.ts` owns the district data, building kit, transforms, road/sidewalk segments, crossing junctions, street-furniture footprints and delivery routes. It contains no renderer or physics dependencies. `buildingSolid()` derives collision and navigation from the same dimensions and quarter-turn transform used to place the visual prefab.
- `src/render/city.ts` constructs shops, apartments, offices and workshops from reusable window bays, doors, awnings, roof equipment and shutters. Exterior facade panels surround actual openings, without redundant interior faces; recessed panes and frame rings replace overlapping boxes and duplicate storefront/door windows. Rigid geometry is batched by material within each building; adjacent scenery shares materials and batches across buildings. A building uses multisample coverage to fade when it hides selected squad members, retaining depth writes and avoiding transparent facade sorting artifacts (with ordinary blending when antialiasing is unavailable); its physical hull remains solid. Scope mode restores full opacity. Adjacent buildings are solid scenery beyond the movement boundary.
- `src/game/civilians.ts` owns CART bodies, delivery state, crossing policy, yielding, local alerts and damage. It is separate from armed actors and arena AI. Routes and service-stop IDs are district data rather than per-instance scripts.
- `src/render/carts.ts` instances the fleet's rigid components, six wheels, lights and independently animated lids. More instances do not add one draw call per wheel. Physics transforms interpolate normally, including tumbling and disabled hull rotation.
- `src/render/primitives.ts` provides simple building blocks and rigid-part batching usable by later civilian and environment prefabs.

The first district keeps building interiors closed. Facades are real solids, not traversable painted scenery. Pavement lips are shallow visual dressing on a shared collision floor; tall fixtures, benches, planters and building hulls have navigation/collision footprints. Fleet motion does not use the squad's grid search. Temporary live CARTs yield rather than becoming permanent pathfinding obstacles.

## Extending toward missions

Author additional districts with the same prefab and footprint vocabulary. Put objectives, entrances and civilian activity on district data rather than inside a renderer. Vary routes, fleet density, service stops, finishes, building transforms and delivery timing. Use a few active adjacent streets to suggest the larger city; do not simulate kilometres of invisible traffic.

Place skyline buildings in parcels between continuing streets. Keep their hulls off the carriageways and sidewalks, and allow space for awnings and roof trim between neighbours. The district's northern scenery uses two rows; its western pairs face their nearest cross streets.

Later work can add road vehicles, charging docks, parcel aircraft and other civilian chassis. Keep their policies local and bounded: near combat, cancel tasks and suspend affected services; elsewhere, maintain normal activity. Reopening shops, maintenance visits and rerouted deliveries should show recovery after the player's activity. Avoid mission-status prose hovering over every machine.

`window.amortization2.inspect().city` reports positions, route destinations, deliveries, distance travelled, state, crossing phase and closed shops for QA. The sandbox is deterministic at the fixed simulation timestep. Inspectors do not issue movement or damage commands.
