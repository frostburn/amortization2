# Handling — keep the cargo moving

The third tutorial contract continues the cooperative's dispute with Gannet.
Its receiving system still accepts returns on a frozen account. A harmless
return box opens the service gate; the squad recovers the cooperative's seized
calibration-tool chest inside. Morrow briefs the job, Rook explains handling,
and Vale warns of inventory drones. The same four pistol chassis return;
there is no refit, weapon unlock, squad selection or time limit.

Choose **03 · Handling**, or **Next contract · Handling** after Crossing.
Deployment, restart, debrief, human replay export and development playback
use the existing contract flow. All practice and debug floors remain available.

## Orders and physical loads

- **H**, or the box icon, assigns the nearest eligible selected robot(s) to
  the available cargo. They walk to actual grip positions and lift for 0.9 s.
  The return box uses one chassis; the chest needs two selected living chassis.
- **LMB on cargo** collects that load, or drops it if a selected robot holds it.
  The cursor becomes a hand for collection, a closed hand for putting down, or
  a barred cursor when unavailable. Held fire stops over cargo and friendly
  robots; **Ctrl + LMB** deliberately fires at the pointed surface. Living
  squad members show a selection pointer; disabled members cannot be selected
  through the scene, cards, number keys or group orders.
- **RMB** moves the hauling team. Orders during collection wait for the lift;
  dragging updates a shared route, and Shift queues more route segments.
  Either selected carrier controls both hands of the heavy team. The chest
  cannot be split by selecting one carrier and sending it elsewhere.
- **H** with a carrier selected puts the cargo down, or cancels collection.
  The released load retains collision, gravity, momentum and bullet impacts.
  Another selected team can collect it at its new position.
- Carriers holster their pistols, cannot execute covering fire, and walk at
  2.3 m/s with the box or 1.8 m/s with the chest. Space pauses the team.
  Ordinary bullet stagger briefly interrupts hauling; a severe shock or
  disabled hand releases the complete load. Two living hands are always
  required to retain the chest.
- A group move gives selected non-carriers separated escort destinations and
  limits their pace near the load. It does not add automatic fire. Use LMB to
  fire their pistols, or **C then click** to plant them covering a sector.
  Selection changes preserve cargo work and covering orders.

The box is an 18 kg, 0.7 × 0.55 × 0.6 m parcel. The chest is a 124 kg,
1.6 × 0.75 × 0.95 m case with handles at both ends. Fixed Rapier grips share
the weight with the carriers. One conservative navigation grid plans the
whole loaded footprint; individual hands do not find competing routes around
each other. Unloaded robots use the existing squad navigation and local yielding.
Blocked grips use another clear side around buildings or waiting live robots.
Approaching carriers physically push disabled robots off grip spots instead of
avoiding them as fixed obstructions. Wrecks retain mass and collision. Pickup
replans are bounded to once a second if a loose load moves; route search
does not run for every hauling physics tick. Picking up never teleports cargo.

## Encounter

1. **Deliver the return.** Carry the small box to the yellow receiving pad.
   Its one ground grip cue identifies the load. Physical presence for 0.7 s
   accepts it, releases the hands and opens the gate. A manually placed load
   also counts after it has actually been carried; shooting an untouched parcel
   onto the pad does not grant access.
2. **Clear the hall.** Three 110-integrity pistol guards defend the facility
   after access opens. They never brace or throw grenades. All three must be
   disabled before the heavy chest becomes available; killing an inventory
   drone does not advance this objective.
3. **Recover the chest.** Its two grip cues advertise the required team.
   Select two chassis and lift it. Carry it through the wide entrance to the
   green pad at the van; one second in the area unloads it. Put it down to
   concentrate all remaining pistols on an attack, then collect it again.
4. **Recover the squad.** Bring every surviving chassis into the van's area
   for one second. Outstanding drone wrecks or hostiles do not prevent departure.
   Morrow acknowledges the recovered tools; Rook assesses the returned hardware.

Inventory drones start arriving after three seconds of carrying. The box draws
single drones; the chest draws pairs. Subsequent arrivals are spaced by fourteen
seconds of accumulated carrying, with at most four active contract drones.
Putting the load down pauses new arrivals, without deleting existing attackers
or resetting the countdown. Delivering the box stops arrivals during the guard
fight; lifting the chest starts a fresh three-second warning interval. Drone
rotors and arrival chirps use the existing mix.

These are authored enemies, independent of civilian complaints and stand-down.
Their orange hulls match enemy squads; civilian-response WATCH drones retain
their grey hulls and amber inspection stripes.
The hall's cutaway roof remains closed to aircraft. Reinforcements descend
only in outdoor columns checked with their whole rotor hull. For indoor squad
targets, they gather at separate holding banks outside the service door rather
than hovering over the chest or entering through the camera cutaway. Emerging
robots draw normal pursuit; open doorways still allow visible pistol fire.
Transit over obstacles climbs above the roofline, crosses at altitude, then
descends vertically after another clearance check. Cutaway roofs also block
drone shots from above.
They fly the existing WATCH AI and use
real pistol shots, magazines, reloads, stagger and wreck physics. Tutorial
variants have 44 integrity (two pistol hits) and a 1.6 s attack interval. Active
drone count and delayed wreck retirement bound the encounter's population.
Civilian CARTs continue nearby; harming them can still summon ordinary security.

## District and failure

The playable service yard is 87 × 54 m, with an enclosed, walkable service hall,
delivery plinth, van, background workshop/depot, shared paving, street lamps and
two CARTs. The reusable cargo controller, cargo models and flight controller
are independent of mission objectives. The reusable hall prefab uses shared
dimensions for its full-height panel walls, loading portal and supported metal
roof. All four exterior walls block pistol fire; the open loading door is the
firing and hauling route. The roof lifts visually while a living squad member
is inside and returns once everyone leaves. Camera picking passes through the
lifted roof so guards and cargo remain usable. The solid roof always blocks
shots and falling hulls, and its overhead collider never fills the ground
navigation grid. Its gate is a runtime obstacle removed
from both physics and route planning after acceptance; shared range data stays
immutable. Camera visibility does not shorten or remove combat solids.

Ground grip pips, cargo silhouettes, amber carrier rings, holstered weapons and
carrying poses work with auxiliary labels off. Call signs remain visible and
receive a small cargo diamond. The HUD shows four objectives, then extraction.

Fewer than two surviving robots before chest delivery requests recovery rather
than leaving an impossible haul active. After delivery, any surviving squad can
extract. There are no mid-mission repairs, ammunition refits or respawns.
Restart restores cargo, guards, the closed gate and all wave timers.

## Validation

Headless tests run the actual physics through collection, lifting, partial
selection, pending/queued movement, escort pacing, dropped and re-collected
loads, carrier firing restrictions, shock/casualty release, physical gate
exclusion, ordered objectives, wave timing, real combat, extraction, restart
and deterministic replay. A complete four-pistol route uses real movement and
fire without objective teleports or guard deletion. Air regressions cover
rotor-width roof corners, rejected interior spawns, separate exit holding banks,
roof-safe climb/cross/descent, blocked shots through cutaway roofs and pursuit
after the squad emerges. Real pistol tests cover every exterior wall and the
open loading entrance; camera-picking tests keep roof collision intact during
cutaways and reset. Chromium checks native
cargo clicks, hand/selection/barred cursors, Ctrl firing, interruption of held
fire over cargo, disabled squad selection, H/RMB/toolbar interactions, auxiliary
labels, mission selection and loaded replay rendering at desktop and laptop sizes.
