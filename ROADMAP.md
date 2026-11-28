# Roadmap

**Status Saturday 28 Nov, 11:45 CET (pitch 14:00-16:00, submit 15:30).** `main` is at `38ac767`, promoted in #174, and production deployed at 11:45 (READY): https://escape-berghain.vercel.app and https://escapeberghain.dev serve it now. Earlier detail in `docs/recaps/phase-4.md`.

- Title screen: three-line goal (horse, five memories, back exit before you black out), a Controls toggle (WASD, Space, Q, E, V, M), and a separate Play button. In play, one fading line says the next step. Still no HUD, plus a glass help box (H) with tips and a memory checklist (#160, #170).
- NPC figures replace the cubes: low-poly club people, plus horses, unicorns and donkeys. The crowd stays instanced. The same guests stand on the 9 m galleries. Limbs swing on the beat (fake ragdoll, not physics).
- Two camera views only. V cycles follow and the horse's eyes. Top down is gone.
- Soft hazy light in both views. Strongest in first person. In follow, shafts and a rim wrap the horse, with haze in front of the lens. Contrast drops so it stays dreamy.
- Saturday morning fairness pass (handoff in `docs/handoff-gemini-2026-11-28.md`, report in `docs/recaps/handoff-gemini-report.md`): only 6 story/strange NPCs auto-grab you, the rest are Space-to-talk with a glass prompt (#158, #167); 40 s patrol grace and guards start far from spawn (#164); softer start with 45 s trip grace (#161); hoof bags are Space-only, milder (+12 trip, 6 s) and half as many (#165); auto-talk NPCs spaced at least 18 m apart (#166).
- White spots in dark scenes fixed at the root: clamp after the hue wobble (#172). Game feel pass: next-goal mission line, memory sting, found reactions, early rumour, fairer catches (#173). Darkroom labyrinth behind the toilets (#169).
- Open PRs awaiting review: #150 captions, #155 per-zone audio grooves, #157 horsey renaming.

Deadline: Saturday 28 Nov, 16:00. Each phase ends with a gate.

**Play it:** https://escape-berghain.vercel.app (production, from `main`). Every PR also gets a Vercel preview (behind Vercel login for now, #36).

Every gate ends with a recap: `docs/recaps/phase-<n>.md` (see `docs/recaps/TEMPLATE.md`). The recap covers the gate verdict, evals (build, preview walkthrough, "done when" tests, playtest notes) and bug testing (bug bash, console errors, issues filed). Dee writes it in chat and in the file.

## Where we are

The whole game is playable start to finish in the browser, live at `main` = `38ac767`. You wake up as a horse on the dance floor, find five memories, slip past security through a packed crowd, and stagger out the back exit. Four endings, a darkroom labyrinth, story flags that change NPC lines. Generated Berghain techno. What's left: review the three open PRs, Emma's models and lighting, Robin's cold playtests, and the pitch. Nice-to-haves are listed below if there's time.

## Direction (decided Friday night)

- **Minimal.** No HUD. The blur is your trip meter, the spirit guide's solidity is your memory. Text only appears when you touch something: an object, a clue, a special NPC
- **One typeface: Fragment Mono**, like the poster. Pitch black title and intro
- **Intro:** pitch black, the lines one by one ("There are no mirrors in here..."), a thin white swirl, then you're the horse
- **Hard to steer**, like someone drunk and high on two legs: you go where you face, turning overshoots, you lurch
- **Sound:** Berghain techno at 132 BPM, generated live with Web Audio. One beat clock for music, strobes, the herd and the DJ booth

## Done

**Foundation (Phase 0).** Vite, TypeScript, Three.js, postprocessing. `contracts.ts` event bus. Model loader with grey box fallback and `/?viewer=<name>`. Public repo, `main` and `dev`, branch protection, CI. Vercel production on `main`.

**First playable (Phase 1, #24 to #34).** Jointed horse with spring wobble, grab and stomp. Level loader from grid JSON with collisions. Trip blur, double vision, colour drift, Mate and brain freeze. Endings and losses. Title, captions, dialogue, end cards. NPC dialogue from JSON, the riddle, the herd sync dance. Generated techno with zone mixing.

**Content complete (Phase 3, #37 to #46).** The five memory chain: glasses under the speaker, the wrist stamp (Q, only with glasses), ticket 47, keys from the coat check, the riddle horse. Security patrols with torches, animal control van, tourist selfie. Bouncer at the front door. Visible spirit guide. Secret DJ ending. Panorama shutters open after 10 minutes.

**Make it a club (Phase 3b, #47 to #60).**
- [x] 250 dancers on the beat, a toilet queue, they shove you, they hide you from torches (they block about half the sight lines), more horse heads the higher you are
- [x] Leather choir (the music opens up) and the 6 am cleaner (wet floor, you slide)
- [x] Riddle horse wants your keys first, so the chain runs in order
- [x] HERD ending: pass out three times and you join them
- [x] Closing time: all five memories, house lights, red torches, faster guards, sirens, the acid line peaks
- [x] Low-res render, light shafts, lasers, stuttering strobes, camera kick on the beat, crowd murmur and cheers
- [x] Code: one fragment owner, named input locks, typed data loader, shared beat counter, content key check in CI, `?debug` flags

**Minimal pass (this PR chain).**
- [x] No HUD, Fragment Mono only, pitch black title and minimal swirl intro
- [x] Drunk steering
- [x] Jacket story simplified: give the ticket, get the keys. No minigame, no phone, no clock
- [x] Cut list items 1 to 3 cut: extra regulars, Konami rat, mirror
- [x] Two views (V): follow cam and the horse's own eyes. Top down removed (#87)

## Phase 4 status (Saturday 11:45): polish and fix is landed

| Who | What | Status |
|---|---|---|
| Gemini Neon | Bug bash on `dev`, steering and blur tuning | Out of tokens; Mistral took the handoff tasks A-D (#164-#167). Steering ramp and 45 s trip grace landed in #161 |
| SuperGrok | Patrol balance vs crowd cover | #161 kinder guards (6.5 m sight, 2 s torch); #164 start grace + far spawn |
| Mistral | Captions (#69), audio per zone (#70) | PRs open: #150, #155 |
| Claude (Opus) | White spots root cause, game feel | Merged: #172, #173 (issue #162) |
| Emma | Models in the build (#7, #8), lighting in `src/look/` (#5) | Still open |
| Robin | Story drafts in `content/` (#22), 3 cold playtests, pitch (#23) | Still open |

- [x] **Steering ramps up.** It started too aggressive. Now you start almost sober (stiff, steady, no lurching) and it gets looser over 90 seconds in the club, plus more with the trip: overshooting turns, slower to line up, sideways lurches. Tune `SOBER_UP_SECONDS` in `src/player/horse.ts`. Getting caught or passing out resets it to soft, so a respawn isn't a punishment
- [x] **Rare special creatures & 11-bone techno dance.** Ring-tailed lemur (west 9 m gallery), chimpanzee, giant panda, and Fallout ghoul with Space interactions, plus 11-bone NPC techno dance rigs and GPU vertex-shader crowd animations
- [x] **Horse ragdoll collapse & brutalist concrete.** Loss sequences (caught / blackout) collapse the horse onto brutalist procedural concrete floors
- [x] **Overcrowded toilets, 4 live DJs & talk-back dialogue.** Packed toilet corridor + 4 live animated DJs at the booth, and interactive 1/2/3 talk-back dialogue choices on 5 key NPCs (`friday_guy`, `bartender_bear`, `philosopher`, `leather_daddy`, `drag_oracle`)
- [x] Only `fix/` branches after 12:00 (in force from 12:00 today)
- [ ] 3 cold playtests by outsiders, run by Robin

**Gate 4 (14:00):** production deploy from `main` — done at 11:45, `main` `38ac767` is READY on Vercel. Still open: live URL played on a laptop that isn't ours, and the 60 second backup video recorded.

## Next: nice-to-haves

Only after Gate 4 is safe. Each one is an issue for one model, in its own folder.

- [x] **Different views.** V cycles follow and eyes. Top down is gone (#87)
- [x] **Multiple floors.** The 9 m galleries are walkable with dancers (#85) and Panorama Bar sits on the 9 m south gallery (#101)
- [x] **Berliner dark club cast, rare unicorns & Berghain haze.** Real shirtless/leather Berliner NPCs and crowd, horses/donkeys/rare unicorns with Space clarity blessing, fog-machine smoke clouds, hoof stomp shockwave, and comedy dialogue pass (#102, #105)
- [x] **Interactive talk-back NPCs, rare creatures, GPU crowd & live DJs.** Talk-back choices with real gameplay help (`friday_guy`, `bartender_bear`, `philosopher`, `leather_daddy`, `drag_oracle`), Lemur/Chimp/Panda/Ghoul sightings, 11-bone NPC techno dance + GPU vertex-shader crowd, horse ragdoll collapse on loss, brutalist concrete textures, overcrowded toilets, and 4 live DJs
- [ ] **Custom donkey & unicorn 3D assets.** Swap procedural equine heads for downloaded donkey and unicorn models once dropped in `~/Downloads`
- [x] **Spatial sound cues ("follow your ears").** Faint shimmering ping when within ~12 m of an uncollected memory fragment and a crystalline shimmer when passing a rare unicorn (#128, #133)
- [x] **Interaction proximity pulse & beat-sync stomp feedback.** Subtle visual glow when within Space grab/talk range and a brighter shockwave ring when E lands cleanly on the beat (#124, #132)
- [x] **Dynamic Toilet Queue Philosopher.** Scale his lines live with how many memories you hold (`0` to `5`) so backtracking rewards repeat talks (#125)
- [x] **Softer start for cold playtests.** 45 s trip grace, trip about 4x slower, steering ramps over 5 minutes, gentler guards, plus a glass help box with tips and a memory checklist (#160, #161)
- [x] **Labyrinth mystery.** The darkroom maze behind the toilets: shifting walls, trip glow, clues, staff door out (#169)
- [ ] Convert fonts to woff2 (smaller download)
- [ ] Mobile touch controls
- [ ] **Save and continue.** Persist the run to localStorage (memories found, trip, story flags, zone, position), autosaved on each memory and each zone change, with a Continue button on the title screen next to Play and a small reset-save line. So people can stop and come back to explore more.
- [ ] **Unlockable skins for the horse.** Beat an ending or find a secret to unlock a look (unicorn horn after the blessing, donkey ears, etc.), picked on the title screen and stored in the same save.
- [ ] **DJ battle.** A beat-matching stomp-off against a live DJ at the booth: land E on the beat to take rounds, miss and the crowd boos. Survive three rounds for a secret reward or a new ending.

## Pitch (Saturday 14:00 to 16:00)

- [ ] Lovable sizzle video
- [ ] Pitch slides and demo script
- [ ] Rehearse twice
- [ ] Submit at 15:30

## Cut list (in this order if behind)

Already cut: weird regulars beyond the leather choir and the cleaner, Konami rat, mirror easter egg.

1. HERD ending
2. Secret DJ ending
3. Ice cream horse and brain freeze
4. The herd
5. Tourist selfie
6. Riddle (fragment 5 becomes a plain pickup)

Never cut: wobbly horse, dirty industrial look, the crowd, blur, the 5 fragment chain, one working ending.
