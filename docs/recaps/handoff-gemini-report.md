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
