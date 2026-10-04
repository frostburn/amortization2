# Proving Ground visual direction

The target is a restrained industrial training yard: weathered warm-grey concrete, dark gunmetal equipment, ochre safety paint, orange opposition, and muted teal squad machines. Keep the action surface dominant. A charcoal header/footer carries the title, squad, ammunition, and weapons; small corner panels carry drills and statistics.

## Concept brief

A desktop game screenshot for Amortization II — Futures Contract, viewed from an elevated tactical camera. Four armed teal robots stand across the near firing apron. Three numbered lanes contain orange plate targets, heavier robot targets and stacked steel crates, and a covered grenade bay. Concrete retaining walls, service pipes, vents, drain grates, range lights, and worn safety markings establish a utilitarian place. Thin mint selection rings and warm tracers distinguish input from impacts. Keep the UI quiet, legible, and subordinate to the range.

The generated concept was used for composition and material direction, not as a flat game background. Its photographic surface detail is a direction for future polish; this playable uses economical, articulated 3D models so aiming, movement, collision, and lighting share the same space.

## Production texture brief

An evenly lit, seamless, orthographic concrete material tile: weathered industrial concrete in neutral warm grey, fine aggregate, subtle mottling, restrained pits and hairline wear. No perspective, hard cast shadows, lettering, lane markings, objects, seams between tiles, or strong directional lighting. It must remain quiet under 3D props and repeat over a tactical game floor.

The resulting texture is shipped at `public/textures/concrete.webp`, used on the floor and cloned for concrete walls. Markings, drains, architecture, robots, crates, guns, and grenades are geometry or code-authored canvas textures. The interface icons are inline SVGs. No images are fetched from a third-party service at runtime.

## Visual acceptance

- Preserve the three-lane layout, four-unit firing line, charcoal frame, teal selection, and ochre/orange combat language.
- Ensure the selected robot's ground ring is visible above the apron.
- Keep target silhouettes and grenade trajectories legible against the floor.
- Inspect both the full desktop view and a 1366 × 768 laptop view.
- Treat generated concept detail as an art reference, not evidence of implemented gameplay or a shipped screenshot.

Intentional first-slice differences: simplified mesh detail, a tighter and more frontal orthographic camera, three explicit drill objectives, named squad cards, and mouse/keyboard controls in native DOM elements. Camera movement and zoom remain available for closer inspection. Higher-detail models, surface normals, decals, and environmental dressing can be added without replacing the physics layout.
