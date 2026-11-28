# Handoff report: Claude (Opus), tasks E and F, Saturday 28 Nov 2026

Picked up from `docs/handoff-claude-2026-11-28.md` (issue #162).

## Task E: white spots in dark scenes (fixed, root cause)

**Cause:** `HueSaturationEffect` in the final grade pass rotates hue with a matrix that has negative entries and only clamps the top (`min(color, 1.0)`). On near-black pixels a channel goes below zero, more so as trip raises saturation. The final sRGB encode is a `pow`, which turns a negative value into NaN, and the GPU draws NaN as solid white. That's why it only happened when it was really dark, at higher trip, and only sometimes (the hue rotation swings with time).

**How it was found:**
- Ruled out by testing: the spirit guide (hid it, spots stayed) and bloom (turned it off, spots stayed). The composer buffers are 8-bit with 0% clipped pixels and full alpha, so it wasn't HDR clipping or transparency either.
- The canvas read 8.7 to 11.4% white with the final grade pass on and 0.0% with it off, so the white was created in that pass.

**Fix:** a tiny `NoNegativeColourEffect` (`max(rgb, 0)`) right after hue/saturation in `src/fx/trip.ts`. Bloom, blur, grade and wobble are all unchanged.

**Proof (A/B, darkroom, trip held at 85, 15 s each):**
- clamp on: 0 of 149 sampled frames had white, worst 0%
- clamp off: 130 of 151 frames had white, worst 11.3% of the screen

Also: `?debug` now exposes `fx` and `renderer` on `window.eb`, for this kind of debugging.

## Task F: game feel

Built by a Claude agent on branch `game-feel-pass`, its own PR:
- **Early win:** the glasses are about 35 m from spawn (roughly 25 s). The first spirit guide line now gives the route and waits until the herd hint has passed.
- **Goal gradient:** a pickup sting that rises with each memory, a one-line reaction per find that switches to "almost there" from 3, and the next goal in the help box.
- **Surprise:** a unicorn rumour at 55 s if you haven't met one.
- **Fair failure:** caught now respawns you in the zone you were caught in (the back exit falls back to the last checkpoint), with new joke lines. Memories were already kept.

## Still open
- The pickup sting hasn't been checked by ear.
- `losses.caught` and `losses.passed_out` in content are unused now.
