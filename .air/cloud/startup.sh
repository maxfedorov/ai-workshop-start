#!/usr/bin/env bash
# Air cloud startup: Node toolchain + npm dependencies for Skill Atlas.
# WARMUP (snapshot-baking) runs also prove the environment with `healthcheck`.
set -euo pipefail

if [ "${AIR_STARTUP_MODE:-}" = warmup ]; then WARMUP=1; else WARMUP=; fi

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_DIR"

log() { echo "[startup] $*"; }

# package.json requires node >=24 (CI uses 24). The image ships one via nvm; install 24 only if it is older.
node_major() { node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0; }
if [ "$(node_major)" -lt 24 ]; then
  log "node $(node -v 2>/dev/null || echo missing) is older than 24; installing Node 24 via nvm"
  export NVM_DIR="${NVM_DIR:-/usr/local/nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] || NVM_DIR="$HOME/.nvm"
  if [ ! -s "$NVM_DIR/nvm.sh" ]; then
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | PROFILE=/dev/null bash
  fi
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm install 24
  nvm alias default 24
fi
log "using node $(node -v), npm $(npm -v)"

log "installing dependencies (npm ci)"
npm ci --no-audit --no-fund
log "dependencies installed"

healthcheck() {
  log "healthcheck: typecheck"
  npm run typecheck
  log "healthcheck: tests"
  npm test
  log "healthcheck: CLI smoke test on ./fixture"
  ./skill-atlas help >/dev/null
  ./skill-atlas scan ./fixture
  log "healthcheck: OK"
}

if [ -n "${WARMUP:-}" ]; then healthcheck; fi
log "done"
