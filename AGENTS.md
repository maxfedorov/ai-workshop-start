# AGENTS.md
## Specs
Read [./spec](spec/) first. Update it with the code.
## Tests
Integration tests for every case in the spec.

E2E tests ([tests/e2e/](tests/e2e/README.md)) check the web view in a real browser, each key
moment compared against a committed screenshot. They do not run in CI; run them yourself
**before every push** — see [Commands](#commands) — and treat any failure as a real regression
until you've checked the diff and decided otherwise (same file, §Updating a screenshot).

## Definition of done
- All tests pass locally
- `npm run test:e2e` passes locally
- The CI build is green

## Commands
- `npm ci`: first, in a fresh checkout
- `npm test`: the tests
- `npm run test:e2e`: the browser tests, before every push (`npm run test:e2e:update` to accept
  a changed screenshot — see [tests/e2e/README.md](tests/e2e/README.md))
