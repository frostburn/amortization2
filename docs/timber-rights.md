# 07 · Timber Rights

Selectable sniper, twin-minigun or machine-gun squad. A water cooperative hires
Morrow's outfit to enforce an existing stop-work order in the Birchwater
catchment. A logging subcontractor is clearing a protected buffer beside
Meridian's proposed data-center expansion. Security robots protect the crew's
instructions; there are no human workers to shoot.

The application is still undecided. The mission stops illegal clearance and
preserves the instruction record. It does not resolve the wider planning dispute
by destroying the proposed facility. Sable finds that the contractor described
buffer clearance as drainage preparation. Vale coordinates with inspectors;
Morrow defines the job and Rook prepares the squad and recovery.

## Operation

1. Disable two autonomous tracked felling rigs by shooting their engine chassis.
   Each has 220 HP: two settled rifle hits, sustained automatic fire, or a close
   grenade followed by fire. Their amber running lights and hydraulic booms stop;
   the chassis remains physical cover. Shooting a rig alerts the existing guards.
2. Bring a robot beside the amber work-order terminal near the site office.
   Both rigs must be stopped. Security within 10 m contests the two-second seal.
3. Secure the marked clearing for the inspectors. Keep a robot inside it for
   24 seconds; enemy machines within 12 m pause the accumulated control time.
   Two finite four-robot response squads enter at 5 and 10 seconds after sealing,
   from the northern plot track and the southern service track. Each has two
   machine guns and two pistols. They engage during their approach and overlap
   from opposing angles. Clear the armed response before inspectors take possession.
4. Bring every surviving robot back to the off-track layby. Rook reports losses
   and chassis condition using the shared debrief. There is no cargo haul,
   escort, endless reinforcement loop or silent mission timer.

Four initial guards carry two machine guns and two pistols, retaining their
original 38 m / 22 m engagement ranges and slower reactions. Gunners have 160 HP;
settled rifle fire needs two hits. Response machine guns engage out to 50 m and
their pistols to 28 m. Faster response reactions, overlapping squads and the
southern approach make covering both angles useful. Set cover sectors before
sending one robot to seal the terminal, then bring that robot back to help with
the hold. Entry is sheltered, with a broad sloping forestry track leading toward
the western rig. The clearing
and lateral tracks leave room for formation movement and bullet pressure. Logs
and boulders supply low cover; ridge crests offer sight lines for NEEDLE. Tree
trunks and terrain block actual bullets. Foliage supplies visual concealment,
with overhead cutaways where crowns obscure robots.

## Reusable landscape

`HeightField` stores sampled heights and a triangle mesh. Rapier, rendering,
mouse picking, formation destinations, spawn heights and layered navigation use
that same surface. Height lookup interpolates triangles rather than inventing a
bilinear surface between them. Natural ground replaces the flat district slab.
Navigation retains the existing 30% grade limit and uses spatially indexed static
forest obstacles; the graph is built during loading and cached across resets.

`NaturalTerrainView` draws vertex-colored earth and instanced pine/birch trees.
The forest continues outside the playable 160 × 120 m area. The eastern plot is
graded flat and marked with survey stakes, future slab pads and cooling-plant
footprints. The office reuses the city building kit; the recovery van reuses the
vehicle model. The felling rig is a reusable articulated procedural model.
All new assets are source-generated; no new third-party asset licenses apply.

The woodland is also selectable in Endless Arena. Authored mission guards,
objectives and response squads are absent there; rigs remain inactive solid map
landmarks, and arena robots spawn on their actual terrain height. Existing
practice districts and contracts remain available.

The full four-machinegun verification run is available in
[Recorded verification runs](replays/README.md#timber-rights-four-machinegunners).
Load its JSON in the development replay viewer to watch the approach, both
responses and recovery.
