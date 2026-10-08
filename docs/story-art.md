# Story artwork — friendly portraits

Six individual portraits are generated for **Amortization II — Futures Contract**
with the built-in image-generation tool. They depict the returning fictional
human cast **twelve years after the original game**, retaining recognizable faces,
ethnic appearance, distinctive hair, glasses and clothing vocabulary.

Production assets are **512 × 512 opaque WebP** files in `public/portraits/`.
The six generated source images were 1254 × 1254; production images total
**234,208 bytes (about 229 KiB)**.
Names, roles and dialogue belong in selectable UI text. Each portrait has a
consistent head-and-shoulders crop, dark charcoal-olive background, warm upper-left
light and restrained cool fill. The assets support small comms portraits and
larger scene panels. The [Receiving contract](first-mission.md) displays Morrow
and Vale in its briefing and radio messages. Receiving and Crossing display
Morrow's contract debrief and Rook's condition-aware hardware assessment.
The other three assets remain ready for later campaign scenes.

## Asset index

The machine-readable [cast.json](../public/portraits/cast.json) records stable
human IDs, display names, responsibilities and presentation emphasis. Its
`portrait` filenames are relative to the manifest's directory. Resolve that
base with the deployment's relative URL; the application also supports hosting
under a path prefix. Load portraits when their speaker is needed rather than
adding all six to game startup. The first mission supplies names as text and
identifies its speakers through image alternatives and live radio status.

| Portrait | Reference identity | Role |
| --- | --- | --- |
| [Morrow](../public/portraits/morrow.webp) | Original crew atlas, top-left | Operations |
| [Vale](../public/portraits/vale.webp) | Original crew atlas, top-right | Reconnaissance and contacts |
| [Rook](../public/portraits/rook.webp) | Original crew atlas, bottom-left | Weapons and security |
| [Sable](../public/portraits/sable.webp) | Original crew atlas, bottom-right | Systems |
| [Iona Voss](../public/portraits/voss.webp) | Original witness atlas, left | Engineering |
| [Ren Quill](../public/portraits/quill.webp) | Corrected individual male portrait | Agreements |

## References and provenance

Identity and style references come from the first game's original generated
portraits in [frostburn/amortization](https://github.com/frostburn/amortization):
`public/assets/portraits.webp`, `public/assets/witnesses.webp` and
`public/assets/story/quill.webp`. Their production history is recorded in that
repository's [art documentation](https://github.com/frostburn/amortization/blob/main/docs/art.md).
The unused right-hand female witness portrait is not Ren Quill. The corrected
individual portrait is the reference for his identity.

All six sequel images were generated individually from those references. WebP
production encoding resizes the selected output to 512 pixels with a Lanczos
filter and quality 88/method 6. This packaging is not a repaint of the generated
faces. No external image service or generation is needed at runtime.
The generated asset files are released under this repository's MIT license;
see [credits](../CREDITS.md).

## Prompt set

Each request uses the shared prompt below followed by the corresponding subject
specification. It supplies the single reference file named in the asset table and
sets `transparent_background: false`. The generated full-size image is inspected
before production encoding. Original reference files remain unchanged.

### Shared prompt

```text
Use case: identity-preserve.
Asset type: one production in-game head-and-shoulders portrait for Amortization II — Futures Contract, a grounded corporate-noir robot squad tactics game.
Primary request: create a NEW sequel portrait of the specified returning fictional human, exactly twelve years older than the first game's reference. Preserve their recognizable facial identity, ethnic appearance, gender, facial proportions and distinctive features. The supplied image is an identity and art-style REFERENCE; do not modify that file or reproduce its atlas layout.
Style/medium: restrained realistic hand-painted videogame artwork matching the reference, with subtle visible painterly strokes, convincing skin and ordinary worn fabrics, sharp readable eyes and coherent facial anatomy.
Composition: one square 1024 × 1024 opaque image, one person only. Show full head, neck, shoulders and upper chest; head centered, eyes near 38% of image height, full hair/head inside a generous top margin. Consistent medium-close crop, head about 60% of image height and same visual face scale across the six cast portraits. Turn slightly toward the viewer's right, about 15 degrees, with eyes meeting the viewer. Keep face readable at 48px and 96px UI sizes.
Lighting/palette: soft warm light from upper left, restrained cool grey-green fill, muted charcoal, slate and olive; nearly black charcoal-olive opaque background with minimal texture. No scene, frame or dramatic spotlight. Preserve natural skin color.
Age progression: make twelve additional years visibly credible in eye/forehead lines, cheeks, skin and neck, with appropriate hair greying. Retain capable, individual people, without making everyone frail or turning ageing into a caricature.
Constraints: no text, name labels, UI, symbols, brands, logos, watermark, border, collage, extra faces, weapons, helmets, futuristic implants, glowing eyes or decorative science-fiction armour. The original cast members remain separate people; no uploaded consciousness or robotic anatomy.
Subject details:
```

### Morrow

```text
MORROW. Use ONLY the TOP-LEFT woman in the four-person reference atlas for identity. Preserve her distinctive brows, green-grey eyes, straight nose, mouth, short asymmetric dark hair and light complexion. She is now a mature woman, roughly early forties, with fine crow's feet, visible forehead and nasolabial lines, a slightly more mature jaw/neck, and subtle grey strands at the temples, still predominantly dark hair. Calm, decisive, attentive expression. Charcoal high-collared practical operations coat, worn but maintained, without combat harness or rank insignia.
```

### Vale

```text
VALE. Use ONLY the TOP-RIGHT bearded man with glasses in the four-person reference atlas for identity. Preserve his dark curly hair, original rectangular-round clear-lens glasses, pronounced nose, original beard shape and light-to-medium complexion. Twelve years older, now in his late fifties: noticeable salt-and-pepper curls and beard, deeper forehead/eye lines, mature cheeks and neck. Thoughtful, focused, quietly approachable, not scowling. Black/charcoal utility jacket over an understated grey-green shirt; original systems specialist identity, ordinary fabric.
```

### Rook

```text
ROOK, THE HUMAN SECURITY SPECIALIST. Use ONLY the BOTTOM-LEFT broad Black man with shaved head in the four-person reference atlas for identity. Preserve his skin tone, face shape, nose, close beard, shaved scalp, broad neck and substantial shoulders. Twelve years older, now around his fifties: visible crow's feet and forehead lines, believable mature cheeks and neck, a short close salt-and-pepper beard with greying at chin and sides. Quietly observant, grounded, relaxed confidence, no aggressive grimace. Heavy charcoal workshop overshirt with a practical standing collar, ordinary substantial worn fabric; no weapon, robot parts or military insignia.
```

### Sable

```text
SABLE. Use ONLY the BOTTOM-RIGHT silver-haired woman in the four-person reference atlas for identity. Preserve her narrow face, nose, light complexion, grey-green eyes and short asymmetric silver hair swept away from her face. Her hair was ALREADY SILVER in the first game: depict twelve years of actual facial ageing, rather than only greying the hair. She is now visibly in her fifties, with fine eye and forehead lines, more mature cheeks/jaw and believable neck texture. Alert, knowing, composed expression with the slightest hint of warmth. Charcoal weather-resistant reconnaissance coat with high collar, subtle ordinary fabric texture, no harness or armour.
```

### Iona Voss

```text
IONA VOSS. Use ONLY the LEFT woman with the silver-grey chin-length bob and beige lab/work coat in the two-person witness reference atlas. Ignore the right-hand woman entirely. Preserve Iona's original face, light complexion, nose, eyes and side-parted bob. Twelve years older, now a capable woman in her sixties: more white in the silver-grey hair, visible mature forehead/eye/mouth lines and natural cheek/neck ageing. Practical, intelligent and assured, with a gently attentive expression. Light beige engineering work/lab coat over a dark charcoal high-neck shirt, worn work fabric, no tools or labels.
```

### Ren Quill

```text
REN QUILL. The single attached man is the ONLY identity reference. Ren is an EAST ASIAN MAN, the corrected original character, not the unused woman in the old witness atlas. Preserve his broad original face, light-medium warm skin tone, nose, clean-shaven jaw, thin bronze glasses, dark side-parted hair and understated expression. Twelve years older than this early-forties reference, now in his mid-fifties: grey at the temples and side part, visible crow's feet and forehead lines, slightly more mature cheeks and neck, still neat and clean-shaven. Calm, careful and quietly determined. Charcoal knitted cardigan over a muted teal collared shirt, same civilian visual identity. Match the uniform cast lighting/crop while retaining Ren's recognizable face.
```

## Visual verification

Review the selected portraits together for consistent scale and lighting,
recognizable identity and visible age progression. Sable and Voss already had
silver hair: assess their skin, facial structure and neck, not hair colour alone.
Inspect at 48, 96 and 256 pixels as well as production resolution. Check each file
is decodable, square and opaque; check that every manifest and documentation link
resolves, and that the production build copies the assets unchanged.
