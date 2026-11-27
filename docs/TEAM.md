# Team start guide

Everyone needs: Node 22, git, a GitHub account added to the repo.

## Getting the code

Dee creates the GitHub repo first (`bash scripts/setup-github.sh`). After that, everyone clones from GitHub, not from the zip. The zip is only for reading the plan before the repo exists.

```
git clone https://github.com/<owner>/escape-berghain
cd escape-berghain
npm install
git switch dev
npm run dev
```

Open http://localhost:5173. WASD to walk.

## Dee (Zed)

1. Unzip into `~/Projects/escape-berghain`, open in Zed, run `npm install && npm run build`
2. `gh auth status`, then `bash scripts/setup-github.sh`
3. vercel.com: Add New Project, import the repo, Deploy. Production branch: `main`
4. Invite Emma, Robin and the Grok bot accounts (command printed by the script)
5. Start Opus on Phase 1. Every subagent gets one issue and one branch

Opus review prompt to paste for each PR:
```
Review PR #<n> against the checklist in AGENTS.md. Read the diff with `gh pr diff <n>`.
Post your verdict with `gh pr review <n> --comment -b "Opus review: approve|changes needed ..."`.
```

## Emma (Cursor, Blender)

1. Clone (above), open the folder in Cursor. Cursor picks up `AGENTS.md` and `.cursor/rules/`
2. New work: `git switch dev && git pull && git switch -c 6-greybox-kit`
3. Export from Blender: glTF Binary (`.glb`), +Y up, apply transforms, 1 unit = 1 m, origin at the base, facing +Z
4. Save to `public/models/<zone>_<object>.glb`, e.g. `hall_pillar.glb`
5. Check it: http://localhost:5173/?viewer=hall_pillar shows size, triangles and a 1.8 m human for scale
6. Check it in the game: names already wired are `hall_pillar` and `hall_speaker`. More get wired as issues land
7. Commit, push, open a PR into `dev`. The Vercel preview shows it live

Lighting and haze live in `src/look/scene.ts`. That file is yours.

## Robin (Lovable, GitHub website)

Lovable stays off the game repo. It can't import an existing repo, and it commits straight to `main`, which skips CI and review.

**Pitch site in Lovable.** New Lovable project, its own repo. Starter prompt:

```
Build a one page dark pitch site for a browser game called Escape Berghain.
Premise: you took too much at a Berlin techno club, turned into a horse, and must get
home before your memory slips away. Look: industrial, concrete, rusted steel, red and
purple strobe light, film grain. Sections: hero with a big "PLAY NOW" button linking to
<vercel game url>, 30 second trailer embed, how to play (WASD, Space), the team
(Dee, Emma, Robin, Team Five), and a footer. No emoji. Big condensed type.
```

**Game text.** All words in the game are in `content/story.json` and `content/npcs.json`. To edit:
1. Open the file on github.com, switch the branch dropdown to `dev`, click the pencil
2. Edit, then "Commit changes", choose **Create a new branch**, open the PR into `dev`
3. CI runs, Dee merges

**Also yours:** the judging criteria, the 08:00, 10:00, 12:00 and 14:00 check ins, playtests (file bugs with the Bug template), the sizzle video and the submission at 15:30.
