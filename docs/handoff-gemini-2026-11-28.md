# Handoff to Gemini 4: Escape Berghain, Saturday 28 Nov 2026

You're taking over from Claude (Opus) for at least two hours. Dee (the user, code lead) wants the game fun to play, fair at the start, and bug-free before the pitch. Read this whole prompt before touching anything.

## 0. Ground rules (non-negotiable)

1. **Read first:** `AGENTS.md`, `ROADMAP.md`, `src/contracts.ts`, and the design-system header in `src/ui/style.ts`.
2. **Never work in the main checkout** `/Users/jumaidy/Projects/escape-berghain`. Other tools (Zed, Cursor, Mistral, Claude) use it live and keep uncommitted work there. Earlier today a reset in that folder destroyed another agent's unsaved audio work. For every task:
   ```
   cd /Users/jumaidy/Projects/escape-berghain
   git fetch origin && git worktree add -b <branch> /tmp/gem-<branch> origin/dev
   ln -s /Users/jumaidy/Projects/escape-berghain/node_modules /tmp/gem-<branch>/node_modules
   cd /tmp/gem-<branch>
   ```
   Never `git switch`, `reset`, `stash`, `read-tree` or `checkout` inside the main checkout. Chain risky git commands with `&&`, never `;`.
3. **One issue, one branch, one PR into `dev`.** Small PRs, one system each. `npm run build` must pass before every push (it type-checks and checks that every content key exists).
4. **Test in a real browser** before calling anything done. Run your own dev server from the worktree on a free port (`npx vite --port 5190 --strictPort`), open `http://localhost:5190/?debug`, and use `window.eb` (`state`, `bus`, `world`, `npcs`, `horse`, `camera`) to teleport (`eb.horse.setPosition(x, z)`), read state and hook bus events. Check the console for errors.
5. **Merging:** you may squash-merge your own PRs into `dev` when CI `build` is green. Use `gh pr merge <n> --squash` **without** `--delete-branch`: that flag switches the shared checkout. **Never merge into `main`** unless Dee tells you "go live" in this session. When Dee does, promote with a tree-identical branch:
   ```
   git worktree add -b promote/<name> /tmp/gem-promote origin/main && cd /tmp/gem-promote \
     && git merge --no-commit -s ours origin/dev && git read-tree -u --reset origin/dev \
     && git commit -m "Promote dev to main: <summary>" && git push -u origin promote/<name>
   ```
   Then open a PR into `main`. `main` deploys automatically to **https://escapeberghain.dev** (Vercel Pro) and to GitHub Pages.
6. **Code rules:** systems talk only through `bus` from `src/contracts.ts`, with no imports between system folders. All player-facing text lives in `content/*.json`. No new dependencies. TypeScript strict. CSS comments inside the css string are `/* */` only, never `//`, because a `//` silently kills the next rule. `src/contracts.ts` changes need Dee's OK.
7. **Writing style** (commits, PRs, game text): natural and direct, no em dashes, no filler, no corporate words.

## 1. State when you start

- **Live:** escapeberghain.dev is at `main` = `dev` up to #158. That covers talk-back with outcomes, a Skyrim-style answer list, opt-in NPC talk (only 6 auto-grab you: `riddle_horse`, `coat_check`, `drag_oracle`, `ice_cream_horse`, `pup`, `leather_choir`), story flags, the type and spacing system, sound cues and the proximity glow.
- **Open PRs into `dev`**, both built, play-tested and CI green. Merge these first (they merge cleanly together):
  - **#161** Softer start (Claude): a 45 s trip grace period, then 0.21/s instead of 0.8/s. Steering ramps over 300 s. Guards see 6.5 m and need 2 s of torchlight. Van cards are layered above the help box.
  - **#160** Glass help box (Mistral): tips, a checklist of the 5 memories, the H toggle.
- After merging, rebuild `dev` and play a full minute in the browser to confirm nothing regressed.

## 2. Your tasks, in this order

### Task A: No animal control at the start (bug)
Players get caught within seconds of starting. Cause: the first guard patrol (`levels/level1.json` → `patrols[0]`: cells [2,3] → [9,3] → [9,8] → [2,8]) loops right around the main hall where you spawn (`spawns.main_hall` = [5,6]). The guard grace period (`GRACE` in `src/world/patrols.ts`) only starts on `player:respawn`, never at game start.
- Start the patrol grace on `intro:land` too, at about 40 s, so the first minute is safe to explore.
- Start each guard at the waypoint farthest from the player spawn, so nobody is near you when you land.
- Done when: in 3 fresh runs, standing still at spawn for 60 s never triggers `player:caught`, and guards still catch you after that.

### Task B: Hoof bags punish too hard (balance)
Bags (`K` in the level grid, `prop_bag`) are picked up automatically when you walk into them (#130). Each one adds +30 trip and 20 s of very loose steering (`src/fx/trip.ts`: `state.hoovedUntil = performance.now() + 20000`). On the crowded dance floor you hit them constantly.
- Bags should **not** auto-pickup. Make them Space-only, the same as fragments. Club Mate can stay auto.
- Make the effect milder: about +12 trip and about 6 s of hooved steering.
- Halve the number of bags on the main dance floor in `levels/level1.json`. Keep them as a tempting risk-and-reward item away from the main paths.
- Done when: walking across the main floor for 60 s never picks up a bag by accident, and a bag you choose to take wears off within about 6 s.

### Task C: Space important NPCs apart (level design)
Two important NPCs should never stand right next to each other. Today `ice_cream_horse` [4,10] and `drag_oracle` [6,11] are 2 cells (12 m) apart, and `pup` [12,7] and `riddle_horse` [14,8] are close too (cells are 6 m).
- Rule: every `AUTO_TALK` NPC is at least 3 cells (18 m) from every other `AUTO_TALK` NPC, and at least 2 cells from the player spawn.
- Move the NPCs in `levels/level1.json` and keep them in their themed zones (toilets, bar, Panorama and so on). Keep `riddle_horse` in the toilet corridor and `coat_check` at the cloakroom.
- Make sure no NPC ends up inside a wall or counter. Check each one visually.

### Task D: Discreet "Interact" prompt for side NPCs (UX)
Side-quest and non-essential NPCs no longer grab you. Players need to see that they *can* talk.
- When the player is within talk range of a non-auto NPC, show a small, discreet prompt near the bottom centre: a keycap "Space" plus "Talk". Use "Grab" when it's a pickup. Use the existing `player:near` bus event (`{ by: 'npc' | 'world'; near }`). If you need to know *who* or *what* is near for the label, add an optional `kind` field to that event in `src/contracts.ts`. That's the one contracts change allowed, and the PR must say so.
- Style it with the design tokens in `src/ui/style.ts`: glass like the help box, `--t-xs`/`--t-sm`, `--text-2`, fade in over 150 ms and out over 250 ms. Hide it during conversations (`.eb-ui.talking`), endings and the title screen.
- Text lives in `content/story.json`.

### Task E: White spots in dark scenes (bug, hard)
Dee: "sometimes when the page is really dark it becomes big white spots." Claude did not find the root cause. What's known:
- Already fixed: crowd dancers walking through the conversation camera (#145, #148).
- Suspects found by scanning the scene for white materials:
  - The spirit guide (`npc_spirit_guide`, translucent `#ddf1ff`) follows the player at about 1.5 m and can fill the frame as a white glow.
  - Two daylight shaft cylinders (MeshBasic, additive, radius about 12 m, around (15, 7, 33) and (15, 7, 45)) from `src/look/scene.ts`.
  - Bloom (`src/fx/trip.ts`, `luminanceThreshold 0.72`, mipmap blur) over a near-black frame can blow single bright pixels (strobes, halos, emissive windows) into big soft white discs.
  - A NaN or Inf pixel from a post shader becomes a growing white blob through mipmap bloom. Check the trip blur shader and any divisions in `fx`.
- Method: reproduce in dark spots (toilets, the darkroom corridor, back exit, high trip with `eb.state.trip = 80`). Then toggle suspects one at a time in the console (hide the spirit guide, hide the shaft meshes, turn off the bloom pass via `fx.composer.passes`, set `bloom.intensity = 0`) until the spots go away. Fix the root cause, don't just turn bloom off. Screenshot before and after.
- `src/look/` is Emma's folder. If the fix is there, keep it minimal and say so in the PR.

### Task F: Make people want to keep playing (game feel and psychology)
Use proven game-design principles, gently, without dark patterns:
- **Early win:** the first memory (glasses) should be found within about 60 to 90 s. Make sure the opening tips and the drag oracle's hint lead there.
- **Goal gradient:** the help-box checklist already exists. Add a satisfying moment on each `fragment:found`: a short sound sting (in `src/audio/`), the box ticking, and a one-line funny reaction. Make memory 3 onwards feel like "almost there".
- **Curiosity and surprise:** rare creatures and story flags exist. Make sure at least one weird surprise happens in the first 2 minutes (a unicorn sighting or a strange NPC line) so players think "what else is in here?".
- **Fair failure:** being caught or blacking out must feel like a funny setback, not a punishment. Respawn near where you were, keep found memories, show a short joke.
- **Clear next step:** after each memory, the help box shows the next goal in one line.
Keep every change small and in its own PR. Text goes in `content/`, owned by Robin, and must match the existing dry Berlin club comedy.

## 3. Before you stop

Leave a short report for Dee in `docs/recaps/handoff-gemini-report.md`:
- PRs opened and merged, with numbers
- what you verified in the browser, and how
- what's still open or risky

Don't promote to `main` unless Dee told you to go live.
