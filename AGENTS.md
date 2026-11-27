# Escape Berghain: rules for agents and humans

Zed, Cursor and the Grok bots all read this file. Follow it exactly.

## Read first

1. `docs/PLAN.md` for the game, the story and who owns what
2. `ROADMAP.md` for the current phase and what is in scope right now
3. `src/contracts.ts` for the shared state, types and events

## Tools on this team

| Tool | Who | How it connects |
|---|---|---|
| Zed (Opus, Gemini Neon, SuperGrok, Mistral) | Dee | Clone of this repo. Zed reads this file |
| Cursor | Emma | Clone of this repo. Cursor reads this file and `.cursor/rules/` |
| Grok bots | Night shift | Clone of this repo, `night-shift` issues only |
| Lovable | Robin | **Not on this repo.** Lovable can't import an existing repo and always syncs to `main`, which would skip every check here. Robin's pitch site is a separate Lovable project with its own repo. Robin edits game text in `content/` through the GitHub website (pencil icon, "Create a new branch", open PR) |
| GitHub website | Anyone | Small edits to `content/` and docs. Always choose "Create a new branch" when committing |

## Branches

```
main   production. Vercel deploys it as the live game. Demo runs from here.
dev    integration. Everything merges here first.
<issue>-<short-name>       feature work, e.g. 12-security-patrols
fix/<issue>-<short-name>   bug fixes, e.g. fix/31-horse-stuck-on-pillar
```

- Always start from the latest `dev`: `git switch dev && git pull && git switch -c <branch>`
- One issue, one branch, one pull request into `dev`
- Never commit or push to `main` or `dev` directly. Branch protection blocks it anyway
- Rebase on `dev` before opening the PR if `dev` moved: `git pull --rebase origin dev`
- Keep PRs small. One system per PR

## Before you push

Run both. Do not push if either fails.

```
npm run build      # type check + production build
npm run dev        # open it, walk around for 30 seconds, check the console has no errors
```

## Pull requests

- Target branch: `dev`
- Fill in the PR template, including the issue number (`Closes #12`)
- CI runs `npm ci && npm run build` on every PR. Red CI means not mergeable
- Vercel posts a preview link. Somebody plays it before merge

## Review and merge (the gate)

Nothing merges without these three:

1. **CI green**
2. **Opus review.** Dee runs Opus in Zed on the PR diff with the checklist below. Opus posts its verdict as a PR review: `Opus review: approve` or `Opus review: changes needed` plus reasons
3. **Human approval** from the folder owner (see Ownership). Dee merges code, Emma merges `public/models/`, `public/textures/` and `src/look/`, Robin merges `content/`

Opus review checklist:
- Only touches folders named in the issue
- Does not edit `src/contracts.ts` (unless the PR is from Dee and says so)
- Systems talk only through `bus` from `contracts.ts`, no direct imports between system folders
- No hardcoded player facing text, it lives in `content/*.json`
- Missing models fall back to a grey box, nothing crashes on a 404
- No secrets, keys or tokens in the diff
- The "Done when" test from the issue passes in the preview

Merge style: squash merge. Delete the branch after.

## Promoting dev to main

At each phase gate in `ROADMAP.md`:
1. Gemini Neon runs a bug bash on `dev` (see below)
2. Robin plays the `dev` preview start to finish
3. Opus reviews the `dev` → `main` PR
4. Dee merges. Vercel deploys production

After 12:00 Saturday, only `fix/` branches merge.

## Bug squad: Gemini Neon

Gemini Neon checks and fixes bugs.

- Every bug is a GitHub issue labelled `bug`, with steps to reproduce and the preview link
- Neon picks up `bug` issues, reproduces, fixes on a `fix/` branch, opens a PR into `dev`
- Bug bash at each phase gate: pull `dev`, run `npm run build`, play the preview, read the browser console, list every error and broken interaction as issues, fix what is small, label the rest `bug`
- Opus still reviews Neon's fixes. Nobody reviews their own work

## Who builds what

| Model | Work |
|---|---|
| Opus (Zed, Dee) | Orchestrates, writes `contracts.ts` and `main.ts`, reviews every PR, integrates |
| Gemini Neon | Complex systems: `src/player/`, `src/fx/`. Bug squad |
| SuperGrok | Medium systems: `src/world/`, `src/npc/`, `src/game/` |
| Mistral 4 Le Chonk | Easy work: `src/ui/`, `src/audio/` |
| Grok bots (night) | Only issues labelled `night-shift`. PR into `dev`, never merge |
| Emma (Cursor, Blender) | `public/models/`, `public/textures/`, `src/look/`, `levels/` |
| Robin | `content/`, playtests, pitch |

## Ownership

| Folder | Owner |
|---|---|
| `src/contracts.ts`, `src/main.ts` | Dee, Opus only |
| `src/player/`, `src/fx/`, `src/world/`, `src/npc/`, `src/game/`, `src/ui/`, `src/audio/` | Dee |
| `src/look/`, `public/models/`, `public/textures/`, `levels/` | Emma |
| `content/` | Robin |

## Code rules

- Three.js, TypeScript strict. No new dependencies without asking Dee in the issue
- All player facing text in `content/*.json`
- Models load through `placeModel()` in `src/look/models.ts` from `public/models/<name>.glb`. Missing model means a grey box of the same size, never a crash
- Check any model at `http://localhost:5173/?viewer=<name>`: size in metres, triangle count, next to a 1.8 m human
- 1 unit = 1 metre
- Placeholder art is fine. Rectangles are fine
- No real brand logos, no real people's names in game

## Night bots

Allowed: issues labelled `night-shift`.
Not allowed: `src/player/`, `src/fx/`, `src/look/`, `src/contracts.ts`, `src/main.ts`, `public/models/`.
Open a PR into `dev`. Never merge. Leave a short note in the PR on what you tested.
