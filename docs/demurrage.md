# 09 — Demurrage

The squad returns to the Wharf Cooperative's marine berth at 02:40, after
protecting Birchwater's inspection crew. Gannet has locked the cooperative's
crane controls and is charging for the resulting delay. A missed morning loading
window would let its guarantor invoke a takeover clause. The crew restores the
cooperative's ability to work and preserves the contradictory dispatch orders.
These agreements are fictional arrangements in the campaign setting.

## Operation

All three military squad configurations are available. Seven initial security
machines hold the container yard and quay: four pistols, two machine guns and
one glass-cannon rifle lookout on the freighter. The west service-gate approach
starts outside their acquisition range. Containers break long firing lines;
the open cargo aisles let automatic weapons push an advance backwards. The
lookout is on a physical deck above the quay and can be hit with all firearms
from an appropriate firing angle. It holds its post, without trying to navigate
from the ship into the water.

Clear the seven guards, then occupy the painted north and south crane-control
bays simultaneously. They are 36 metres apart. Two distinct surviving robots
must remain on the ground inside their respective bays for a twelve-second
paired restart; operators can brace and fire. Enemy robots within eight metres
of a control interrupt progress. Stepping away pauses rather than erases the
restart. A single robot cannot accumulate progress by alternating consoles.
Losing all but one chassis before restoration fails the contract with an explicit
two-operator requirement; after restoration, a lone survivor can still extract.
The first occupied control announces a three-robot north response; a second
three-robot squad follows through the southern stacks seven seconds later.
Each has a machine gun and two pistols. Responses are finite.

Restoration releases the PORTER work orders, starts the crane spreaders moving,
and turns the quay work lights toward the approaching squads. The squad is free
to regroup immediately. A final machinegun-and-pistol team approaches the west
service gate, making the return a fight through the freight lanes. Defeat all
contract security and assemble surviving robots at the gate to finish. The
response selects a checked alternative entry if a player occupies its authored
arrival. There is no endless wave loop, rearm or mandatory countdown failure.

## Night port

The 204 × 140 metre district reuses the daytime port's freighter, gantries,
container dimensions, buildings, streets and real harbor basin. The daytime
Marine Port remains unchanged under Practice / debug. Demurrage is also an
Endless Arena floor, with its night scenery and ordinary wave controller but
without contract guards or restart objectives.

The night-shift PORTER jobs wait at the outer loading banks, away from the first
firing lanes. They carry their existing physical totes and resume the same jobs
after the restart. CARTs, CRATEs and KITE remain present; harm to civilians still
calls WATCH security. The team's service van is parked outside the street and
does not report friendly damage as an unrelated civilian incident.

Quay floodlights, a shielded deck light, the gate lamp, the service van's
headlights and combat flashes share the world-space night acquisition rules.
Only one additional spotlight casts shadows. Enemies remain scene-lit models;
night has no luminous enemy telemetry or camera-occlusion outlines. Camera
position cannot grant automatic contacts. Taking the controls changes both the
rendered lighting and the optical acquisition cones.

The harbor bed remains six metres below the surface. Knockback can push a robot
off the ship or quay; a fully submerged chassis is disabled, preventing an
underwater security machine from trapping mission completion. Corpses retain
the existing pushable, preferred-resting-pose physics.

## Verification

Bounded default tests cover deployment, safe starting separation, concurrent
operators, enemy interruption, finite arrivals, blocked-entry alternatives,
loader resumption, light redirection, the elevated rifle post, real rifle hits,
submersion, failure and recovery. Full playthrough replay files belong in
`docs/replays/` and remain excluded from the automated pipeline.
