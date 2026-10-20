#!/usr/bin/env bash
# issue-to-pr/SKILL.md §6: put a demo video where a pull request can show it.
#   .agents/skills/issue-to-pr/attach-demo.sh <video.mp4> <PR branch name>
# Commits the MP4 and a GIF preview to the `demos` branch, an orphan branch that shares no
# history with the code, and prints the Markdown for the PR description: the GIF plays inline,
# and a click opens the MP4. The links are pinned to the commit, so they keep working after the
# next demo is pushed.
#
# Why not a release asset or a PR attachment: GitHub has no API for PR attachments, and
# release uploads go to uploads.github.com, which Air's network policy blocks. A push only needs
# the github.com access the PR itself needs.
set -euo pipefail

MP4=${1:?usage: attach-demo.sh <video.mp4> <PR branch name>}
KEY=$(printf '%s' "${2:?usage: attach-demo.sh <video.mp4> <PR branch name>}" | tr -c 'A-Za-z0-9._-' '-')
[ -s "$MP4" ] || { echo "no video at $MP4" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo 'ffmpeg is missing: install it as demo-feature/SKILL.md §1 says' >&2; exit 1; }
say() { printf '· %s\n' "$*" >&2; }

REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner)
WORK=$(mktemp -d /tmp/skill-atlas-attach-demo.XXXXXX)
# A branch name of this run's own: worktrees of one clone share their branches.
NEW_BRANCH="demos-new-$$-$(basename "$WORK")"
trap 'git worktree remove --force "$WORK/tree" >/dev/null 2>&1 || true; git branch -D "$NEW_BRANCH" >/dev/null 2>&1 || true; rm -rf "$WORK"' EXIT

# The GIF: small enough to load fast in a PR, at most ~8 MB. Smaller and slower until it fits.
GIF="$WORK/demo.gif"
for setting in "800 8" "640 6" "480 5"; do
  set -- $setting
  ffmpeg -loglevel error -y -i "$MP4" \
    -vf "fps=$2,scale=$1:-1:flags=lanczos,split[a][b];[a]palettegen[p];[b][p]paletteuse" "$GIF"
  [ "$(stat -c %s "$GIF" 2>/dev/null || stat -f %z "$GIF")" -le 8000000 ] && break
done
DURATION=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$MP4")

# The demos branch, in a worktree of its own: the checkout of the PR branch stays as it is.
if git fetch -q origin demos 2>/dev/null; then
  git worktree add -q --detach "$WORK/tree" FETCH_HEAD
else
  say 'creating the demos branch'
  git worktree add -q --detach "$WORK/tree"
  git -C "$WORK/tree" checkout -q --orphan "$NEW_BRANCH"
  git -C "$WORK/tree" rm -rq --cached . >/dev/null
  find "$WORK/tree" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
  printf '%s\n' '# Demos' '' \
    'Demo videos of pull requests, recorded by the issue-to-pr skill. Only videos: this branch' \
    'shares no history with the code, and nothing here is ever merged.' > "$WORK/tree/README.md"
fi
mkdir -p "$WORK/tree/$KEY"
cp "$MP4" "$WORK/tree/$KEY/demo.mp4"
cp "$GIF" "$WORK/tree/$KEY/demo.gif"
git -C "$WORK/tree" add -A
git -C "$WORK/tree" commit -q -m "Demo of $KEY" -m "Skill: issue-to-pr"

# Several agents may push demos at once: rebase on theirs and try again.
for attempt in 1 2 3; do
  git -C "$WORK/tree" push -q origin HEAD:refs/heads/demos 2>"$WORK/push.log" && break
  say "push failed: $(grep -E 'rejected|error|fatal' "$WORK/push.log" | head -n 1)"
  [ "$attempt" = 3 ] && { echo 'could not push to the demos branch' >&2; exit 1; }
  say 'rebasing on the demos branch and trying again'
  git -C "$WORK/tree" pull -q --rebase origin demos
done
SHA=$(git -C "$WORK/tree" rev-parse HEAD)

BASE="https://github.com/$REPO/raw/$SHA/$KEY"
printf '%s\n' "## Demo" "" \
  "[![Demo of this change]($BASE/demo.gif)]($BASE/demo.mp4)" "" \
  "$(printf '%.0f' "$DURATION") s. The preview plays here; click it for the MP4."
