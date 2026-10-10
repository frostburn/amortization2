# Raised concourse

A separate **Practice / debug → Raised Concourse** district recalls the source material’s layered urban routes. The block measures 120 × 98 metres. The original flat ranges and missions remain available. This is a movement and elevation sandbox, with the usual configurable squad and unlimited supplies; it has no mission objective or scheduled waves.

## Routes

Two broad, eight-metre ramps rise from the southern forecourts to 4.8 m terraces. Each rises 4.8 m over 24 m (1:5). A 36 m bridge connects them over a live street with about 4 m of structural clearance. Two further ramps climb 3.6 m over 18 m to an 8.4 m gallery across the northern edge. The raised routes form a complete loop, and both ends return to street level.

Brick studios, civic halls, laboratories, north-side office towers and south-side shops use the existing building kit. Shared street construction, reflective breakable windows, CART deliveries and autonomous traffic give the district everyday activity. Supports stand in the plazas outside the carriageway and sidewalks. Solid sloping parapets follow ramp inclines and leave openings at connected path mouths. Grip strips and expansion joints show the slope without floating labels.

The orange practice targets occupy three elevations: a ground plate, a heavy pressure target on the eastern terrace and a precision target on the upper gallery. Gunfire, sniper sight lines, grenade arcs, impacts and falls use the actual physical surfaces. Attacking civilians invokes the existing security response. Reset restores the squad, targets and activity.

## Controls

Right-click or right-drag to move on the selected robot’s current floor. Clicking an open bridge or gallery from the ground orders the squad underneath it, at the same horizontal location. Clicking while already upstairs keeps the order upstairs. Filled ramps and terraces have no lower floor: use the arrival ramps to climb, then continue along the raised loop. Four selected robots retain their square slots; three keep their triangle. Preview rings, formation outlines, selection rings and cover sectors appear at the chosen surface height. Shift + right-click queues a destination using the previous order’s level, so a climb and its continuation can be queued together. Weapon aiming and grenade clicks still use the visible surface or target’s actual height. **F** centres the selected robot at its current level.

Unbraced automatic aim uses the surface’s height plus the usual upper-body clearance. Braced aiming retains the intended physical height; the existing low-cover assistance can lift that line past a low parapet only if the upper line is clear. Grenade targets retain the chosen deck’s height even at the horizontal throw limit, and their previews stop at the first physical collision. Structures remain real cover; a higher position does not grant shots through parapets or decks. A deck fades when it hides a selected robot from the tactical camera, while collision and support stay intact. Scope mode restores opaque surfaces.

## Reusable implementation

- `src/game/walk-surfaces.ts` defines rectangular walking planes with independent X/Z slopes, thickness and optional filled foundations. The same closed prism data supplies mesh rendering and Rapier collision. A location can contain both a ground node and an overhead deck node. Footprint support, headroom and height-dependent solid checks determine which nodes are usable. Ramp continuity connects levels; vertical terrace edges do not.
- `SurfaceNavigation` prepares support links during district loading and shares the immutable graph across resets; a geometry signature invalidates it after layout edits. Mutable search arrays and dynamic occupancy remain per instance. Long flat legs sweep relevant geometry boundaries, while slopes retain continuous support checks. Route smoothing bisects candidate shortcuts, and nearby squad slots reuse validated corridors with short entrance/exit connections. A small goal bias limits exploration of equivalent paved cells. Loose obstacles block their own elevation rather than every floor in the column. Searches occur on orders and bounded arrival recovery, not every physics tick.
- `src/game/concourse.ts` owns the district and its surface/parapet kit. `src/render/concourse.ts` batches concrete, paving, parapets, grip strips and structural ribs. New districts can reuse the authored surface vocabulary without copying mission or renderer logic.
- Live robots retain dynamic physical bodies. Their motor operates when a downward query detects a suitable support normal, including ramps and raised decks. Acceleration, knockback, gravity and free flight remain physical; movement never teleports robots onto a desired height. Local steering ignores hulls on another level and rejects unsupported shortcuts.
- Walking orders optionally include `y`, meaning surface height at the feet. Flat levels preserve their prior two-dimensional destinations and grid. Replay validation, capture and playback retain optional heights; changing or resetting a floor releases its terrain state.

## Verification

Headless tests exercise shared mesh heights, ramp routing around retaining walls, ground/bridge separation, whole-squad ascent and descent, square arrival, underpass movement, height-specific loose obstacles, queued surface orders, exact replay, reset isolation, elevated rifle hits, airborne impacts and elevated grenade ballistics. Browser checks use normal mouse and keyboard orders to traverse the loop and inspect movement/aim markers at both heights.
