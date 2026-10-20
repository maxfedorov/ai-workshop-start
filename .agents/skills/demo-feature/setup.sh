#!/usr/bin/env bash
# demo-feature/SKILL.md §1: everything the recording needs, outside the repository.
#   .agents/skills/demo-feature/setup.sh [runner dir, default /tmp/skill-atlas-demo-runner]
# Ends with `DEMO_CHROME_PATH=…` (empty: Playwright's own Chromium) for record.mjs.
set -euo pipefail

RUNNER=${1:-/tmp/skill-atlas-demo-runner}
SKILL_DIR=$(cd "$(dirname "$0")" && pwd)
say() { printf '· %s\n' "$*" >&2; }

# 1. ffmpeg on the PATH: the MP4 transcode, and Playwright's recorder if its own can't be downloaded.
if ! command -v ffmpeg >/dev/null; then
  say 'installing ffmpeg'
  if command -v brew >/dev/null; then brew install ffmpeg >&2
  elif command -v apt-get >/dev/null && sudo -n true 2>/dev/null; then
    sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq >&2
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg >&2
  else echo 'ffmpeg is missing and neither brew nor passwordless apt-get is available' >&2; exit 1
  fi
fi

# 2. The playwright package, in a throwaway directory rather than the repository.
VERSION=$(npx --yes playwright --version | awk '{print $2}')
mkdir -p "$RUNNER"
cd "$RUNNER"
[ -f package.json ] || npm init -y >/dev/null 2>&1
[ -d node_modules/playwright ] || npm install "playwright@$VERSION" >/dev/null 2>&1
cp -n "$SKILL_DIR/record-template.mjs" record.mjs 2>/dev/null || true

# 3. Chromium and Playwright's ffmpeg, from its CDN; a network policy may block it (403).
if npx playwright install chromium ffmpeg >/dev/null 2>&1; then
  say "Playwright $VERSION: Chromium and ffmpeg ready"
  echo 'DEMO_CHROME_PATH='
  exit 0
fi
say "Playwright's CDN is unreachable; falling back"
DRY=$(npx playwright install --dry-run chromium ffmpeg)

# ffmpeg: Playwright only needs a binary at its install location; the system one will do.
FFMPEG_DIR=$(printf '%s\n' "$DRY" | awk '/^FFmpeg/{f=1} f&&/Install location:/{print $3; exit}')
case "$(uname -s)" in Darwin) FFMPEG_NAME=ffmpeg-mac ;; *) FFMPEG_NAME=ffmpeg-linux ;; esac
mkdir -p "$FFMPEG_DIR"
ln -sf "$(command -v ffmpeg)" "$FFMPEG_DIR/$FFMPEG_NAME"

# Chromium: the same Chrome for Testing build, from Google's own bucket. Not the system
# `chromium-browser`: on Ubuntu that is a shim that needs snap.
CFT=$(printf '%s\n' "$DRY" | grep -o 'builds/cft/[^ ]*/chrome-[^ /]*\.zip' | grep -v headless | head -1)
CFT_VERSION=$(echo "$CFT" | cut -d/ -f3)
PLATFORM=$(echo "$CFT" | cut -d/ -f4)
if [ ! -d "chrome-$PLATFORM" ]; then
  say "downloading Chrome for Testing $CFT_VERSION ($PLATFORM)"
  curl -sSfL -o chrome.zip "https://storage.googleapis.com/chrome-for-testing-public/$CFT_VERSION/$PLATFORM/chrome-$PLATFORM.zip"
  # Python's zipfile drops the executable bit; unzip, where present, keeps it.
  if command -v unzip >/dev/null; then unzip -q -o chrome.zip
  else python3 -c "import zipfile; zipfile.ZipFile('chrome.zip').extractall('.')"; chmod -R u+x "chrome-$PLATFORM"
  fi
  rm chrome.zip
fi
case "$PLATFORM" in
  mac-*) CHROME="$RUNNER/chrome-$PLATFORM/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing" ;;
  *) CHROME="$RUNNER/chrome-$PLATFORM/chrome" ;;
esac
"$CHROME" --version >&2
echo "DEMO_CHROME_PATH=$CHROME"
