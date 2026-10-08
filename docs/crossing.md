# Crossing — cover both banks

The second playable contract stays within the opening Wharf Cooperative jobs.
Gannet has locked the road bridge over another disputed service charge. The
crew takes a maintenance footbridge to the cooperative's collection van. This
is a short lesson in covering movement, with the same four pistol chassis as
Receiving. Squad configuration and heavier weapons remain in Practice / debug.

Select **02 · Crossing** in Deployment, or **Next contract · Crossing** after
Receiving. The briefing freezes the encounter; Deploy squad starts it. Restart,
replay export and development replay playback support both contracts.

## Covering orders

Select one or more robots, press **C**, then click the direction to cover. The
toolbar's sector icon arms the same order. A gold ground arc previews each
selected robot's sector; mint arcs show committed orders. These graphics remain
with auxiliary labels off. Escape cancels the uncommitted order.

The robots stop and brace, watch a 120° sector, acquire visible hostile hulls
within their weapon's actual reach, fire controlled bursts and reload. The
sector is a direction, not a tracked enemy or an attack-move destination.
Targets behind cover or living civilians are not valid firing lines; the line
is checked again when each shot is due. There is no detection through walls.
Staggers interrupt fire; bracing retains the existing faster recovery.

Selection changes, pause/resume, and releasing the manual trigger retain the
order. Direct LMB fire temporarily overrides the selected robots' automatic
aim. A move order replaces cover for the moving robots; **X** ceases fire for
the selection. Changing a sector replaces the previous one. Rifle cover waits
for brace settlement; minigun bursts include enough time to spin up.

Sniping still gives the other robots temporary automatic cover while preserving
their movement orders. Explicit sectors survive entering and leaving the scope;
leaving removes only the temporary support. No global automatic firing is added
to idle squad members.

## Encounter

The district is 74 × 48 m. The deeper canal removes the ground slab, continues
beyond both playable edges, and leaves one 14.8 × 2.4 m walkable deck. Shared
pump houses, workshop, depot, reflective windows, roads, traffic, CART routes,
water and service van keep the location part of the existing city kit. Building
lots clear both continuing roads and the canal.

1. **Establish a foothold.** Three 132-integrity pistol guards hold the far bank.
   They react to a chassis approaching the bridge mouth or damage to their
   post. The near bank has space to arrange cover before crossing. They never
   brace, use grenades or receive repairs. Their 0.6 s attack cadence overwhelms
   a lone unsupported robot, but concentrated covering fire can suppress and
   disable them. Player pistol damage, reach, magazines and reloads are unchanged.
2. **Cover the rest of the crossing.** Move one robot across while the rest
   cover, then move the covering robots in turn. Normal group movement also
   queues at dry bank slots and restores the requested formation at the far
   destination. Keep the landing clear; move a crosser out of the narrow mouth
   before planting it as a covering robot. Bring a damaged chassis over before
   releasing the rear guard.
3. **Cover back and withdraw.** The last living near-bank robot physically
   entering the deck trips an audible two-tone alarm and a red beacon. Vale
   announces the pursuit. Three pistol machines arrive on the west bank after
   0.8 s and advance toward the bridge. Reverse the far-bank cover sectors so
   they can protect the final crossing. Bring every survivor to the van for one
   uninterrupted second to finish; killing the pursuit is not an objective.

The alarm fires once. Queued commands, retries and killing a teammate cannot
substitute for physical entry. It requires the other surviving robots to be on
the far bank, and never repeats during a retreat. The pursuit is finite, without
an arena wave loop, ammo refits or squad healing.

## Bridge load and failure

`SingleLoadBridge` and its view are reusable. The authored bridge has a 120 kg
limit; each pistol chassis weighs 90 kg. Normal navigation assigns one transit
reservation, holds other robots in separated dry-bank lanes, and releases the
reservation once the crosser clears the landing. Steering retains the current
reservation; queued follow-up waypoints survive admission. The navigation grid
is reused, with no per-frame bridge A* search and no body teleporting.

Actual hulls, wrecks and loose cargo on the deck contribute their physical mass.
An overload lasting 0.65 s buckles it and removes the deck collider. The load
lamps turn amber when occupied and red during an overload. A collapsed bridge
fails a stranded crossing immediately. A settled disabled squad chassis blocking
the deck for more than two seconds requests recovery if anyone still needs to
cross, rather than leaving the bank queue waiting indefinitely. A wreck that is
still moving has time to clear the deck; a lost final crosser does not strand the
surviving robots already on the far bank. Falling into the canal disables a
chassis; losing the whole squad requests recovery. Extraction allows casualties,
but no living squad member can be left behind. Debriefs acknowledge the outcome.

## Validation

Simulation tests compare unsupported and supported crossings, pursuit without
reverse cover, single-hull group passage and final formations, retained steering
and queued destinations, real weight/collider collapse, water exclusion, alarm
timing, extraction and terminal states. Cover tests exercise sector bounds,
manual overrides, selection persistence, reloads, civilian obstruction, stagger
recovery and compatibility with temporary sniper support. A captured crossing
replays its cover commands, bridge queue, alarm and combat exactly.
