# Phase 0-2 recap — Foundation, first playable, night shift

Date/time: 2026-11-27 20:27 UTC
Preview: https://escape-berghain-git-dev-howdy-jumaidees-projects.vercel.app (behind SSO, see #36)
Production: https://escape-berghain.vercel.app (public, 200 OK)
PRs merged into dev: #24-#34. Open: #35 "Gate 1: Phase 1 and 2 to main" (CI green: build pass x2, Vercel pass)

## Gate verdict

- **Gate 0: PASS with one caveat.** Production on `main` is live and public (curl 200, no auth). Caveat: PR preview deployments 302 to Vercel SSO login, so "Emma plays the PR preview" needs a Vercel login or protection off. Filed as #36.
- **Gate 1: PASS on the dev build, pending merge.** Walked through the hall, grabbed the glasses (slipped twice, then `fragment:found`), trip rose and dropped on pickup, reached the exit, ending card shown. Verified headless against the production build of `dev` (`vite preview` on `dist/`). CI green on #35. Not yet merged to `main` — needs Opus review + Dee merge.
- **Gate 2: features present in dev** (NPC dialogue + riddle + herd #32, end cards/credits #31, generated techno + SFX #33, Konami rat + mirror #30), all inside #35. Night bots took no `night-shift` issues; Opus built Phase 2 early on Friday evening instead.

## What shipped

- #24 contracts: beat clock (132 BPM), grid helpers, full event map
- #25 level 1: all 5 zones connected, riddle gate, Mate, NPC spots, mirror
- #26 content keys for HUD, hints, herd, gate, endings, credits, NPC names
- #27 horse controller: jointed parts, trip wobble, Mate jitter, grab, stomp
- #28 level loader, collisions, pickups, checkpoints, exit + riddle gate
- #29 trip FX: blur, double vision, colour drift, Mate, brain freeze
- #30 endings, pass-out and caught losses, spirit guide lines, Konami rat, mirror
- #31 UI: title, intro, HUD, dialogue, riddle chooser, end cards, ticket credits
- #32 NPCs: dialogue from JSON, riddle branch, herd sync dance
- #33 audio: generated Berghain techno at 132 BPM, zone mixing, SFX, beat clock
- #34 roadmap progress + model names for Emma

## Evals

- `npm run build`: PASS (tsc + vite, 33 modules, only chunk-size warning on the models chunk, 623 kB)
- Headless Chromium walkthrough of the `dist` build (SwiftShader WebGL):
  - boot: canvas + `window.eb` present, PASS
  - Enter starts title -> intro -> `state.started`, PASS
  - WASD movement: 9.6 m in 5 s of held keys, PASS
  - trip rises over time: 11.4 -> 13.0 in 6 s, PASS
  - grab glasses at fragment 1 cell: 2x `item:slipped`, then `fragment:found` id=1, trip 10.0 -> 0.07, PASS
  - `exit:reached` -> ending `partial_memory` card ("NOT QUITE", queue scene, cloakroom-ticket credits), PASS
  - `trip:max` -> pass-out loss, respawn at checkpoint `main_hall`, trip reset to 45, PASS
  - `/?viewer=hall_pillar` with missing model: grey box fallback renders, no crash, PASS
- Playtest notes: none yet (Robin's cold playtests are Phase 4). Screenshots from the run: in-game HUD (trip bar, memory diamonds, hint line), ending card, viewer.

## Bug testing

Bug bash method: headless Chromium on the `dist` build, played boot -> start -> move -> grab -> exit -> ending -> trip:max -> viewer, console + pageerror + network captured throughout.

- Console errors: NONE. Page errors: NONE.
- Failed network: none in the game itself; the viewer's missing model 404 is handled by the grey box fallback.
- Issues filed: #36 (Vercel preview SSO protection blocks PR previews)
- Known quirks, not bugs:
  - `npm run dev` does full HMR reloads mid-play whenever a file changes on disk (another agent editing). Use the preview build for stable playtesting.
  - One fragment dropped trip from 10 to ~0. Spec says a fragment "lowers it a little". Tuning flag for Phase 4 blur/difficulty pass.
  - Scene is very dark grey — expected, Emma's real lighting pass is #5, still open.

## Cuts taken

None. Cut list untouched.

## Risks going into Phase 3

- #36 preview protection blocks "somebody plays the preview" — fix before the 08:00 gate review wave.
- Emma's models (#6, #7, #8) and real lighting (#5) still open; everything renders as grey boxes under placeholder lights. Biggest visual risk for the pitch.
- PR #35 needs Opus review + merge before anything in Phase 3 branches off a current dev.
- Open phase-3 issues: #8, #11, #12, #17, #20, #22, #23.

## Next gate

Gate 3 (12:00 Saturday): feature and asset freeze, full playthrough with all 3 endings, merged to `main`. Still open for it: all 5 fragments in the chain, patrols/caught/pass-out wired to real gameplay, intro+HUD+title polished, secret DJ ending, NPC/prop models, Neon bug bash at 10:00.
