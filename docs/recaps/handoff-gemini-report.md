# Handoff report (Gemini's tasks, done by Mistral), Saturday 28 Nov 2026, ~11:30 CET

Dee's handoff: `docs/handoff-gemini-2026-11-28.md`. Gemini's quota ran out, so Mistral took the tasks.
Claude (Opus) was handed tasks E and F separately: `docs/handoff-claude-2026-11-28.md`, issue #162.

## PRs

Merged into `dev` (squash, CI green each time):

- #160 glass help box, #161 softer start (already merged by Dee before I started)
- **#164** Task A: 40 s patrol grace from `intro:land`, guards start at the route waypoint farthest from spawn (`src/world/patrols.ts`)
- **#165** Task B: hoof bags Space-only, +12 trip / 6 s hooved, 10 to 5 bags kept off the main paths (`src/world/index.ts`, `src/fx/trip.ts`, `levels/level1.json`, `content/story.json`)
- **#166** Task C: riddle_horse to [15,8], drag_oracle to [7,11]; all AUTO_TALK pairs now >= 18 m, >= 12 m from spawn (`levels/level1.json`)
- **#167** Task D: glass "Space Talk/Grab" prompt; the one allowed `src/contracts.ts` change (`player:near.kind`), called out in the PR

Closed: #154 (auto-pickup + doubled bags), superseded by Task B. Open and still awaiting review: #150 (captions), #155 (zone audio + grooves), #157 (horsey renaming).

## Verified how

Headless Chromium against the real classes (no WebGL in the sandbox, so no full 3D playthrough; flagged for a human pass):

- Task A: simulated the real `Patrols` for 3 x 60 s standing at spawn: 0 `player:caught`; after the grace, standing on a patrol route still gets caught. Guard start distances from spawn: 30-59 m.
- Task B: serpentine sweep of the whole main hall through the real `World.update`: 0 bags auto-consumed, 2 mates picked up. Effect values checked in `fx/trip.ts` (+12, 6000 ms).
- Task C: script over `level1.json`: 0 spacing violations, no NPC in a wall.
- Task D: drove the real UI module: prompt shows "Talk"/"Grab" per `player:near` kind, hides for auto-grab NPCs and out of range, `display: none` during conversations.

Every PR: `npm run build` green locally and in CI before merging.

## Still open or risky

- Tasks E (white spots in dark scenes) and F (game feel) are with Claude, issue #162. E needs a real browser with WebGL; the headless sandbox cannot reproduce rendering bugs.
- #150/#155/#157 need Opus review + human approval before merge.
- Production (escapeberghain.dev / escape-berghain.vercel.app) was last deployed 09:45 at main @ 93a3681; it does not include anything from today's dev work yet. Nothing was promoted to `main` in this session (no "go live").
- The stale `wip-before-origin-dev-sync` stash in the shared checkout is pre-#87 work, safe to drop.

## Follow-up WebGL bug bash (Gemini 4, ~12:35 CET)

Mistral (#164 to #168) and Claude (#172, #173) landed Tasks A to F while this session was paused, and #174 promoted them to `main`. Running a real Metal WebGL Chrome pass over `dev` caught three live bugs that headless non-WebGL checks missed, all fixed and merged into `dev` (CI green):

- **#176** (`src/npc/index.ts`): removed `crownAroundPlayer()`, which on `intro:land` teleported the 8 closest NPCs into a 2.6 m ring around spawn (yanking `ice_cream_horse` out of Panorama Bar and placing it 2 m from `leather_choir`, pulling `bouncer` off the front door, firing the `tourists` selfie flash on frame 1, and in `?skip` banishing 8 NPCs outside the walls to `(0, 0)`). Initialised `this.player` from `level.spawns.main_hall`, guarded `announceNear()` with `state.started`, and added `kind: 'talk'` for rare unicorns.
- **#177** (`src/world/index.ts`): initialised `this.player` from `level.start`, guarded `announceNear()` with `state.started`, excluded auto-pickup Club Mate from the `Space Grab` prompt, and added the Panorama ice cream counter to `announceNear()`.
- **#178** (`src/ui/index.ts`, `src/ui/style.ts`): hid `.eb-prompt` before start and cleared it on `player:caught`, `trip:max`, and `ending:show`; set `z-index: 3` on `.eb-fade` so blackout covers the help box while keeping wake-up captions (`z-index: 4`) readable.

### Verified in real Metal WebGL Chrome on merged `dev` (`acef9ef`)

- Normal Play -> intro skip: 0 NPCs within 12 m of spawn, `selfieAtSpawn: false`, minimum `AUTO_TALK` pair distance 19.3 m (nearest to spawn 24.7 m), guard grace ~39 s, nearest guard 27.4 m away.
- Hoof bags: 5 bags in hall, walking over one leaves count at 5, Space consumes it (+12 trip, ~6 s hooved).
- Space prompt: hidden on title, `Space Talk` at Friday guy, `Space Grab` at hoof bags, glasses, and ice cream counter, hidden near auto-pickup Mate, clears on caught and endings.
- Darkroom at trip 85: 0 white pixels out of 160,563.
- Memory 1 pickup: reaction caption and next-goal mission line update cleanly. 0 console errors.

### Still open

- `main` is still at `38ac767` (#174) and does not yet have #176, #177, #178. Ready to promote whenever you say "go live".
- Open PRs untouched: #175 (ROADMAP update, CI green), #150, #155, #157.
- Did not touch Emma's folders (`src/look/`, `public/models/`, `public/textures/`, `levels/`).

