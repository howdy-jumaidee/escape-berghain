# Phase 4 recap — polish, figures, and the go-live attempt

Date/time: Saturday 28 Nov 2026, about 01:55 Europe/Stockholm
Preview: local `npm run dev` on `dev` at `225ffc9`, then `main` at `d9fe690` (#91). Production URL checked after the merge.
PRs merged: #83, #84, #85, #87, #88, #89, #90, #91

## Gate verdict: FAIL

Gate 4 from ROADMAP.md: "production deploy from `main`, live URL played on a laptop that isn't ours. 60 second backup video recorded."

- Code from `dev` is on `main` — pass — squash merge of #91, commit `d9fe690`. GitHub Actions `build` on that commit succeeded.
- Live URL updated — fail — Vercel status on `d9fe690` is "Deployment rate limited — retry in 24 hours." https://escape-berghain.vercel.app was still serving the previous bundle (`game-boot-B3JtWbst.js`). It does not contain "You turned into a horse".
- Played on a laptop that isn't ours, plus a 60 second backup video — not done — blocked on the deploy.

## What shipped

- Title goal, Controls toggle, Play button, and the next-step caption (#83)
- Low-poly NPC figures, instanced crowd, horses, unicorns, donkeys (#84)
- Dancers on the 9 m galleries (#85)
- Follow and first person only (#87)
- Limb swing on the beat (#88)
- Soft hazy light in first person (#89) and in the follow cam (#90)
- `dev` promoted to `main` (#91). The site did not deploy.

## Evals

- `npm run build`: pass on `dev` at `225ffc9` (content keys ok, tsc clean, vite build)
- Preview walkthrough: local dev server, not the Vercel preview (previews are behind login). Title, controls toggle, Play, intro skip, walk in follow, V into the horse's eyes, V back, NPC meshes loaded, then all five memories and the back exit
- Console errors during the walkthrough: none
- Playtest notes (Robin / outsiders): not run. This was an agent bug bash, not a cold playtest
- Judging criteria check (Robin): not done

## Bug testing

Bug bash method: pulled `dev`, ran `npm run build`, played from the title through an ending, both camera views, read the browser console.

- Console errors: none
- Broken interactions found: none in this pass. Production not updated, which is a deploy failure, not a game bug
- Issues filed: none
- Fixed in this phase: the work in the PRs above
- Known bugs carried into next phase: live site stale until Vercel accepts a deploy

## Cuts taken

- Top-down camera. V is follow and eyes only
- None of the ending cut list

## Risks going into the pitch

- Vercel rate limit — production is the old build until someone redeploys. The code on `main` is the new game
- NPC figures are low poly and swing as hinged parts, not a full skeleton. A missing glTF still falls back to a grey box
- `src/look/` was not retuned. The new light is post only, so Emma may still want a lighting pass

## Next gate

Pitch, Saturday 14:00 to 16:00: sizzle video, slides, two rehearsals, submit at 15:30. Still open, and it depends on the live URL actually serving `main`.
