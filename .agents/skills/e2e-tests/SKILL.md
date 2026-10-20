---
name: e2e-tests
description: Run and maintain Skill Atlas's end-to-end browser tests and their screenshot baselines. Use before every commit or push that touches the web view, or whenever a screenshot comparison fails or needs updating.
---

# End-to-end tests

[tests/e2e/](../../../tests/e2e/README.md) checks the web view in a real headless Chromium:
DOM assertions plus a screenshot of the relevant region, compared against a baseline committed
in `tests/e2e/web.spec.ts-snapshots/`. They are **not** part of CI (screenshots only mean
anything on the machine that made them) — which is exactly why an agent must run them itself.

**Run them before every push, whether or not this run touched the web view**, and treat any
failure as blocking: per [AGENTS.md](../../../AGENTS.md), `npm run test:e2e` passing locally is
part of the definition of done.

```sh
npm run test:e2e
```

First run only: `npx playwright install chromium` (downloads once, outside the repository).
It starts `skill-atlas serve ./fixture` itself — nothing needs to be running first.

## A failure

Read what failed before touching anything:

- **A DOM assertion** (text, value, visibility): a real behaviour change. Fix the code, or the
  test if the behaviour change was intended and the spec was updated for it.
- **A screenshot mismatch**: the output names the three images —

  ```
  Expected: tests/e2e/web.spec.ts-snapshots/skill-list-chromium-darwin.png   (committed baseline)
  Received: test-results/.../skill-list-actual.png                          (this run, gitignored)
  Diff:     test-results/.../skill-list-diff.png                            (differing pixels, in red)
  ```

  Read the diff — `npx playwright show-report` shows all three side by side — before deciding
  which case this is:

  - **Not what the change was supposed to do**: a real finding. Fix the code.
  - **Exactly what the change was supposed to do** (new copy, a restyled panel, a moved
    element): accept the new screenshot as the baseline and commit it *in the same change that
    caused it*, so a reviewer sees both together:

    ```sh
    npm run test:e2e:update
    git add tests/e2e/web.spec.ts-snapshots/
    ```

    Look at the new PNG once before committing — accepting a screenshot you haven't looked at
    defeats the point of having one.

A case with no baseline yet (a new `toHaveScreenshot(...)` call) writes one on its own and
passes, with a console note that it did; look at it before committing it too.

## Adding a case

Write it into [tests/e2e/web.spec.ts](../../../tests/e2e/web.spec.ts) (or a new `*.spec.ts`
under `tests/e2e/`), next to the spec case it checks — see
[tests/e2e/README.md](../../../tests/e2e/README.md) for how to pick what to screenshot, how to
name it, and why. In short: screenshot the smallest element that shows the thing (not the full
page), always pass `toHaveScreenshot` an explicit name, and run `npm run test:e2e` once to
create and check the new baseline before committing it.
