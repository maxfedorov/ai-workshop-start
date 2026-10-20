#!/usr/bin/env bash
# Playwright's browsers and the system libraries they need, where Playwright looks for them, even
# where its download CDN is blocked (Air's cloud network policy answers cdn.playwright.dev with
# 403). After this, `npm run test:e2e` and demo-feature's recordings run without any
# executablePath. Run from the repository root, after `npm ci`:
#   scripts/playwright-browsers.sh
# Safe to run again: whatever is already in place is kept. macOS needs no system libraries.
set -euo pipefail

cd "$(dirname "$0")/.."
say() { printf '· %s\n' "$*" >&2; }
fail() { printf 'playwright-browsers: %s\n' "$*" >&2; exit 1; }
BROWSERS='chromium chromium-headless-shell ffmpeg'

npx --no-install playwright --version >/dev/null 2>&1 || fail 'no playwright in node_modules: run npm ci first'
can_sudo() { [ "$(id -u)" = 0 ] || sudo -n true 2>/dev/null; }
as_root() { if [ "$(id -u)" = 0 ]; then "$@"; else sudo -n "$@"; fi; }

# 1. The browsers: nothing to do when they are all in place, else from Playwright's CDN when it
# answers, else from Chrome for Testing.
DRY=$(npx --no-install playwright install --dry-run $BROWSERS)
LOCATIONS=$(printf '%s\n' "$DRY" | awk '/Install location:/ { print $3 }')
INSTALLED=1
for LOCATION in $LOCATIONS; do [ -f "$LOCATION/INSTALLATION_COMPLETE" ] || INSTALLED=; done
if [ -n "$INSTALLED" ]; then
  say 'browsers already installed'
elif npx --no-install playwright install $BROWSERS >/dev/null 2>&1; then
  say 'browsers installed from the Playwright CDN'
else
  say "Playwright's CDN is unreachable; installing the same builds from Chrome for Testing"
  command -v curl >/dev/null || fail 'curl is missing'

  # Each Chrome for Testing build Playwright wants is also in Google's own bucket, under the same
  # version and platform. Unpacked into Playwright's install location, it is what Playwright
  # would have installed itself.
  printf '%s\n' "$DRY" | awk '
    /Install location:/ { location = $3 }
    /Download url:/ && /\/builds\/cft\// { print location, $3 }
  ' | while read -r LOCATION URL; do
    ZIP=${URL##*/builds/cft/}               # <version>/<platform>/<file>.zip
    if [ -f "$LOCATION/INSTALLATION_COMPLETE" ]; then continue; fi
    say "downloading $ZIP"
    mkdir -p "$LOCATION"
    curl -sSfL -o "$LOCATION/download.zip" "https://storage.googleapis.com/chrome-for-testing-public/$ZIP" \
      || fail "could not download $ZIP from storage.googleapis.com either"
    # unzip keeps the executable bits; Python's zipfile, the fallback, doesn't.
    if command -v unzip >/dev/null; then unzip -q -o "$LOCATION/download.zip" -d "$LOCATION"
    else python3 -c "import sys, zipfile; zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])" "$LOCATION/download.zip" "$LOCATION"
      chmod -R u+x "$LOCATION"
    fi
    rm "$LOCATION/download.zip"
    # The markers Playwright writes after its own install, so it treats this one as complete.
    touch "$LOCATION/INSTALLATION_COMPLETE" "$LOCATION/DEPENDENCIES_VALIDATED"
  done

  # ffmpeg, for recordVideo: Playwright only needs a binary at its install location, and the
  # system one does.
  FFMPEG_DIR=$(printf '%s\n' "$DRY" | awk '/^FFmpeg/ { f = 1 } f && /Install location:/ { print $3; exit }')
  if [ -n "$FFMPEG_DIR" ] && [ ! -e "$FFMPEG_DIR/INSTALLATION_COMPLETE" ]; then
    if ! command -v ffmpeg >/dev/null; then
      say 'installing ffmpeg'
      if command -v brew >/dev/null; then brew install ffmpeg >&2
      elif command -v apt-get >/dev/null && can_sudo; then
        as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq >&2
        as_root env DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-install-recommends ffmpeg >&2
      else fail 'ffmpeg is missing, and neither brew nor passwordless apt-get is there to install it'
      fi
    fi
    case "$(uname -s)" in Darwin) NAME=ffmpeg-mac ;; *) NAME=ffmpeg-linux ;; esac
    mkdir -p "$FFMPEG_DIR"
    ln -sf "$(command -v ffmpeg)" "$FFMPEG_DIR/$NAME"
    touch "$FFMPEG_DIR/INSTALLATION_COMPLETE"
  fi
fi

# 2. The system libraries and fonts, on Linux: the same set CI's `--with-deps` installs, so
# that screenshots render as they do against CI's Linux baselines. It comes from apt, not the CDN.
if [ "$(uname -s)" = Linux ]; then
  # The dry run lists what is missing on stderr, and exits 1 when anything is.
  MISSING=$(npx --no-install playwright install-deps --dry-run chromium 2>&1 || true)
  case "$MISSING" in *'Missing system dependencies'*)
    can_sudo || fail "system libraries are missing, and there is no passwordless sudo to install them:
$MISSING"
    say "installing the system libraries and fonts Chromium needs ($(printf '%s\n' "$MISSING" | grep -c '^  '))"
    as_root env DEBIAN_FRONTEND=noninteractive apt-get update -qq >&2
    npx --no-install playwright install-deps chromium >&2
  esac
fi

# 3. Proof: launch the browser Playwright will use, headless, as the tests do.
node --input-type=module -e "
  const { chromium } = await import('playwright');
  const browser = await chromium.launch();
  console.error('· ' + chromium.name() + ' ' + browser.version() + ' launches');
  await browser.close();
" || fail 'the browser is installed but does not launch'
