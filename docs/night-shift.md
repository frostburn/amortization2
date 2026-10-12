# 08 — Night Shift

Birchwater catchment, hours after Timber Rights. The cooperative's injunction
survived the evening hearing. Its inspection crew is bringing equipment to hold
and document the clearing; the logging contractor is trying to retake possession
before morning. The supply vehicles contain hardware rather than visible human
passengers. MORROW directs the operation, VALE follows both approaches, ROOK
calls threats and SABLE explains the night contacts.

The intended split is one robot on the southern forestry road and three around
the clearing. The convoy begins rolling twelve seconds after deployment: a green
van followed by a supply truck, each with its own receiving position. Four pairs
of hostile pistol drones harass the supplies. A nearby escort draws their fire;
a machine gun and a C covering sector can manage a pair. Remain beside the lane,
then advance the cover position with the vehicles. Three finite ground responses
bring a machine gun and two pistols each from alternating tracks, supplementing
the initial clearing squad. There is no wave rearm or infinite respawn.

Enemy presence in an unattended clearing builds occupation pressure. Friendly
presence contests it; defeating the local opposition lets the squad reduce it.
An established foothold, the loss of either supply vehicle, or the destruction
of the squad fails the mission. Receiving the convoy does not finish the fight:
all authored responses must be defeated, then the survivors assemble beside
the receiving bay. The original daylight forest and all debug ranges remain.
The new night terrain is also selectable in Endless Arena.

## Darkness and lighting

Moonlight preserves terrain and friendly readability. Temporary work lights
illuminate the clearing and receiving bay, with the clearing lamp sweeping over
its approaches. Headlights move with the convoy. Muzzle flashes and explosions
briefly light nearby ground. Only the clearing spotlight casts an additional
shadow map; headlights and flashes use a bounded set of cheaper local lights.

Optical contacts come from the surviving squad, independent of camera position
or quality settings. Dark acquisition reaches 18 metres; lit contacts can reach
52 metres, with static terrain and cover still blocking sight. Enemy AI uses the
same exposure rule against squad members. Cover orders also need an optical
contact. Hidden hostiles have no model, ground ring, health bar, hover elevation
hint or camera-occlusion outline. Ballistics remain physical: firing into a dark
area can still hit something. Firing gives a position away locally, not through
terrain or across the entire map. This is the first night rule set, rather than
an assumption that every robot has perfect thermal vision.

## Verification

Focused tests exercise deployment, physical convoy motion, drone targets,
occupation, loss and completion conditions, reset, optical contacts and cover.
Natural-ground collision meshes correct internal triangle-edge contacts so vehicles
do not snag on an otherwise flat road. Traffic senses live obstructions while
allowing heavy vehicles to physically push small robot wrecks.

Full verification runs belong in `docs/replays/` as viewable development replay
JSON, not in the default test pipeline. Long replay tests remain opt-in.
