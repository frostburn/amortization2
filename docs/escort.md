# Release — Ren Quill's second rescue

**04 · Release** follows Handling, retaining four assault chassis with pistols.
Choose it in either deployment selector, or continue from Handling's debrief.
The practice ranges and their saved heavy loadouts remain available.

![Quill follows LATCH out of the records office while three robots cover the incoming response squad.](images/release.jpg)

Ren inspected the cooperative's operating-rights records at Gannet. His hosts
locked the entrance while requesting a signature for "account reconciliation".
Morrow sends the robots to retrieve him. Vale identifies the three hired guards
and the response squad on the neighbouring street. Ren returns to his work on
the agreements with evidence for the wider story. His first-game liberation
remains intact: he chose this visit twelve years later.

| Stage | Player action | Result |
| --- | --- | --- |
| Break the entrance | Shoot the steel shutter; seven pistol hits defeat its lock. | The shutter retracts and the three office guards respond. |
| Clear the office | Use the four pistols against the guards. | The rescue ring appears in the back room. |
| Reach Ren | Bring a living robot within three metres, on his floor and without a wall between them. | Ren follows that guide and a response squad is called. |
| Escort to the van | Protect Ren, withdraw through the forecourt and gather every survivor in the green recovery ring. | One uninterrupted second completes the contract. |

Five seconds after rescue, **four unbraced pistol robots** enter from the south
street. They move towards the withdrawal lane, flank blocked sight lines and
return fire while closing. This is one finite squad: no repair at an objective,
recurring wave timer or reinforcements before rescue. Killing all four is useful
but is not an additional extraction requirement.

## Escort orders

Ren is an unarmed human with **88 health**. He is outside the four-robot selection
and cannot be given independent combat orders. His portrait and health remain
in the mission panel, and his overhead call sign remains visible when auxiliary
labels are hidden. Enemy pistols, blasts and physical collisions still matter;
player pistols keep the existing friendly-fire policy.

- **H**, the human icon, or a click on Ren: tell him to wait or follow the selected
  guide. Selecting another robot before issuing this order transfers the guide.
  In a group, the nearest selected robot becomes the new guide.
- **RMB** moves the guide normally. It slows to Ren's walking speed and waits if
  he falls more than four metres behind. The other robots retain their ordinary
  movement and weapons.
- **C**, then a direction, leaves selected robots braced and covering that
  sector while the guide moves. Moving replaces their cover orders as usual.
- When waiting, Ren crouches. His hitbox follows that smaller silhouette. A
  disabled guide leaves him waiting; select another survivor and issue H again.

Ren uses the shared faceless human skin and corrected walk/cloth poses, with a
charcoal/teal palette, greying hair and bronze glasses. His movement animation
advances with actual travel speed. Damage produces a muted soft impact rather
than metal sparks. Losing Ren or the entire robot squad fails the contract.
Morrow's debrief distinguishes a healthy rescue, an injured Ren and a failed
recovery; Rook assesses the returning machines.

## District and implementation

The playable forecourt is **90 × 56 m**, with a **24 × 20 m** walkable records
office, storage cabinets, a desk, roadside cover and the support van. Shared
district buildings, lamps, CART deliveries and self-driving traffic continue
the port's activity. The office reuses the full-height service-hall kit; its roof
cuts away before the squad reaches the entrance. Roof and wall collision remain
solid during the cutaway, preventing exterior or overhead pistol shots from
passing through them.

- `src/game/escort.ts` authors the district, office envelope and sites.
- `src/game/human-escort.ts` owns following, guide changes, pacing and crouching.
- `src/game/escort-mission.ts` owns the shutter, authored guards, rescue,
  response squad, extraction and failure.
- `src/render/escort.ts` uses the shared building and vehicle prefabs for the
  office, furnishings, shutter, beacon and active ground rings.

Development human replays record H/click intentions, Quill's state and health,
the response arrival and the terminal result. They can be exported and viewed
through the existing dev-only replay UI. Replay contract and Shift+R restore
the locked entrance, captive Quill, guards and reinforcement schedule.

Focused tests exercise physical entry and shots, wall/roof obstruction, rescue
access and elevation, guide loss, interrupted extraction, human damage,
finite reinforcements and an entire combat/cover/escort run with deterministic
replay. Browser QA uses ordinary keyboard/mouse input through completion.
