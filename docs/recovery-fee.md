# Recovery Fee — convoy interception

Contract **06**, after Priority Access. All three squad configurations remain
available. This is the first authored encounter with enemy machine guns.

## Assignment

Gannet is transporting the freight cooperative's seized charging racks and
replacement drive assemblies out of the district. The squad intercepts the
convoy, defeats its finite security detail and secures the load for collection.
Morrow accepts the recovery contract; Vale reports the route and its progress;
Rook identifies the machine-gun threat; Sable confirms physical immobilisation.
Quill's debrief discovery connects the seizure to a sale signed beforehand, with
an extra payment for delivery that day.

## District

A **196 × 132 metre** industrial district uses shared buildings, street paving,
vehicle models and raised walking surfaces. The road goes east from the parts
depot, turns south through the workshop junction, then east out of the district.
Both bends use intermediate steering points. The road continues beyond the
failure line, so the scout never parks across the cargo truck's exit.

The squad deploys in a sheltered maintenance yard. Solid walls and a workshop
screen the starting position; the eastern opening reaches the service lane.
A **4.8 metre** pedestrian crossing passes over the western road. Both ramps
connect it to street level. Ground orders stay below the open span. Concrete
supports clear the traffic lane and the truck's roof. Tall equipment and
buildings give dependable cover; two parked civilian cars can be destroyed.
Nearby CARTs continue their workshop meal route and react to gunfire. There
are no unrelated traffic loops in the convoy road.

## Encounter

1. **Intercept.** The scout CAB, sand-coloured TRUCK and red security VAN wait
   during briefing and for twelve seconds after deployment. They then follow
   the dogleg at 2.6 m/s. The truck takes approximately ninety seconds to reach
   its exit after moving, leaving time for relocation. Road chevrons indicate
   its route until it is stopped. Vale reports movement and both turns.
2. **Stop and secure.** A visible opponent or damage to any convoy vehicle
   stops the scout/security van and deploys exactly five ground robots: two
   machinegunners and three pistol units. The cargo truck keeps driving.
   Machinegunners seek separate positions and brace when firing; pistols
   approach the squad. Machine guns fire 0.42-second bursts at a 2.4-second
   cadence. Ordinary sight, range, recoil, stagger, ammunition and navigation
   apply. No enemy grenades, heavy weapons or reinforcement waves.
3. **Recover.** Once the truck is immobilised and all five guards defeated,
   bring a living robot within six metres on ground level. The cooperative's
   recovery van approaches through the workshop yard. Every surviving squad
   robot must then reach the off-street pickup bay.

## Physical vehicle disabling

The reusable TRUCK has a 900-point hull and a 120-point drive. Weapon/blast
damage reduces both. Hits below 0.95 m damage its drive twice as efficiently.
A rifle hit or sustained automatic fire can disable it without destroying the
load. No specialist weapon is required. The HUD shows drive integrity while
intercepting; braking lamps, hazards, the roof beacon and Sable's confirmation
mark immobilisation. The controller cannot restart a disabled drive.

A disabled truck remains a dynamic physical body and a navigation obstacle.
Its conservative footprint follows translation, rotation and elevation;
robots route around it, including after an impact. Further damage destroys
the hull and triggers the ordinary vehicle explosion. The resulting wreck
can still be secured for **salvage**, with visibly scattered assemblies and a
different debrief. Destruction is a poorer result, rather than an immediate
restart. An operational truck leaving the east boundary or loss of the whole
player squad fails the contract.

Convoy vehicles have an explicit enemy affiliation. Shooting or blasting them
does not summon civilian defence; harming civilian cars/CARTs still does.
Enemy automatic fire cannot damage its own convoy. Physical vehicle hulls
still block enemy sight and bullets. Existing player rifle/grenade friendly
fire remains enabled.

## Inspection and replays

`window.amortization2.inspect().mission` exposes convoy IDs and positions,
truck hull/drive integrity, movement state, engagement/disable/capture times,
guard count, load condition and escape result. The existing development
recorder/viewer supports the new range, moving vehicles and security deployment.
Attack reports persist in simulation state; they do not depend on retained
presentation events, which the renderer drains each frame.

Tests cover briefing/squad choice, safe deployment, the full truck footprint
through both turns, escape, drive permanence, disembarkation along the route,
actual enemy bursts, civilian affiliation, stopped-truck navigation, elevated
and ground routes, intact/salvage completion and deterministic replay playback.
