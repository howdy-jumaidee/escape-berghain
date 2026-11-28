# Handoff to Claude (Opus): Escape Berghain, Saturday 28 Nov 2026

You're picking up the two hardest items from Dee's handoff (read `docs/handoff-gemini-2026-11-28.md` for full context and the ground rules). Mistral is doing tasks A-D (patrol grace, hoof-bag balance, NPC spacing, talk prompt). You take E and F.

## Ground rules (same as the Gemini handoff, non-negotiable)

1. Read `AGENTS.md`, `ROADMAP.md`, `src/contracts.ts`, and the design-system header in `src/ui/style.ts`.
2. **Never work in the main checkout** `/Users/jumaidy/Projects/escape-berghain`. For every task:
   ```
   cd /Users/jumaidy/Projects/escape-berghain
   git fetch origin && git worktree add -b <branch> /tmp/claude-<branch> origin/dev
   ln -s /Users/jumaidy/Projects/escape-berghain/node_modules /tmp/claude-<branch>/node_modules
   cd /tmp/claude-<branch>
   ```
   Never `git switch`, `reset`, `stash`, `read-tree` or `checkout` inside the main checkout.
3. One issue, one branch, one PR into `dev`. `npm run build` must pass before every push. You may squash-merge your own PRs into `dev` when CI `build` is green (`gh pr merge <n> --squash`, no `--delete-branch`). **Never merge into `main`** unless Dee says "go live" in this session.
4. Test in a real browser from your worktree (`npx vite --port 5191 --strictPort`, open `http://localhost:5191/?debug`, use `window.eb`). Check the console for errors.
5. Systems talk only through `bus` from `src/contracts.ts`. Player-facing text in `content/*.json`. No new dependencies. TypeScript strict. CSS comments inside the css string are `/* */` only. `src/contracts.ts` changes need Dee's OK (one was already allowed for the `player:near` kind field; don't add more).
6. No em dashes anywhere (commits, PRs, game text).

## Task E: white spots in dark scenes (bug, hard)

Dee: "sometimes when the page is really dark it becomes big white spots." Previous attempt did not find the root cause. Known suspects:
- The spirit guide (`npc_spirit_guide`, translucent `#ddf1ff`) follows the player at about 1.5 m and can fill the frame as a white glow.
- Two daylight shaft cylinders (MeshBasic, additive, radius about 12 m, around (15, 7, 33) and (15, 7, 45)) from `src/look/scene.ts`.
- Bloom in `src/fx/trip.ts` (`luminanceThreshold 0.72`, mipmap blur) over a near-black frame can blow single bright pixels (strobes, halos, emissive windows) into big soft white discs.
- A NaN or Inf pixel from a post shader becomes a growing white blob through mipmap bloom. Check the trip blur shader and every division in `src/fx/`.

Method: reproduce in dark spots (toilets, darkroom corridor, back exit, high trip via `eb.state.trip = 80`). Toggle suspects one at a time in the console (hide the spirit guide, hide the shaft meshes, disable the bloom pass, `bloom.intensity = 0`) until the spots go away. Fix the root cause, don't just turn bloom off. Screenshot before and after. `src/look/` is Emma's folder; if the fix lands there, keep it minimal and say so in the PR.

Done when: no big white blobs in the toilets, darkroom, back exit, or at trip 80, with bloom still on, in a real browser.

## Task F: make people want to keep playing (game feel, no dark patterns)

- **Early win:** the first memory (glasses) should be found within about 60-90 s. Check the distance from `spawns.main_hall` to the fragment 1 cell in `levels/level1.json`; if the walk is longer, move fragment 1 closer. Make sure the opening tips and the drag oracle's hint point there.
- **Goal gradient:** on each `fragment:found`, play a short sound sting (`src/audio/`, `sfxPickup` exists), tick the help-box checklist (#160), and show a one-line funny reaction. Memory 3+ should feel like "almost there".
- **Curiosity:** at least one weird surprise in the first 2 minutes (a rare-creature line or a strange NPC line at start).
- **Fair failure:** caught / blackout must feel like a funny setback, not a punishment. Respawn near where you were, keep found memories, short joke. Verify what the current respawn keeps and only change what is missing.
- **Clear next step:** after each memory, the help box shows the next goal in one line.

Keep every change small, one PR per system. Text in `content/` (Robin's folder), matching the existing dry Berlin club comedy.

## When done

Leave a short report in `docs/recaps/handoff-claude-report.md` (on your branch, PR into `dev`): PRs opened/merged with numbers, what you verified in the browser and how, what's still open or risky. Don't promote to `main`.
