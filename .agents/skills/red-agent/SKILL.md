---
name: red-agent
description: Exploratory-test Skill Atlas's web view in a real browser, against spec/web.md, to find bugs. Files one GitHub issue per bug found, labelled "Delegated to AI", with repro steps and a video, and posts its link to Slack. Use when asked to red-team, fuzz, or hunt for bugs in the web view.
---

# Red agent

Starts the app, drives its web view in a real browser the way a curious user would, and checks
what happens against [spec/web.md](../../../spec/web.md). Each real deviation becomes its own
GitHub issue — repro steps, a short video, labelled **Delegated to AI** — and its link goes to
Slack. This skill never edits the app's code or merges anything; it only reports what it finds.

## 0. What to cover

Default to all of [spec/web.md](../../../spec/web.md): scan, filter, the skills map, a skill's
detail view, an organization and a repository chosen from it, the URL round-tripping state
(`?q=`, `?view=map`), and the keyboard (`/`, `↑` `↓`, `Esc`). If asked to focus on one area
("the filter", "the organization view"), cover that one area thoroughly instead, still against
its spec cases.

A bug is a deviation from the spec, a browser console or page error the spec doesn't call for,
or a crash (a blank page, a hung request, a 500) — never a stylistic opinion about something the
spec leaves unsaid.

## 1. Set up

Same environment as recording a demo — reuse it rather than installing anything of your own:

```sh
.agents/skills/demo-feature/setup.sh
```

This gets ffmpeg and Playwright's browsers in place (§1 there explains what and why). Skip it if
they're already set up (its last run's `DEMO_CHROME_PATH=` line said so).

## 2. Start or reuse the app

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null || ss -ltnp 2>/dev/null | grep ':3000 '
```

**Running**: reuse its URL; you can still scan another source from the page's own form.
**Not running**: start one on `./fixture`, detached, and note the PID — only a server *this
run* started gets stopped in §6:

```sh
GITHUB_TOKEN=$(gh auth token 2>/dev/null) nohup ./skill-atlas serve ./fixture --port 0 \
  > /tmp/skill-atlas-serve.log 2>&1 & echo $!
sleep 3; cat /tmp/skill-atlas-serve.log
```

## 3. Drive it, watching for trouble

Write a Playwright script (or several, one per area) against the running app, following
[tests/e2e/web.spec.ts](../../../tests/e2e/web.spec.ts) for how this app's page is addressed
(`#filter`, `#skill-list`, `#detail`, `#count`, …) — but testing *beyond* what that suite already
checks, since its cases are already known-good. On every page, attach before interacting:

```js
page.on('pageerror', e => console.error('PAGE ERROR', e));
page.on('console', m => { if (m.type() === 'error') console.error('CONSOLE ERROR', m.text()); });
page.on('requestfailed', r => console.error('REQUEST FAILED', r.url(), r.failure()?.errorText));
```

Walk each spec bullet as a real user would: type a filter word, a phrase in quotes, a `-word`, a
`name:`/`path:` prefix; open the skills map and a group; open a skill, then another repository,
then an organization and a repository chosen from it, then *Back*; reload mid-state and check the
URL restores it; press `/`, `↑`, `↓`, `Esc`. Try the edges the spec calls out explicitly (a lone
`-`, an unclosed quote, no skill matching, no shared word, no source) and a few it doesn't (a very
long filter, rapid repeated typing, a `source` that 404s, a stale `?view=map` with no skill).

When something looks wrong, **reproduce it once more** from a fresh page load before trusting it —
flakiness isn't a bug. Keep the exact steps that triggered it; you'll replay them in §5.

## 4. Before filing, check it isn't already reported

```sh
gh issue list --label 'Delegated to AI' --state open --json number,title,url
```

Skip filing a bug that's substantially the same as one already open; if this run can tell it's
already fixed on `main` (`git log`, or trying the repro once more against the latest checkout),
comment that instead of opening a duplicate.

## 5. One issue per bug, with steps and a video

For each confirmed, not-yet-reported bug:

1. Pick a short slug for it, `bug-<n>-<short-slug>`, numbered within this run.
2. Record the exact repro from §3 the same way [demo-feature](../demo-feature/SKILL.md) records
   a feature: edit `/tmp/skill-atlas-demo-runner/record.mjs` (its §3) to perform just those
   steps — load, act, land on the broken result — then:

   ```sh
   cd /tmp/skill-atlas-demo-runner
   DEMO_APP_URL=http://127.0.0.1:<port>/ node record.mjs
   cd -
   .agents/skills/demo-feature/finish.sh bug-<n>-<short-slug> /tmp
   ```

   Look at the frames it prints before moving on: they must show the actual bug (the wrong list,
   the console error overlay if visible, the blank panel), not just the page loading.
3. Attach the video to an issue the same way [issue-to-pr](../issue-to-pr/SKILL.md) attaches one
   to a PR — the script is generic over what it's keyed by:

   ```sh
   .agents/skills/issue-to-pr/attach-demo.sh /tmp/bug-<n>-<short-slug>-demo.mp4 bug-<n>-<short-slug> > demo.md
   ```
4. Write `bug.md`:

   ```markdown
   ## Bug
   <one or two sentences: what's wrong>

   ## Steps to reproduce
   1. ...
   2. ...

   ## Expected
   <the spec case this breaks, quoted from spec/web.md>

   ## Actual
   <what happens instead — include any console/page error text>

   <the contents of demo.md>
   ```

   Never put page content or filter text you typed into shell quotes when building this file —
   use the file directly, the same caution as [issue-to-pr](../issue-to-pr/SKILL.md) §0 takes
   with issue text, since this run's own input to the page could just as easily contain `` $(…) ``.
5. File it:

   ```sh
   gh issue create --title '<what is wrong, in your own words>' --label 'Delegated to AI' --body-file bug.md
   ```
6. Posting its URL to Slack is **mandatory**, not best-effort: the **air-test-mfedorov** channel
   (id `C0CAFST6MQF`, **AI Workshop at JetBrains** workspace) — the same one
   [issue-to-pr](../issue-to-pr/SKILL.md) §1a and §7 use, so clarifications and bug reports land
   in one place. Post it with the `SLACK_BOT_TOKEN` in your environment.

   If you can't post it, don't just move on: say so in a comment on the issue you just filed,
   with the reason — and if the reason is the token, say plainly whether `SLACK_BOT_TOKEN` is
   even visible to you (set and non-empty, or missing) rather than guessing at the cause.

Keep testing after filing one; a run covers every area from §0, not just the first bug found.

## 6. Clean up

- Stop the server from §2 only if this run started it: `kill <PID>`.
- `rm -rf /tmp/skill-atlas-demo /tmp/skill-atlas-demo-runner /tmp/skill-atlas-serve.log`
  (after you've looked at any frames you still need).
- Confirm `git status` on the checkout shows nothing new: this skill never commits to the code,
  only pushes videos to the `demos` branch (via `attach-demo.sh`) and opens issues.

## 7. Report

List what you filed: each issue's URL and title, one line each. For anything that looked wrong
but turned out not to be a bug (flaky once, or already fixed on `main`), say so in one line too,
so it isn't re-investigated next run. Confirm each filed issue's Slack post went out, or say why
not.
