# Phase 0 recap — Foundation

Date/time: 27 Nov 2026, 21:25
Preview: production https://escape-berghain.vercel.app (public). PR previews redirect to Vercel SSO, so they were not playable.
PRs merged: Phase 0 is commit `3009478` on `main` (issue #1).

## Gate verdict: FAIL

Gate 0: "the greybox build is live on its public Vercel URL and Emma has a PR preview working from Cursor."

- Public greybox URL — pass — https://escape-berghain.vercel.app returns the Phase 0 page. Chrome showed the hall, the box horse, purple light, and the HUD `Trip 10 · WASD to walk`. Canvas created, no WebGL crash.
- Emma can open a PR preview from Cursor — fail — https://escape-berghain-git-dev-howdy-jumaidees-projects.vercel.app responds 302 to `vercel.com/sso-api`. A logged-out browser never reaches the game.

## What shipped

- Vite, TypeScript, Three.js, postprocessing, Rapier (#1)
- `contracts.ts`, greybox hall, wobbly box horse, trip HUD
- Model loader. Missing `.glb` files 404 and the page keeps running
- GitHub repo, `main` and `dev`, CI

## Evals

- `npm run build`: pass on the later `dev` tree (typecheck and Vite build, 27 Nov 21:20). Phase 0 production is already deployed.
- Preview walkthrough: loaded production only. Did not walk it. The hall renders and the HUD is up.
- Console errors during the walkthrough: 404 for `/models/hall_pillar.glb` and `/models/hall_speaker.glb`. Expected until Emma's models land. No script exception.
- Playtest notes (Robin / outsiders): none yet.
- Judging criteria check (Robin): not done. Issue #23 is still open.

## Bug testing

Bug bash method: opened the production URL in system Chrome, read the console, took a screenshot. Did not walk.

- Console errors: model 404s above.
- Broken interactions found: PR preview URLs are behind Vercel SSO, so "play the preview before merge" does not work for someone outside the Vercel team.
- Issues filed: none. Not filed from this recap.
- Fixed in this phase: none in this pass.
- Known bugs carried into next phase: preview SSO wall.

## Cuts taken

- none

## Risks going into Phase 1

- Preview links look deployed in the GitHub check and still bounce to a login. Emma and Robin cannot play a PR from the link alone.
- `ROADMAP.md` still has "Vercel connected" unchecked. Production is up. The checkbox is stale. The Emma-preview half of the gate is not.

## Next gate

Gate 1: "walk through the hall in moody light, grab the glasses, blur rises, reach the exit, see an ending. Merged to `main`." See `docs/recaps/phase-1.md`.
