# Endless Arena

The arena provides repeated live fights for tuning combat before campaign missions. It uses a 64 × 44 m yard with four broad entrances, tall crates, low barriers, loose crates and clear flanking lanes. The player starts with three assault robots and NEEDLE selected in a square.

## Loadouts and orders

Assault robots retain machine guns and grenades. NEEDLE has the existing braced sniper rifle and a compact pistol, with no grenades or machine gun. The pistol deals 22 damage, reaches 28 m, holds 12 rounds, cycles every 0.35 s and reloads in 1.6 s. Its magazine, cycling and reload are independent of the rifle. Q chooses the available close weapon and cycles gun/pistol when both models are selected; E chooses the rifle; G requires a selected assault robot. Weapon buttons reflect available equipment. A mixed firearm order only fires equipped operators. Grenade rotation and readiness exclude NEEDLE.

The pistol uses the supplied `854226__qubodup__m4a1-rifle-shot-5.wav` without altering the recording. The primary weapon model, actual muzzle origin, muzzle flash, cover/range guide, magazine and sample all follow the selected firearm. Overhead aim uses the collider surface under the cursor, so the player can aim at the upper body above low cover. First-person rifle controls and the fixed optical reticle remain available in the arena.

## Wave loop

- The first wave follows a four-second entrance warning and contains three assault robots.
- Each clear increases the next wave's size by one robot, capped at twelve: three squads of at most four. There is no last wave.
- Each squad enters through its own marked gate, with stable nearby rally slots and different flank preferences. Gates rotate between waves; warning plans prefer gates at least 12 m from survivors. A player moving into an announced entrance causes spawn slots to shift within that entrance.
- From wave 3, each full four-member squad includes a fragile sniper. Enemy snipers switch to their pistol at close range.
- Surviving players receive full integrity and ammunition when all hostiles and live explosives are gone. Casualties remain disabled. A six-second entrance warning gives time to regroup.
- Squad loss stops enemy attacks and the wave loop, releases held fire and scope mode, and shows a restart button. Shift+R restores the entire arena. Pausing stops simulation time and audio.

The wave HUD reports hostiles, cumulative hostile casualties and surviving players. Enemy fire and enemy grenades are tracked separately from player shooting accuracy and grenade statistics. No progression, economy, spawn-cost budget or missions are introduced.

## Enemy combat

Enemies walk through the same finite-acceleration controller and use the same capsule colliders, route finding, local hull avoidance, magazines, reloads, muzzle rays, damage and impulses as the player. Moving robot hulls never become static route-planning obstacles. Displacement beyond an open entrance permits inward recovery rather than a permanent boundary stall.

Enemy intentions update every 0.15 s. They prefer nearby living targets, with a small preference for the current target to avoid rapid switching. They check actual sight lines to the body and upper body; tall obstruction causes them to seek a different firing position and flank it. Route requests are capped to one per 1.2 s per advancing enemy. Enemies use their own aim points without changing the player's aim or scope.

Assault units brace and acquire before firing short three-to-five-shot bursts, with pauses that shorten over the early waves. Rifle operators acquire and settle before their slower shots. Incoming hits interrupt bursts and delay reacquisition; stability and actual physical movement affect their ability to brace. Orange rings pulse during acquisition, and live hostile health bars distinguish the combatants from practice plates.

From wave 4, assault units can lob a grenade at two or more players clustered within 4 m, at a distance of 10–24 m, provided allies are at least 8 m away. The same four-second grenade cooldown applies, with an eight-second AI planning delay. Only one hostile grenade is live at once. An incoming message and pulsing orange ring under its current position warn of its possible blast radius; this is not a promise of an unobstructed blast. Actual ballistic flight, bounces, the 2.4 s fuse and cover samples determine the result. NEEDLE cannot throw on either team.

## Lifetime and verification

Dead hostile bodies persist briefly, then retire after eight seconds or before the next wave. Rendering removes their model, health bar, ring, flash and owned GPU buffers. Shared geometry/materials remain reusable. Live-wave population caps at twelve, and transient effects retain their existing fixed budgets.

The 53-test suite uses the actual Rapier simulation. Added checks cover restricted loadouts, mixed weapon cycling, independent pistol reload and reach, warm-up and physical squad entry, actual enemy damage and independent aim, cover-clipped fire, survivor refits and permanent casualties, enemy snipers, hostile grenades and separate statistics, waiting for live explosives, occupied entrance slots, fourteen clears into wave fifteen with bounded body counts, defeat/reset, and recovering through an open boundary. Existing drills still pass using assault robots for explosives. Browser validation checks contextual weapon controls, decoded pistol audio and native pistol fire, scope entry during pistol reload, arena bursts, player firing and wave clear, subsequent entry, pause, restart, and desktop/narrow framing.

This is a starting balance for playtesting. Software-GPU Chromium checks establish functional behavior, not hardware frame rate or mix quality. Firefox/Safari and physical mouse/audio-device checks remain open.
