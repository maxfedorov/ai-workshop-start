#!/usr/bin/env bash
# demo-feature/SKILL.md §1: everything the recording needs, outside the repository.
#   .agents/skills/demo-feature/setup.sh [runner dir, default /tmp/skill-atlas-demo-runner]
# Ends with `DEMO_CHROME_PATH=`: empty, since the browser is where Playwright looks for it.
set -euo pipefail

RUNNER=${1:-/tmp/skill-atlas-demo-runner}
SKILL_DIR=$(cd "$(dirname "$0")" && pwd)
REPO=$(cd "$SKILL_DIR/../../.." && pwd)
say() { printf '· %s\n' "$*" >&2; }

# 1. ffmpeg on the PATH: finish.sh makes the MP4 and the GIF with it.
if ! command -v ffmpeg >/dev/null; then
  say 'installing ffmpeg'
  if command -v brew >/dev/null; then brew install ffmpeg >&2
  elif command -v apt-get >/dev/null && { [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; }; then
    SUDO=; [ "$(id -u)" = 0 ] || SUDO='sudo -n'
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update -qq >&2
    $SUDO env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg >&2
  else echo 'ffmpeg is missing and neither brew nor passwordless apt-get is available' >&2; exit 1
  fi
fi

# 2. The repository's own Playwright (a devDependency, for the e2e tests), its browsers where it
# looks for them, and the system libraries they need. The same script the e2e tests rely on; it
# works where Playwright's CDN is blocked too.
[ -d "$REPO/node_modules/playwright" ] || (cd "$REPO" && npm ci --no-audit --no-fund >&2)
"$REPO/scripts/playwright-browsers.sh"

# 3. The runner directory: record.mjs lives here, outside the repository, and imports the
# repository's playwright through a link to its node_modules.
mkdir -p "$RUNNER"
[ -e "$RUNNER/node_modules" ] || ln -s "$REPO/node_modules" "$RUNNER/node_modules"
cp -n "$SKILL_DIR/record-template.mjs" "$RUNNER/record.mjs" 2>/dev/null || true
say "Playwright $(cd "$REPO" && npx --no-install playwright --version | awk '{print $2}'), runner in $RUNNER"
echo 'DEMO_CHROME_PATH='
