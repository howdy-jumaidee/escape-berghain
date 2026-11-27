# Phase recap template

One file per gate: `docs/recaps/phase-<n>.md`, filled in when Gate N passes (or fails).
Dee (or the agent on duty) runs this. Robin's playtest notes and Neon's bug bash feed the evals and bug sections.

---

# Phase <n> recap — <phase name>

Date/time: <when the gate was checked>
Preview: <vercel preview or production url>
PRs merged: <#n, #n, ...>

## Gate verdict: PASS / FAIL

Gate N from ROADMAP.md, quoted, then each criterion with evidence:

- <criterion> — pass/fail — <how it was verified: build output, preview walkthrough, screenshot, console clean>

## What shipped

- <one line per feature/system, with the issue number>

## Evals

- `npm run build`: pass/fail (<output summary>)
- Preview walkthrough: <what was played, how long, what was checked against the "Done when" tests from the issues>
- Console errors during the walkthrough: <none, or list>
- Playtest notes (Robin / outsiders): <what players did, where they got stuck, what they laughed at>
- Judging criteria check (Robin): <which criteria this phase moves, still weak on ...>

## Bug testing

Bug bash method: pulled the preview, played start to current point, read the browser console, clicked through every interaction.

- Console errors: <none, or list with repro>
- Broken interactions found: <list>
- Issues filed (label `bug`, with steps + preview link): <#n, #n>
- Fixed in this phase: <#n, ...>
- Known bugs carried into next phase: <#n, ...> — <why not fixed now>

## Cuts taken

- <anything from the cut list that was cut, or "none">

## Risks going into Phase <n+1>

- <risk> — <mitigation>

## Next gate

Gate <n+1> from ROADMAP.md, quoted, and what is still open for it.
