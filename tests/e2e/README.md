# End-to-end tests

The web view, in a real (headless) Chromium, against `./fixture`. Each case checks the DOM
directly (text, values, visibility) *and* a screenshot of the relevant region against a
baseline committed in [web.spec.ts-snapshots/](web.spec.ts-snapshots/) — so a visual regression
(broken layout, a style that stopped applying, truncated text) fails the test even when every
other assertion passes.

Run them yourself, locally, before every push (see [AGENTS.md](../../AGENTS.md)) — they also
run in CI on every push and pull request, and a pull request can only merge once that run is
green.

Screenshots are sensitive to the machine that renders them (fonts, GPU, OS), so Playwright
names each baseline after the OS it was made on — `*-chromium-darwin.png` locally on macOS,
`*-chromium-linux.png` for CI. Both are committed, side by side; your local run only ever
touches the one for your OS.

## Running

```sh
npm run test:e2e
```

This starts `skill-atlas serve ./fixture` itself (see `webServer` in
[playwright.config.ts](../../playwright.config.ts)) — nothing needs to be running first. First
time only: `npx playwright install chromium` downloads the browser (outside the repository,
`~/Library/Caches/ms-playwright/` on macOS, `~/.cache/ms-playwright/` on Linux).

A failure prints which assertion failed. For a screenshot mismatch, it also prints three paths:

```
Expected: tests/e2e/web.spec.ts-snapshots/skill-list-chromium-darwin.png   (the baseline, committed)
Received: test-results/.../skill-list-actual.png                          (this run, not committed)
Diff:     test-results/.../skill-list-diff.png                            (pixels that differ, in red)
```

Open an HTML report with all three side by side instead of reading paths:

```sh
npx playwright show-report
```

(`test-results/` and `playwright-report/` are gitignored — they're scratch output, regenerated
on every run, never meant to be committed.)

## When a screenshot differs

Look at `Expected`, `Received` and `Diff` before deciding anything — a diff is a difference, not
automatically a bug.

- **Unexpected** (the change wasn't supposed to touch this, or it broke something): that's a
  real finding. Fix the code, not the test.
- **Expected** (the change intentionally moved, restyled or reworded what the screenshot
  covers): accept the new screenshot as the baseline:

  ```sh
  npm run test:e2e:update
  ```

  This overwrites the files in `web.spec.ts-snapshots/`. Review the diff once more with
  `git diff` (or `git add -p` and look at the staged image in a viewer) before committing —
  committing a screenshot is committing a claim that this is what correct looks like now. Commit
  it in the same PR as the change that caused it, so a reviewer sees both together:

  ```sh
  git add tests/e2e/web.spec.ts-snapshots/
  git commit -m "Update the skill-list screenshot for <the change>"
  ```

  That updates your OS's baseline only. CI runs on Linux, so also update the Linux one: run the
  **Update e2e screenshots** workflow (Actions tab, or `gh workflow run update-e2e-snapshots.yml
  --ref <your branch>`) — it regenerates `*-chromium-linux.png` on an actual Linux runner and
  pushes the result to your branch. Pull it (`git pull`) before pushing anything else.

## CI failures

On CI, a missing or mismatched screenshot always fails the job — unlike locally, it is never
silently written as a new baseline (`updateSnapshots: process.env.CI ? 'none' : 'missing'` in
[playwright.config.ts](../../playwright.config.ts)). A failed run uploads an `e2e-report`
artifact with the HTML report and `test-results/` (expected, actual and diff PNGs for every
failure) — download it from the run's **Summary** page. Decide the same way as above: a real
regression gets a code fix; an intended change gets its Linux baseline updated through the
workflow above.

## Writing a new case

Prefer a screenshot of the smallest element that shows the thing (`#layout`, `#detail`), not
the full page — less to go wrong with unrelated change elsewhere on the page, and a smaller,
more readable diff. Give every `toHaveScreenshot(...)` call an explicit name; an unnamed one is
numbered from the test's position in the file, and reordering tests then renames — and
re-creates — every baseline after it.

New case → no baseline yet → `npm run test:e2e` writes one on its own and passes (with a
console note that it did). Check the new PNG by eye before committing it; a baseline that was
never looked at proves nothing.
