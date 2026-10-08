# Receiving — first playable contract

The first mission is a small job at the Wharf Cooperative's pickup yard. A
disputed storage charge has blocked a shipment of replacement door motors and
kettle elements. Four Gannet security machines enforce the hold. The crew is
being paid to reopen collection before the afternoon pickups.

This is the opening beat of [Receiving](story.md#1-receiving), before the larger
cargo and loading-equipment seizures. No hostage crisis, citywide failure,
surprise reinforcement or campaign villain reveal is needed to make the job
worth doing.

## Playing the contract

**Receiving** is the default deployment. **Deploy squad** enables sound and
starts the encounter after a short Morrow/Vale briefing. All four basic assault
chassis — ANCHOR, BREECH, LATCH and BOLT — carry only pistols. The practice squad
preference is retained separately: selecting a heavy debug configuration cannot
bring a rifle, machine gun, minigun or grenade into this contract.

Pistols use the existing shot sound, 12-round magazine, 28 m reach, 22 damage,
0.35 s shot interval and 1.6 s reload. Hold LMB to fire selected units. Hold Space
to brace; RMB orders and group selection work as in the ranges. Q retains the
pistol. E and G have no mission weapon to select. The four guard chassis have
132 integrity (six pistol hits), fire at 0.85 s intervals, and never brace. They
work in two pairs: approaching within 20 m or damaging a guard alerts its
partner, with a 0.45 s response and up to 28 m pistol reach. The unhurt partner
can return fire while the targeted guard staggers. They move around blocked
sight lines, but stay near their posts. A full squad needs two accurate volleys
per guard; a lone robot takes longer and is exposed to its partner. This rewards
concentrated fire without a minimum-squad gate, reinforcements or a timer.

| Stage | Completion | Visible consequence |
| --- | --- | --- |
| Clear the pickup yard | Disable the four authored guards. | The dispatch pad becomes the active ground objective; Vale confirms the yard is clear. |
| Release the cargo | Keep at least one living robot on the yellow dispatch pad for two uninterrupted seconds. | The terminal light turns green and held PORTER work orders resume. Moving away resets release progress. |
| Return to the van | Bring every surviving squad member inside the return ring for one second. | Combat freezes and Morrow gives the debrief. One robot cannot extract teammates left at dispatch. Disabled chassis do not block recovery. |

There is no mission timer, wave repair, instant resurrection or ammo refit at
objective boundaries. Losing the entire squad fails the contract, including
after cargo release. The debrief acknowledges surviving chassis and destroyed
civilian machines. PORTER damage does not create an unwinnable escort condition;
the cooperative can arrange recovery after access is restored.

**Replay contract** restores the whole encounter and deploys again. **Shift+R**
or **Restart contract** restores the briefing. **Practice / debug** in the
deployment selector retains Proving Ground, Long Range, Endless Arena, City
District and Marine Port with their existing equipment choices and behavior.

## District and presentation

The playable yard is **84 × 60 m**. The larger scenery continues the port beyond
its boundaries. Buildings, reflective/breakable windows, intermodal containers,
ship, quay, roads, street traffic, CARTs, PORTERs and physical cargo use the same
kits as the district sandboxes. The service van and dispatch cabinet have solid
collision and navigation footprints. Cargo stations sit beside their aisles.

Two PORTERs hold physical boxes while their orders are suspended. The cargo is
not respawned on release. Nearby gunfire still takes priority: workers steady
their loads and withdraw, then resume when safe. Their routine transfers make
reopening the yard visible. Neutral traffic and damage keep their existing
physics; civilian machines never count as the four guards.

Morrow owns the contract briefing and result. Vale supplies the local picture
and the two meaningful changes during play. Their portrait URLs respect Vite's
deployment base. Names and dialogue remain selectable text; live radio messages
can be dismissed. Auxiliary labels can hide the control hints while preserving
the objective, call signs and speaker messages. Only the current objective is
shown in the live HUD, with an active ground ring where proximity matters.

## Implementation and extension

- `src/game/receiving.ts` describes the reusable district and physical sites.
- `src/game/missions.ts` owns briefing, finite guards, objective transitions,
  cargo release, extraction and terminal states.
- `src/game/enemies.ts` contains shared combat tactics. The arena still owns
  wave timing and supplies its original difficulty values; the mission supplies
  a restrained guard profile.
- Each actor has an explicit weapon loadout separate from its chassis model.
  The simulation enforces it for weapon choice, firing and grenade throws.
- `src/render/mission.ts` adds the van, terminal, painted pads and active ring.
  `src/mission-ui.ts` presents the briefing, objective, radio contact and debrief.

This establishes one authored contract; later contracts can supply their own
districts, enemy placements and objectives. There is no campaign economy,
mission-unlock screen, persistence of mission progress or voiced dialogue yet.

## Validation

Focused physics tests exercise held briefings, every saved squad configuration,
real pistol damage/reloads, paired guard reactions, one-versus-four combat,
walking past disabled guard hulls, ordered objectives, interrupted
release, full-squad walking through the yard, resumed cargo transfers, extraction
with casualties, failure after release, replay and debug-floor isolation.
The existing arena/stagger/cover tests protect the shared-tactics extraction.

Desktop browser QA plays the contract through its ordinary mouse/keyboard UI:
deploy, shoot the guards, move to dispatch, return one robot (which cannot
finish), return the whole squad, view the debrief, replay and visit all debug
floors. It also checks auxiliary labels, portraits, settings, pause/restart,
the saved heavy configuration, and desktop/laptop layouts.
