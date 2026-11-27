# Roadmap

Deadline: Saturday 28 Nov, 16:00. Each phase ends with a gate. Nothing from a later phase starts until the gate passes, except night shift work.

## What we ship

Escape Berghain is a web app. It runs in the browser with nothing to install, and it lives on Vercel with a public URL that judges open on their own laptop.

- **Live game:** production deploy of `main` on Vercel (URL in the README once it's up). This is the link in the pitch and the demo
- **Previews:** every PR gets its own Vercel URL. Somebody plays it before merge
- Desktop Chrome, Firefox and Safari. Keyboard controls. Mobile is out of scope
- Static Vite build, no server, no accounts, no keys

## Sound

The music is Berghain techno: dark, hard and driving, around 132 BPM. Four on the floor kick with the long rumble tail under it, off beat hats, a clap on 2 and 4, a low droning stab. No vocals, no house, no EDM drops. Upstairs in Panorama Bar it stays techno but warmer and brighter. In the toilet corridor it's muffled through the wall.

It's generated live in the browser with the Web Audio API, so there are no tracks to license and nothing to download. The whole game shares one beat clock (`BPM` in `contracts.ts`): strobes, the herd dance and the secret DJ stomp all lock to it. As the trip rises the music bends with you: the filter drifts and the pitch wobbles.

Every gate ends with a recap: `docs/recaps/phase-<n>.md` (see `docs/recaps/TEMPLATE.md`). The recap covers the gate verdict, evals (build, preview walkthrough, "done when" tests, playtest notes) and bug testing (bug bash, console errors, issues filed). Dee writes it in chat and in the file.

## Phase 0: Foundation (Friday evening, 2 hours)

- [x] Scaffold: Vite, TypeScript, Three.js, postprocessing, Rapier
- [x] `contracts.ts` with state, types and event bus
- [x] Greybox hall, wobbly box horse, trip meter with chromatic aberration and camera wobble
- [x] Model loader with grey box fallback, model viewer at `/?viewer=<name>`
- [ ] GitHub repo public, `main` and `dev`, branch protection, CI
- [ ] Vercel connected, production on `main`, previews on PRs
- [ ] All issues created
- [ ] Emma: greybox kit and one lighting mood shot everyone agrees on
- [ ] Robin: judging criteria read, first draft of `content/`, pitch site started in its own Lovable project

**Gate 0:** the greybox build is live on its public Vercel URL and Emma has a PR preview working from Cursor.

## Phase 1: First playable (Friday night, before sleep)

- [ ] Horse controller with spring wobble and hoof grab (#2, #3)
- [ ] Trip meter with blur, Mate and brain freeze (#4)
- [ ] Level loader from grid JSON, collisions (#9)
- [ ] Fragment 1 (glasses) pickup and one checkpoint (#11)
- [ ] Back exit triggers an ending (#13)
- [ ] Emma's first models in the build: horse parts, wall, floor, pillar, speaker (#7)
- [ ] Lighting and haze in `src/look/` (#5)

**Gate 1:** walk through the hall in moody light, grab the glasses, blur rises, reach the exit, see an ending. Merged to `main`.

## Phase 2: Night shift (Friday night to Saturday 08:00)

Grok bots on `night-shift` issues only, PRs into `dev`:
- [ ] NPC dialogue from JSON (#14)
- [ ] Riddle UI (#15)
- [ ] Herd sync dance (#16)
- [ ] End cards and credits (#18)
- [ ] Audio manager, generated Berghain techno at 132 BPM, SFX (#19)
- [ ] Konami rat and mirror easter eggs (#21)

**Gate 2 (08:00):** night PRs reviewed by Opus, merged or closed.

## Phase 3: Content complete (Saturday 08:00 to 12:00)

- [ ] All 5 fragments in the chain (#11)
- [ ] All NPCs placed with lines (#14, #22)
- [ ] Patrols, caught loss, pass out loss (#12, #13)
- [ ] Intro, HUD, title (#17)
- [ ] Secret DJ ending (#20)
- [ ] NPC and prop models, counters, staircase, decals (#8)
- [ ] Gemini Neon bug bash at 10:00

**Gate 3 (12:00): feature and asset freeze.** Full playthrough possible with all 3 endings. Merged to `main`.

## Phase 4: Polish and fix (Saturday 12:00 to 14:00)

- [ ] Only `fix/` branches merge
- [ ] Neon bug bash, then fixes
- [ ] 3 cold playtests by outsiders, run by Robin
- [ ] Blur curve and difficulty tuning

**Gate 4 (14:00):** production deploy from `main`, live URL opened and played on a laptop that isn't ours. 60 second backup video recorded.

## Phase 5: Ship and pitch (Saturday 14:00 to 16:00)

- [ ] Lovable sizzle video
- [ ] Pitch slides and demo script
- [ ] Rehearse twice
- [ ] Submit at 15:30

## Cut list (in this order if behind)

1. Konami rat
2. Mirror easter egg
3. Secret DJ ending
4. Ice cream horse and brain freeze
5. The herd
6. Tourist selfie
7. Riddle
8. Intro animation

Never cut: wobbly horse, dirty industrial look, blur, the 5 fragment chain, one working ending.
