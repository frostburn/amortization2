# Minigun edits

These derived audio files, including the synthesized shot bass, are released under **CC0 1.0**: https://creativecommons.org/publicdomain/zero/1.0/ . The motor uses olliehahn12's supplied CC0 saw recording; see `../saw-source-license.txt`. The gunfire and impacts use qubodup's CC0 recordings, whose manifest is unchanged in `../_readme_and_license.txt`.

The source mapping, timings and runtime sequencing are documented in [`../../docs/minigun.md`](../../docs/minigun.md). Rebuild with `python scripts/build-minigun-sounds.py` (FFmpeg with the Rubber Band filter, NumPy and SciPy). The checked-in WAVs work without those editing tools. `motor-demo.flac` isolates the motor; `demo.flac` adds the firing layer. Neither audition is imported by the game.
