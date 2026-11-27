#!/usr/bin/env bash
# One time setup: creates the public repo, main + dev branches, labels,
# branch protection and all roadmap issues. Run from the repo root.
# Needs: gh logged in (gh auth status).
# Usage: bash scripts/setup-github.sh [repo-name]
set -euo pipefail

NAME="${1:-escape-berghain}"
OWNER="$(gh api user -q .login)"
REPO="$OWNER/$NAME"

echo "==> Creating $REPO"
git init -q -b main 2>/dev/null || true
git add -A
git commit -qm "Phase 0: scaffold, contracts, greybox, CI" || true
gh repo create "$REPO" --public --source . --push --description "Escape Berghain: you took too much, you are a horse, get home."

echo "==> dev branch"
git switch -c dev
git push -u origin dev
git switch main

echo "==> Labels"
label() { gh label create "$1" --color "$2" --repo "$REPO" --force >/dev/null; }
label dee 5319e7; label emma e99695; label robin fbca04
label asset c5def5; label content bfd4f2; label night-shift 0e1a2b
label gemini 1d76db; label grok 000000; label mistral ff7f00; label opus d4a373
label bug d73a4a; label blocker b60205
label phase-1 c2e0c6; label phase-2 c2e0c6; label phase-3 c2e0c6

echo "==> Branch protection (PR required, CI must pass)"
protect() {
  gh api -X PUT "repos/$REPO/branches/$1/protection" --input - >/dev/null <<JSON
{
  "required_status_checks": { "strict": false, "contexts": ["build"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
}
protect main
protect dev
gh repo edit "$REPO" --enable-squash-merge --delete-branch-on-merge >/dev/null

echo "==> Issues"
issue() { # title, labels, folder, done-when
  gh issue create --repo "$REPO" --title "$1" --label "$2" --body "**Folder:** \`$3\`

**Done when:** $4

See docs/PLAN.md and AGENTS.md. Branch from \`dev\`, PR into \`dev\`." >/dev/null
  echo "   $1"
}
FIRST=$(gh issue create --repo "$REPO" --title "Scaffold, contracts, CI" --label "dee,opus" --body "Phase 0. Done in the first commit.")
gh issue close "$FIRST" --repo "$REPO" >/dev/null
echo "   Scaffold, contracts, CI (closed)"
issue "Horse controller with spring wobble" "dee,gemini,phase-1" "src/player/" "Horse walks with WASD, sways like it's drunk, legs move, uses Emma's horse_*.glb parts when present."
issue "Hoof grab and drop" "dee,gemini,phase-1" "src/player/" "Space near an item picks it up clumsily (slips sometimes), Space again drops it."
issue "Trip meter, blur, Mate and brain freeze" "dee,gemini,phase-1" "src/fx/" "Screen blurs and wobbles more as trip rises. Mate lowers trip and adds 10 s leg jitter. Ice cream gives 5 s sharp screen."
issue "Lighting, haze, materials" "emma,asset,phase-1" "src/look/" "The hall matches the agreed mood shot: dark concrete, red and purple strobes, haze, one cold work light."
issue "Greybox kit" "emma,asset,phase-1" "public/models/" "Boxes at true scale for horse parts, human, wall 4 m, pillar 18 m, speaker, staircase, counter, door load in the build."
issue "Hero assets: horse, wall, floor, pillar, speaker" "emma,asset,phase-1" "public/models/" "Textured .glb versions replace the greybox in the live build."
issue "NPC and prop assets" "emma,asset,phase-3" "public/models/" "Horse NPC base x3, human base x3, security, animal control, spirit guide, glasses, ticket, jacket, keys, MATE bottle, ice cream, phone."
issue "Level loader from grid JSON, collisions" "dee,grok,phase-1" "src/world/" "levels/level1.json builds the 5 zones; the horse can't walk through walls or pillars."
issue "Level 1 layout, 5 zones" "emma,dee,phase-1" "levels/" "Main hall, bar and cloakroom, toilet corridor, Panorama Bar, back exit, all connected."
issue "Fragment pickups and checkpoints" "dee,grok,phase-1" "src/world/" "All 5 fragments can be found in order; each emits fragment:found and sets a checkpoint."
issue "Security, animal control, tourist patrols" "dee,grok,phase-3" "src/world/" "Patrols walk routes; getting caught emits player:caught; tourist selfie flash alerts security."
issue "Endings state machine and losses" "dee,grok,phase-1" "src/game/" "Exit gives full or partial ending by fragment count; trip max wakes you in toilet queue; caught respawns at checkpoint."
issue "NPC dialogue from JSON" "night-shift,grok,phase-2" "src/npc/" "Walking up to any NPC shows their lines from content/npcs.json, one at a time."
issue "Riddle UI and branching" "night-shift,grok,phase-2" "src/npc/" "Riddle horse shows 3 answers; right emits riddle:answered true and opens the shortcut, wrong opens the detour."
issue "Herd sync dance" "night-shift,grok,phase-2" "src/npc/" "Standing in the herd's line and stomping on the beat 4 times emits herd:synced and reveals fragment 3."
issue "Title, intro, HUD" "dee,mistral,phase-3" "src/ui/" "Title screen, 10 s skippable intro, small HUD with fragment count and hints."
issue "End cards and credits" "night-shift,mistral,phase-2" "src/ui/" "Each ending shows its card; credits roll on a cloakroom ticket."
issue "Audio manager, music, SFX" "night-shift,grok,phase-2" "src/audio/" "Generated Berghain techno at 132 BPM (kick with rumble, hats, clap), hoof steps, pickup sound, muffled music in toilets."
issue "Secret DJ ending" "dee,grok,phase-3" "src/game/" "Stomping on the beat 8 times in the DJ booth shows the resident horse DJ ending."
issue "Konami rat and mirror easter eggs" "night-shift,grok,phase-2" "src/game/" "Konami code makes you a rat for 30 s; standing at the hidden mirror shows human you for 1 s."
issue "All text in content/" "robin,content,phase-1" "content/" "Every line in the game comes from content/*.json and reads well out loud."
issue "Judging criteria, pitch, sizzle, submission" "robin,phase-3" "docs/" "Pitch deck, sizzle video, demo script ready by 15:00; submitted by 15:30."

echo
echo "Done. Next:"
echo "  1. vercel.com > Add New Project > import $REPO > Deploy (Vite is detected)."
echo "  2. Invite Emma, Robin and the Grok bot accounts: gh repo edit is not enough, use"
echo "     gh api -X PUT repos/$REPO/collaborators/<github-username> -f permission=push"
echo "  3. Everyone: git clone https://github.com/$REPO && cd $NAME && npm install && git switch dev"
