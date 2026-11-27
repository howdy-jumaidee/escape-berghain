# Escape Berghain: MVP plan v2

Deadline: Saturday 28 Nov, 16:00. Playable in the browser, deployed on Vercel.

Team:
- **Dee**: code lead. Orchestrates agents in Zed, owns systems, integration and merges.
- **Emma**: 3D artist. Owns every asset, the look and the lighting.
- **Robin**: strategist. Owns story, dialogue, pitch, playtests and the clock.

## 1. What the MVP is

One level: the inside of Berghain, five connected zones. 5 memory fragments. 8 weird NPCs, half of them horses. 2 soft losses. 3 endings. Intro and credits.

Out of scope (goes in the pitch as "next levels"): swamp, industrial wasteland, mushroom underground, animal evolution, multiplayer.

## 2. Art direction: industrial and dirty

### What the real place is like (research)

- A former power plant from 1953, abandoned in the 1980s. Main room with 18 metre ceilings, all steel and concrete.
- Techno in the main hall. House upstairs in Panorama Bar, reached by a huge staircase past the cloakroom.
- There's an ice cream counter on an upper floor.
- Massive speaker stacks on the main floor.
- No photos allowed. Phone cameras get covered with a sticker at the door.
- The toilets have no mirrors, so nobody has to see their own face after a long night.
- Open from Saturday night to Monday morning.

### Look

- Dark, heavy, raw. Board marked concrete, rusted steel beams, steel grate floors, chain link, cables, exposed pipes, puddles.
- Mostly black and grey. Light comes only from a few sources: red and purple strobes, one cold white work light, green exit signs.
- Haze everywhere. Light shafts cutting through it.
- Scale makes you feel small. Pillars and ceilings are huge, the horse is tiny.
- Low poly, dirty textures, flat shading. Grime decals, stickers, gaffer tape, flyers half torn off.
- On top of everything: film grain, chromatic aberration, vignette. As the trip meter rises: blur, wobble, double vision, colour shifts.

The reference image (Second Life style club, purple stage) is close on lighting and crowd density. Go darker and dirtier: less stage show, more power plant.

### Zones in the one level

1. **Main hall.** Dance floor, pillars, speaker towers, the crowd. Start point.
2. **Bar and cloakroom.** Under the big staircase. Coat check counter.
3. **Toilet corridor.** Long queue, no mirrors, flickering light.
4. **Panorama Bar.** Up the staircase. Big window shutters, ice cream counter in the corner.
5. **Back exit.** Steel door, green exit sign, morning light leaking under it.

## 3. Story

**Premise.** Sunday morning inside Berghain. You took way too much and turned into a horse. You don't remember who you are or where you live. One goal: get home before your memory slips away completely.

**Why nobody noticed.** There are no mirrors in the toilets. Not even you noticed you're a horse. The spirit guide tells you.

**Trip meter.** Rises slowly all the time. Higher means blurrier and wobblier. Finding a fragment lowers it a little. Club Mate lowers it a lot but makes your legs jittery for 10 seconds. Ice cream from Panorama Bar gives brain freeze: the screen goes sharp for 5 seconds. At max you pass out.

**Spirit guide.** A tiny, faint ghost of human you. One short line after each fragment. Gets more solid as you remember more. Never gives direct answers.

### Intro (10 seconds, skippable)

1. Black screen, a kick drum through a concrete wall. Text: "Sunday. 06:12."
2. Neon tunnel, Crash Bandicoot style. A human silhouette spins through it and stretches into a horse.
3. Thud onto the dance floor. Legs wobble. The crowd doesn't care.
4. Spirit guide fades in: "Psst. That's us. There are no mirrors in here, so you didn't notice. We're a horse. We live somewhere. Let's go home."
5. Control hint: "WASD to walk. Space to grab with your hooves. Good luck."

### The clue chain

| # | Fragment | Zone | How you get it | What it unlocks |
|---|---|---|---|---|
| 1 | Your glasses | Main hall, under a speaker tower | Grab with hooves. They slip twice first | You can read small text. Blur drops a little |
| 2 | Wrist stamp | Your own front leg | With glasses on, look at yourself. Shows "47" | Number for the cloakroom |
| 3 | Cloakroom ticket #47 | Taped to a pillar near the bar | Grab it | Coat check hands over your jacket |
| 4 | Keys with a keychain | Jacket pocket | Shake the jacket (mash Space) | Spirit guide: "That keychain... our street!" |
| 5 | The way out | Riddle horse, toilet corridor | Answer the riddle | Right: shortcut up to Panorama Bar and the back exit. Wrong: detour through the queue, with a bonus Club Mate |

Reaching the back exit triggers the ending based on fragments held.

### Weird NPCs (half of them horses)

| NPC | Horse? | Where | What they do |
|---|---|---|---|
| Riddle horse | Yes | Toilet corridor | Horse head, human body, leather vest. Has been here since Friday. One riddle, three answers. MVP riddle: "I have keys but open no doors in here. I wait by the river for you. What am I?" Answers: "A piano", "My bike", "The bouncer". Right: "My bike" |
| Patrick | Yes | Bar | A horse convinced he's a man named Patrick from accounting. Gives confident, completely wrong directions. Following them is a detour with a hidden Club Mate |
| The herd | Yes, three | Main hall | Three horses dancing perfectly in sync. Stand in their line and stomp on the beat 4 times: they show you where fragment 3 is |
| Ice cream horse | Yes | Panorama Bar | Runs the ice cream counter. Only says "Eis?" Gives brain freeze |
| Friday guy | No | Main hall | Has been dancing since Friday. Gives directions only in BPM: "Left for about 128. Then up." |
| Coat check person | No | Cloakroom | "Ticket." Nothing else until you have it. Then: "Nice jacket. For a horse." |
| Toilet queue philosopher | No | Toilet corridor | Asks "Who are you, really?" The answer options depend on fragments found. Purely for laughs and spirit guide lines |
| Tourist couple | No | Main hall | Think you're a costume, try a selfie. The flash alerts security. Afterwards they have a sticker over their camera |
| Security | No | Patrols | Fixed routes, torches. Catching you calls animal control |
| Animal control | No | Arrives when called | Hi vis vest, a lasso. Secretly just wants to get in. Catches you: van ride, back to last checkpoint |

### Losses (soft, no game over screen)

- **Trip hits max:** fade out, wake up in the toilet queue. Keep your highest fragment.
- **Caught:** short van animation, respawn at the last checkpoint.

### Endings

- **Full memory (5/5):** you wake up in your own bed as a human. Camera pans to a hoofprint on the pillow.
- **Partial memory (1 to 4):** you wake up in the queue outside. Monday noon. The club is closing. You're still a horse. "Try again?"
- **Secret ending:** climb into the DJ booth and stomp on the beat 8 times in a row. The crowd turns. Card: "You never left. You are the resident horse DJ now."

### Easter eggs (cheap ones only)

- Front door bouncer: "Heute nicht." Turns you around. The front door is never the exit.
- The only mirror in the building, hidden behind the ice cream counter. Stand in front of it and for one second you see human you.
- Track names on the DJ booth screen are Dee, Emma and Robin.
- Credits roll on a cloakroom ticket.
- Konami code turns you into a rat for 30 seconds (teaser for evolution).
- After 10 minutes the Panorama Bar shutters open and morning light floods in.

## 4. Tech stack

Emma is a 3D artist, so the game is 3D. A fixed, angled top down camera keeps it simple to play and simple to build.

- **Vite + TypeScript + Three.js.** Plain Three.js, no framework, so every agent and Cursor can work with it.
- **Rapier** (`@dimforge/rapier3d-compat`) for collisions and the character controller only.
- **Fake ragdoll, not real ragdoll.** The horse is separate meshes (body, neck, head, four legs). Code wobbles them with springs. It looks like Gang Beasts and costs a fraction of real physics. Real ragdoll is the first thing that would blow the deadline.
- **`postprocessing`** (pmndrs) for the trip: blur, chromatic aberration, noise, vignette, glitch.
- **Level layout as a grid in JSON.** Each cell names a module from Emma's kit. No level editor needed.
- **Assets as `.glb`** in `public/models/`.
- **Hosting:** Vercel, connected to GitHub. Every pull request gets a preview URL.

Decide in the first 30 minutes and don't revisit: 3D Three.js, fixed camera, fake ragdoll.

## 5. Who does what

### Dee (Zed, Opus orchestrates)

- Repo, contracts, integration, every merge to `main`
- Spawns and reviews agents:
  - **Gemini Neon** (complex): horse controller with spring wobble, hoof grab, trip post effects
  - **SuperGrok** (medium): level loader from grid JSON, NPC system, fragments, patrols, endings state machine
  - **Mistral 4 Le Chonk** (easy): UI screens, HUD, audio manager, credits
- Tunes the blur curve with Emma

### Emma (Blender, Cursor)

- All assets, the lighting setup and the post effect look
- In Cursor: places assets in the level JSON, tweaks lights and materials in `src/look/`
- Works from the asset list below, in priority order

### Robin (strategy, words, clock)

- Writes all text in `content/*.json`: NPC lines, riddle, spirit guide lines, intro, end cards, credits
- Producer: runs the check ins, guards the cut list, calls feature freeze at 12:00
- Runs playtests: watches people play, writes bugs as GitHub issues
- Pitch: story, slides, the Lovable sizzle video, demo script, submission
- Checks the hackathon judging criteria tonight and tells the team what to optimise for

### Check ins (Robin runs them, 10 minutes, standing)

Tonight at the start and before sleep. Saturday at 08:00, 10:00, 12:00 and 14:00.

## 6. Emma's asset list

Rules for every asset:
- `.glb`, 1 unit = 1 metre, origin at the base, facing +Z
- Low poly. Under 5k triangles for characters, under 2k for props
- One texture per asset at most, 1024 px. Shared grime atlas where possible
- Name: `zone_object.glb`, for example `hall_pillar.glb`
- Unbranded: no real logos on bottles or speakers ("MATE", not Club-Mate)

Order of delivery:

**Tonight, greybox (first 2 hours).** Untextured boxes at the right scale so code can start: horse parts, human capsule, wall module 4 m, pillar, speaker tower, staircase, counter, door.

**Tonight, before sleep.**
1. Horse player in separate parts: body, neck, head, 4 legs (no rig needed)
2. Concrete wall module 4 m, with and without grime
3. Steel grate floor tile 4 m
4. Pillar, 18 m tall
5. Speaker tower

**Saturday by 10:00.**
6. Horse NPC base: horse head on a human body, 3 colour variants (riddle horse, Patrick, herd)
7. Human NPC base, 3 colour variants (crowd, Friday guy, tourists)
8. Security and animal control variants (torch, hi vis, lasso)
9. Spirit guide: translucent tiny human
10. Props: glasses, ticket, jacket, keys, MATE bottle, ice cream cone, phone
11. Bar counter, coat check counter, toilet cubicle row, big staircase, shutters, steel exit door, DJ booth

**Saturday by 12:00 (asset freeze).**
12. Decals: flyers, stickers, gaffer tape, puddles, exit sign
13. Intro tunnel and end card scenes (bed with hoofprint, queue, DJ booth)

Anything not done by 12:00 stays greybox. Greybox in good lighting still looks intentional.

## 7. Collaboration setup

### Repo

Public GitHub repo, for example `team-five/escape-berghain`. Public keeps Vercel free and simple. `.env` goes in `.gitignore` from the first commit. Never commit API keys.

- Protect `main`: pull requests only, 1 approval
- Collaborators: Emma, Robin, the Grok bot accounts
- Labels: `dee`, `emma`, `robin`, `asset`, `content`, `night-shift`, `gemini`, `grok`, `mistral`, `blocker`
- Large files: models are small enough for plain git. If one goes over 20 MB, it's too heavy for the web anyway

### One rules file for every tool

`AGENTS.md` in the repo root. Zed, Cursor and the Grok bots all read it.

```
# Escape Berghain: rules for agents

Read SPEC.md and src/contracts.ts before writing code.
Only touch the folders named in your issue.
Never edit src/contracts.ts. Ask in the issue if it needs to change.
Systems talk only through the event bus in contracts.ts.
All player facing text lives in content/*.json. Never hardcode text.
Models load from public/models/ by name. If a model is missing, use a grey box of the same size.
One issue, one branch, one pull request. Branch: <issue-number>-<short-name>.
Never push to main.
Run `npm run build` before opening a PR. A PR that doesn't build is not done.
```

### Folder ownership

| Folder | Owner | Builder |
|---|---|---|
| `src/contracts.ts`, `src/main.ts` | Dee | Opus only |
| `src/player/` horse, wobble, hoof grab | Dee | Gemini Neon |
| `src/fx/` trip meter, post effects | Dee | Gemini Neon |
| `src/look/` lights, materials, fog, haze | Emma | Emma in Cursor |
| `src/world/` level loader, pickups, checkpoints, patrols | Dee | SuperGrok |
| `src/npc/` NPC behaviour, dialogue, riddle | Dee | SuperGrok, Grok bots at night |
| `src/game/` endings, losses, secret DJ, easter eggs | Dee | SuperGrok |
| `src/ui/` title, intro, HUD, end cards, credits | Dee | Mistral |
| `src/audio/` music, SFX | Dee | Mistral, Grok bots at night |
| `public/models/`, `public/textures/` | Emma | Emma |
| `content/` all text | Robin | Robin |
| `levels/level1.json` | Emma | Emma and Dee |

### Flow for every task

1. The task is a GitHub issue using the template below
2. Whoever picks it up works on its own branch
3. Open a PR. Vercel posts a preview link
4. Someone plays the preview, approves, merges
5. Only Dee merges code. Emma merges assets and `src/look/`. Robin merges `content/`

### Issue template

```
Goal: one sentence
Folder: the only folder you may touch
Implements: which events or types from contracts.ts
Done when: a test a human can do in the preview in 30 seconds
Out of scope: what not to do
```

## 8. Contracts (first thing Opus writes)

`src/contracts.ts`:

- `GameState`: `trip` (0 to 100), `fragments` (ids 1 to 5), `checkpoint`, `clubMateActive`, `brainFreezeActive`, `ending`
- Events: `fragment:found`, `trip:changed`, `trip:max`, `player:caught`, `riddle:answered`, `npc:talk`, `herd:synced`, `exit:reached`, `ending:show`, `secret:dj`, `mirror:seen`
- Types: `FragmentId`, `EndingId`, `NpcId`, `ZoneId`, `ModelName`

## 9. Timeline

Times assume you start Friday evening. Shift if later. The end times don't move.

### Tonight, block 1: setup (2 hours)

- **Dee:** repo, Vite + Three.js + Rapier scaffold, Vercel, blank scene deployed. `AGENTS.md`, `SPEC.md`, issue template, labels, branch protection. Opus writes `contracts.ts`
- **Emma:** greybox kit. Lighting mood test in Blender: one screenshot of the main hall that everyone agrees on. That screenshot is the art bible
- **Robin:** reads the judging criteria. Writes `content/` first draft: intro, spirit guide lines, riddle, NPC one liners. Creates all issues from section 10

### Tonight, block 2: first playable before sleep (4 to 5 hours)

Goal before anyone sleeps: **a wobbly horse walks through the greybox main hall in moody light, picks up the glasses, the blur rises, and the back exit triggers an ending.** The night bots need a working base.

- **Dee:** Opus spawns Gemini Neon (horse, trip FX) and SuperGrok (level loader, fragments, endings). Integrates and deploys
- **Emma:** horse parts, wall, floor, pillar, speaker tower. Lights and haze in `src/look/`
- **Robin:** plays every preview, logs bugs, finishes all text, writes the pitch outline

### Overnight: Grok bots

Only issues labelled `night-shift`. Contained, low risk:
- NPC dialogue system reading `content/npcs.json`
- Riddle UI and the philosopher's answer options
- Herd sync dance check (stomp on beat in their line)
- Credits on a cloakroom ticket
- Audio manager, techno loop, footstep and hoof SFX
- Konami rat easter egg
- Mirror easter egg trigger

Off limits at night: `player/`, `fx/`, `look/`, `contracts.ts`, `public/models/`. Bots open PRs. They never merge.

### Saturday

| Time | Dee | Emma | Robin |
|---|---|---|---|
| 08:00 | Check in. Review and merge night PRs | Check in | Check in. Reorder priorities |
| 08:00 to 10:00 | Integrate NPCs, all 5 fragments in place | NPC models, props | Full playthrough, bug issues |
| 10:00 | Check in | Check in | Check in |
| 10:00 to 12:00 | Easter eggs, secret ending, blur tuning with Emma | Counters, staircase, decals, lighting polish | Playtest with outsiders. Start pitch deck |
| **12:00** | **Feature and asset freeze** | | Robin calls it |
| 12:00 to 14:00 | Bug fixes only | Lighting and material fixes only | Cold playtests (3 people), Lovable sizzle footage |
| 14:00 | Production deploy | Record 60 second backup playthrough | Check in, final pitch |
| 14:00 to 15:00 | Hotfixes only | Pitch visuals, screenshots | Sizzle video, slides |
| 15:00 to 15:30 | Demo rehearsal x2 | Demo rehearsal | Leads the rehearsal |
| **15:30** | | | **Submit.** 30 minutes buffer |

Sleep in shifts. Someone should be awake to check the night bots once around 03:00.

## 10. Issue list

| # | Issue | Folder | Who / builder | Night |
|---|---|---|---|---|
| 1 | Scaffold, Vercel, contracts | root | Dee / Opus | |
| 2 | Horse controller with spring wobble | player | Dee / Gemini Neon | |
| 3 | Hoof grab and drop | player | Dee / Gemini Neon | |
| 4 | Trip meter and post effects, Mate and brain freeze | fx | Dee / Gemini Neon | |
| 5 | Lighting, haze, materials | look | Emma | |
| 6 | Greybox kit | models | Emma | |
| 7 | Hero assets (horse, wall, floor, pillar, speaker) | models | Emma | |
| 8 | NPC and prop assets | models | Emma | |
| 9 | Level loader from grid JSON, collisions | world | Dee / SuperGrok | |
| 10 | Level 1 layout, 5 zones | levels | Emma and Dee | |
| 11 | Fragment pickups and checkpoints | world | Dee / SuperGrok | |
| 12 | Security, animal control, tourist patrols | world | Dee / SuperGrok | |
| 13 | Endings state machine and losses | game | Dee / SuperGrok | |
| 14 | NPC dialogue from JSON | npc | Grok bot | yes |
| 15 | Riddle UI and branching | npc | Grok bot | yes |
| 16 | Herd sync dance | npc | Grok bot | yes |
| 17 | Title, intro, HUD | ui | Dee / Mistral | |
| 18 | End cards and credits | ui | Grok bot | yes |
| 19 | Audio manager, music, SFX | audio | Grok bot | yes |
| 20 | Secret DJ ending | game | Dee / SuperGrok | |
| 21 | Konami rat and mirror easter eggs | game | Grok bot | yes |
| 22 | All text in content/ | content | Robin | |
| 23 | Judging criteria, pitch, sizzle, submission | pitch | Robin | |

## 11. If you fall behind, cut in this order

1. Konami rat
2. Mirror easter egg
3. Secret DJ ending
4. Ice cream horse and brain freeze
5. The herd (fragment 3 becomes a plain pickup)
6. Tourist couple selfie
7. Riddle (fragment 5 becomes a plain pickup)
8. Intro animation (replace with a text card)

Never cut: the wobbly horse, the dirty industrial look, the blur, the 5 fragment chain, one ending that works.

## 12. Risks

- **3D scope.** If the horse doesn't walk well by midnight, drop to simpler movement (no wobble on legs, only body sway). Don't keep tuning past that.
- **Asset pipeline.** Test one Emma `.glb` in the live build within the first 2 hours, so scale, origin and materials are sorted before she makes 20 more.
- **Night bots.** They can't merge, and they can't touch core folders. Worst case you throw their PRs away at 08:00.
- **Names and brands.** Using Berghain's name is parody, which is probably fine for a hackathon. Keep real logos and real people (like the head bouncer) out. Robin should check the hackathon rules.
