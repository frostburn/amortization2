# Priority Access — first armed contract

Contract **05**, after Release. Choose the sniper, twin-minigun or four-machinegun
squad in the briefing. Deployment locks that choice; Shift+R returns to the
briefing. The four earlier contracts remain pistols-only. All practice ranges
remain available independently.

## Assignment

Gannet's recovery contractor has occupied a neighbourhood exchange and seized
the independent owners' dispatch equipment. Quill's recovered records
establish ownership. Morrow accepts the owners' request to stop removal, admit
their service crew and hold access until dispatch works again. Rook prepares
the chosen configuration; Vale supplies observations from local contacts.
Sable confirms the restored connection. Meridian's subsequent offer attaches
control of dispatch to its promised priority access.

## District and approaches

The playable district is **180 × 140 metres**. Apartment and workshop parcels
surround a windowless exchange, its service yard and a pedestrian concourse.
Traffic uses connected perimeter streets; deliveries cross the southern square.

- The broad frontage supports sustained fire and bullet herding.
- A **4.8 m** concourse gives useful cross-level fire and sniper positions.
- A service lane passes underneath the bridge and high ramp sections.
- Four 1:5 ramps provide access from both ends. Filled lower sections establish
  ascent; open upper sections leave vehicle clearance above the driveway.

Roads, civilian fleets, buildings, equipment cases and raised paths use reusable
systems. The exchange is a building-kit prefab with opaque equipment walls,
intake grilles and roof condensers. The two flight cases are dynamic physics
props, rather than immovable scenery. As elsewhere, ground orders on an open
deck stay underneath; orders from upstairs retain the current floor. Use a
ramp's filled base to begin climbing.

## Encounter sequence

1. **Break the perimeter.** Two mobile street guards, two braced yard posts and
   two braced concourse posts cover different approaches. All six carry pistols.
   The street patrol starts off the public road with a ten-metre pursuit limit;
   deployment lies beyond its notice and firing range. There is time to orient
   and move out before engaging. The guards fire single shots at a 2.2-second
   cadence, with ordinary recoil, stagger, ammunition and physical navigation.
2. **Secure the equipment.** Hold a ground-level robot beside the yellow
   contractor van for a second to reclaim its load. This can happen during the
   perimeter fight. The van stays in the loading bay, leaving the technicians'
   arrival lane clear. There is no removal timer or gate drive. A wrecked van
   still leaves the equipment recoverable at its position, with ordinary
   collateral/security consequences.
3. **Open access.** Once the perimeter and equipment are secure, occupy the pad
   beside the exchange service door. Its 1.5-second release opens the east gate
   physically, admits the service van and starts the response.
4. **Protect the restart.** Four street attackers enter after seven seconds.
   Two concourse attackers enter at ground level after sixteen seconds and climb
   the eastern north ramp. Both arrivals have sourced radio reports and an audible
   arrival cue. Both groups carry pistols, fire at a 2.4-second cadence and have
   no grenades. This is one finite response, with no repeated waves or refits.
5. **Recover the squad.** After restoration and defeat of the response, every
   surviving chassis must reach the pickup bay beside the west ramp. The squad
   deploys here too; van, formation and extraction area all clear the street.

The service van parks in the yard; two technicians disembark and walk to the
exchange. Together they need twenty seconds of uncontested work. An enemy
within fourteen metres of the service door pauses work without erasing progress.
One surviving technician can finish at half speed. If their vehicle is destroyed
or stranded, or waits stationary behind an obstruction for five seconds, they
disembark there and continue on foot. Losing both technicians or all player
robots fails the contract.

Restoring service resumes held PORTER deliveries and queued autonomous vans.
This happens in the level before recovery and debrief, rather than merely
changing the objective text. Human workers share the existing skinned model with
separate clothing, no Quill label, and a continuous walking animation.

## Configuration opportunities

| Squad | Opportunity | Pressure |
| --- | --- | --- |
| NEEDLE + three machinegunners | Concourse overwatch and precision removal of elevated posts | Supporting robots must cover approaches while the player scopes |
| ROOK / SPINDLE + two machinegunners | Staggered heavy firing lines push back the street response | Upper-route pressure requires relocation or supporting fire |
| Four machinegunners | Two pairs use the street and service lane, changing angles quickly | Coordination and grenades replace a single dominant weapon |

The layout and enemy deployment are identical for all three. No specialist
weapon is required by an objective. Automatic weapons and pistols retain their
existing friendly-fire protection; grenades and rifle shots remain dangerous
to friendly robots and people. Technicians and civilian vehicles can be harmed.

## Inspection

`window.amortization2.inspect().mission` includes equipment-seizure state, vehicle
IDs, gate state, repair progress, contest status, response groups and technician
positions. Human replay capture and playback record the chosen configuration
and the resolved movement/weapon inputs through the existing format.

Focused tests cover configuration restrictions, supported routes and thin railing
clearance, gate fallback, reinforcement timing, committed enemy flanks around
filled ramps, retained repair progress, crew loss, actual service vehicle and
technician navigation, survivor recovery for all three squads and replay
reconstruction. Native browser checks exercise selection, movement, weapon fire,
scoping, restart and rendered UI at desktop and laptop sizes.

The [recorded assault-squad verification run](replays/README.md) includes a
viewable JSON export, capture provenance and playback instructions.
