# WATCH security response

Civilian fleets have a shared local security contract. Damage reports come from
the units' diagnostics: attacks on couriers, workers and traffic can bring WATCH
quadrotors to the incident. This works in City District, Marine Port and
Receiving. The three practice floors remain ordinary drills and arena combat.

Nearby gunfire still interrupts deliveries and closes shop shutters, but does
not by itself call security. Actual player bullet damage and exposed grenade
damage do. Sniping a tote out of PORTER's hands also counts as interference.
Enemy fire, environmental impacts, ordinary cargo handling and shots at already
disabled civilian wrecks cannot blame the player. Civilian damage earns no
hostile accuracy, grenade-hit or kill credit.

The first complaint dispatches two WATCH drones after 2.5 seconds. Continued
harm raises the response to four or six; destroying a civilian raises it faster
than a single hit. One complaint per victim per 0.75-second burst avoids counting
every automatic round separately; destruction still registers immediately.
Reinforcements arrive in pairs at least eight seconds apart. At most six drones
are active. Attacking WATCH itself extends and can escalate the response.

WATCH is a 30 kg guarded quadrotor with 66 integrity, a forward sensor module,
a visible battery/safety stripe and a small gimballed belly pistol. It is wider
and darker than the parcel KITE, with protective rotor hoops and a red strobe.
Drones enter above the local roofline, descend to staggered 5.5/6.5 m firing
heights, then seek a clear firing position 13 m from the squad. They shoot
short, spaced pistol bursts, reload normally and never brace or throw grenades.
Walls and other physical cover still block their fire. Support robots recognise
WATCH as hostile and provide cover fire while the player uses the scope.

Finite thrust counters gravity and controls acceleration. Bullets preserve
knockback and cause the same stagger as on ground combat robots; a minigun can
push a drone out of its firing position. Destroyed hulls lose lift, coast their
rotors down and fall through normal physics. They remain movable, physical
wrecks for twelve seconds, then are retired to bound bodies and visuals during
long sandbox sessions. Live overhead aircraft do not become ground-pathfinding
obstacles; a fallen wreck does participate in local ground avoidance.

Arrival columns check static collision, including building and ship shells.
Repositioning uses local air goals and climbs above intervening roofs, without
calling squad A*. No position teleports are used for flight or withdrawal. After
26 seconds without further attacks on civilians or WATCH, survivors stop firing
and climb out. New interference can recall them; reset restores a quiet district.
Receiving continues to count only its four authored guards for the cargo
objective, so optional security does not become a hidden dispatch requirement.

Dispatch/arrival and stand-down use short spatial two-note chirps. WATCH has a
lower, slightly louder rotor tone than KITE and shares the existing master/effect
mix. The Civilian motors slider still affects neutral fleets independently.
Air-motor voices are capped at six, and pause/reset/mute/floor changes release
them. There are no new sampled assets, floating names or wanted-level text.

`src/game/security.ts` owns response pressure, the capped roster, air intentions
and finite-thrust flight. WATCH uses the existing armed actor damage, pistol,
stagger, friendly-fire and cover-fire systems. `src/render/security.ts` is the
reusable guarded-drone prefab, rendered through ordinary actor interpolation.
`window.amortization2.inspect().security` reports response level, dispatch timing,
flight state, health, positions and targets. Development replays reproduce the
same response from recorded player commands.
