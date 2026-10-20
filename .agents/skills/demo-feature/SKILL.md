---
name: demo-feature
description: Record a short browser demo video of a Skill Atlas feature. Opens (or reuses) the web view in Chromium, performs the feature's interaction, and saves an MP4 and a GIF. Use when asked for a video demo of a feature, a branch or a PR.
---

# Demo a feature

Produces one short MP4, and a GIF of it, showing a feature working in the browser: the web view performing the
feature's interaction, start to finish, with nothing left running or installed in the
repository afterwards. Works on macOS and Linux, including sandboxes whose network policy blocks
Playwright's download CDN.

Three helpers in this directory do the fragile parts:

- `setup.sh`: ffmpeg, Playwright's browsers and the system libraries they need (§1)
- `record-template.mjs`: the recording script to edit (§3)
- `finish.sh`: the MP4, the GIF, its length and frames to check them by (§3)

## 0. Input

What to demo, given as one or more of:

- a plain description ("filtering the skill list", "rendered Markdown with a working link")
- a branch (`git checkout <branch>` first, if not already on it)
- a PR: `gh pr view <n> --json title,body,headRefName,state` and `gh pr diff <n>`

Read the branch's `spec/` changes or the PR description to know which interaction is the
feature: what to type, what to click, what the result should show. The PR's tests and its
"not checked" notes (e.g. "no headless browser, the DOM wiring was not exercised") say what is
most worth showing: put those steps in the video.

A merged PR may already be in the checkout, possibly squashed into another commit, so its own
commit isn't in `git log`. Check that the PR's code is there, by grepping for a symbol its diff
adds, before running `gh pr checkout`. Without it, the checkout is either not needed or fails on
a deleted branch.

A vague request ("демо веб-вью") means: scan `./fixture`, filter to one skill, open its rendered
SKILL.md. That is the smallest tour that touches scan → filter → detail.

## 1. Set up the environment

```sh
.agents/skills/demo-feature/setup.sh        # from the repository root
```

It ends with one line, `DEMO_CHROME_PATH=`, now always empty: the browser is where Playwright
looks for it, so `record.mjs` needs no path. What it does, and why:

- **ffmpeg** on the PATH: `brew install ffmpeg` on macOS, or `sudo -n apt-get install ffmpeg` on
  Linux. `finish.sh` makes the MP4 and the GIF with it, since Playwright's recorder writes WebM.
- **The repository's own Playwright**, the devDependency the e2e tests use (`npm ci` first, if
  `node_modules` is missing). Nothing extra is installed in the repository.
- **Its browsers and their system libraries**, through
  [scripts/playwright-browsers.sh](../../../scripts/playwright-browsers.sh), the same script the
  e2e tests rely on. It installs Chromium, the headless shell and Playwright's ffmpeg in
  Playwright's cache (`~/.cache/ms-playwright/` on Linux, `~/Library/Caches/ms-playwright/` on
  macOS), and does nothing when they are already there. Where Playwright's CDN is blocked (`403
  Blocked by network policy` from `cdn.playwright.dev`, as in Air's cloud), it downloads the same
  Chrome for Testing builds from Google's own bucket, `storage.googleapis.com`, into those same
  places, and links the system ffmpeg in as Playwright's. On Linux it then installs the libraries
  and fonts Chromium needs (`libnss3`, `libcups2` and the rest), the same set CI's `--with-deps`
  installs, with passwordless sudo. Last, it launches the browser once to prove it works.
- **The runner directory**, `/tmp/skill-atlas-demo-runner`, outside the repository: it gets a
  copy of `record-template.mjs` as `record.mjs` (unless one is there already), and a link to the
  repository's `node_modules`, so that `record.mjs` imports the repository's Playwright.
- **Not** the system `chromium-browser`: on Ubuntu it is a shim that only says "requires the
  chromium snap".

If the script still fails, read its last `·` line: it says which of the steps above stopped.

## 2. Start or reuse the app

Check for a server already listening:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN 2>/dev/null || ss -ltnp 2>/dev/null | grep ':3000 '
```

(`lsof` is often missing on Linux; `ss` is there.)

- **Running**: reuse its URL. If it was started with a different source already loaded, that's
  fine: the demo can scan another source from the page's own form.
- **Not running**: start one with the source the demo needs, on a port of its own choosing.
  Detach it, so it outlives the shell call that starts it:

  ```sh
  GITHUB_TOKEN=$(gh auth token 2>/dev/null) nohup ./skill-atlas serve ./fixture --port 0 \
    > /tmp/skill-atlas-serve.log 2>&1 & echo $!
  sleep 3; cat /tmp/skill-atlas-serve.log
  ```

  Read the URL it prints (`Skill Atlas: http://127.0.0.1:<port>/`). Note the PID: only a server
  *this run* started gets stopped in §4. With a source given to `serve`, the page opens with the
  list already loaded. Then the recording waits for `#skill-list li` instead of scanning from the
  form.

## 3. Record

Edit `/tmp/skill-atlas-demo-runner/record.mjs` between its two `--- Edit … ---` markers to match
the feature from §0. That means which source to scan, what to type into `#filter` (with its
`filterBy(text)` helper), which skill in `#skill-list` to open, and what else to show (a warning,
`also in …`, a link, a reload that keeps the state). Use the fixture's real skill names and words.
`tests/` shows which inputs give which results. Keep each result on screen ~1–2 s; 15–30 s is
usually enough.

Keep the template's `markStart()` where the demo begins: right after the first
`waitForSelector('#skill-list li')` when `serve` was given the source, as the template has it.
It records how far into the video the page was ready, in `/tmp/skill-atlas-demo/start-offset`,
and the GIF starts there; the recording itself begins with a blank page. When the demo scans
from the page's own form instead, use the template's `scanFromForm(source)`: it marks the start
once the form is there, before the typing, since the typing is part of the demo. Only the first
`markStart()` counts.

```sh
cd /tmp/skill-atlas-demo-runner
DEMO_APP_URL=http://127.0.0.1:<port>/ node record.mjs
```

It writes a `.webm` under `/tmp/skill-atlas-demo/` and prints the final URL. If a locator times
out, the step's text or selector doesn't match the page: fix that step and run again. Then,
from the repository root:

```sh
.agents/skills/demo-feature/finish.sh <feature-slug>
```

It writes two files to `$AIR_ARTIFACTS_DIR` when set, so they are kept as session artifacts.
Otherwise they go to `~/Desktop`, or `~` when there is no Desktop. Pass a directory as the
second argument to override it.

- `<feature-slug>-demo.mp4`: H.264, the whole recording; plays everywhere
- `<feature-slug>-demo.gif`: the same from `markStart()` on (from the beginning without a mark),
  for a PR description or a chat, where a GIF plays inline. Made with a palette of its own, two
  passes, since the page's dark gradient bands badly without one. 960 px wide at 12 fps by
  default, which gives about 3 MB for 25 s. `DEMO_GIF_WIDTH` and `DEMO_GIF_FPS` change that.
  Over 8 MB, the script prints a hint to lower them

It prints `video=`, `duration=`, `frames=` (five frames spread over the MP4), then `gif=`,
`gif_size=` (bytes), `gif_start=` (seconds cut from the start) and `gif_first_frame=`.

**Look at the frames** (read the PNGs) before reporting. Check that each shows what the step
meant to show: the filter typed, the right skills listed, the empty state, the opened skill.
Read `gif-first.png` too. It is the GIF's first frame, the preview people see before it plays,
and it must show the loaded page, not a blank one. If not, fix `record.mjs` (where
`markStart()` is), record again and re-run `finish.sh`.

Reading the GIF itself with an image-reading tool shows only its first frame. To see it move,
open it by its link.

## 4. Clean up

- Stop the server from §2 only if this run started it: `kill <PID>`.
- `rm -rf /tmp/skill-atlas-demo /tmp/skill-atlas-demo-runner /tmp/skill-atlas-serve.log`
  (after the frames are checked: they live in `/tmp/skill-atlas-demo/frames`).
- Leave the shared browser cache and system ffmpeg in place: they are reused next time.
- Confirm `git status` shows nothing new in the repository: this skill is read-only against it.

## 5. Report

Give both files as links, the GIF and the MP4, with the length and the GIF's size, and say in
one sentence what they show. Follow with
the steps it walks through, one line each. Mention any workaround §1 had to take (blocked CDN,
installed ffmpeg), and anything the frames showed that looks off in the feature itself.
