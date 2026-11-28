# Roadmap

**Tonight (Fri 27 into Sat 28, before the pitch).** Recap of what landed. Detail in `docs/recaps/phase-4.md`.

- Title screen: three-line goal (horse, five memories, back exit before you black out), a Controls toggle (WASD, Space, Q, E, V, M), and a separate Play button. In play, one fading line says the next step. Still no HUD.
- NPC figures replace the cubes: low-poly club people, plus horses, unicorns and donkeys. The crowd stays instanced. The same guests stand on the 9 m galleries. Limbs swing on the beat (fake ragdoll, not physics).
- Two camera views only. V cycles follow and the horse's eyes. Top down is gone.
- Soft hazy light in both views. Strongest in first person. In follow, shafts and a rim wrap the horse, with haze in front of the lens. Contrast drops so it stays dreamy.
- Go-live: `dev` was squash-merged to `main` in #91. GitHub build is green. Vercel did not deploy: "Deployment rate limited — retry in 24 hours." https://escape-berghain.vercel.app was still the previous bundle when checked.

Deadline: Saturday 28 Nov, 16:00. Each phase ends with a gate.

**Play it:** https://escape-berghain.vercel.app (production, from `main`). Every PR also gets a Vercel preview (behind Vercel login for now, #36).

Every gate ends with a recap: `docs/recaps/phase-<n>.md` (see `docs/recaps/TEMPLATE.md`). The recap covers the gate verdict, evals (build, preview walkthrough, "done when" tests, playtest notes) and bug testing (bug bash, console errors, issues filed). Dee writes it in chat and in the file.

## Where we are

The whole game is playable start to finish in the browser. You wake up as a horse on the dance floor, find five memories, slip past security through a packed crowd, and stagger out the back exit. Four endings. Generated Berghain techno. What's left is polish, Emma's models and lighting, playtests and the pitch, plus nice-to-haves if there's time.

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

## Now: Phase 4, polish and fix (Saturday morning to 14:00)

| Who | What | Issue |
|---|---|---|
| Gemini Neon | Bug bash on the `dev` preview, then fixes | label `bug` |
| Gemini Neon | Tune drunk steering and the blur curve: hard but fair. Steering now ramps (see below) | see issues |
| SuperGrok | Balance patrols against crowd cover; guards push through dancers | see issues |
| Mistral | Caption timing and sizes in Fragment Mono; audio mix pass per zone | see issues |
| Emma | Models in the build (#7, #8), real lighting in `src/look/` (#5) | |
| Robin | Rewrite the story drafts in `content/` (#22), 3 cold playtests, pitch (#23) | |

- [x] **Steering ramps up.** It started too aggressive. Now you start almost sober (stiff, steady, no lurching) and it gets looser over 90 seconds in the club, plus more with the trip: overshooting turns, slower to line up, sideways lurches. Tune `SOBER_UP_SECONDS` in `src/player/horse.ts`. Getting caught or passing out resets it to soft, so a respawn isn't a punishment
- [ ] Only `fix/` branches after 12:00
- [ ] 3 cold playtests by outsiders, run by Robin

**Gate 4 (14:00):** production deploy from `main`, live URL played on a laptop that isn't ours. 60 second backup video recorded.

## Next: nice-to-haves

Only after Gate 4 is safe. Each one is an issue for one model, in its own folder.

- [x] **Different views.** V cycles follow and eyes. Top down is gone (#87)
- [ ] **Multiple floors** (Dee wants these). The 9 m galleries are walkable and now have dancers (#85). Still open: Panorama Bar as a real second floor, one `levels/level1.json` grid per floor, seen through a gap in the ceiling
- [ ] **Labyrinth mystery.** The darkroom maze behind the toilets: a dark labyrinth lit only by your trip, where the walls shift on the beat and the way through is written in clues (flyers, stamps, the Friday guy's BPM directions). A sixth memory, or a secret way out
- [ ] Convert fonts to woff2 (smaller download)
- [ ] Mobile touch controls

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
