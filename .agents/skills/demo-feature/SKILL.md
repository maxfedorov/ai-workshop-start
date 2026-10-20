---
name: demo-feature
description: Record a short browser demo video of a Skill Atlas feature. Opens (or reuses) the web view in Chromium, performs the feature's interaction, and saves an MP4. Use when asked for a video demo of a feature, a branch or a PR.
---

# Demo a feature

Produces one short MP4 showing a feature working in the browser: the web view performing the
feature's interaction, start to finish, with nothing left running or installed in the
repository afterwards. Works on macOS and Linux, including sandboxes whose network policy blocks
Playwright's download CDN.

Three helpers in this directory do the fragile parts:

- `setup.sh`: ffmpeg, the `playwright` package and a Chromium, outside the repository (§1)
- `record-template.mjs`: the recording script to edit (§3)
- `finish.sh`: the MP4, its length and frames to check it by (§3)

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

It ends with one line, `DEMO_CHROME_PATH=…`. Keep that value for §3; an empty one means
Playwright's own Chromium. What it does, and why:

- **ffmpeg** on the PATH: `brew install ffmpeg` on macOS, or `sudo -n apt-get install ffmpeg` on
  Linux. It transcodes the recording to MP4, since Playwright's recorder produces WebM.
- **The `playwright` package**, at the version `npx --yes playwright --version` resolves,
  installed in `/tmp/skill-atlas-demo-runner`, not the repository. This repo has no
  browser-testing dependency, and `issue-to-pr`'s review step expects "no browser installed" (see
  `.agents/skills/code-review/SKILL.md`). Don't add it to `package.json` unless asked. The script
  also copies `record-template.mjs` there as `record.mjs`, unless one is already there.
- **Chromium and Playwright's ffmpeg** via `npx playwright install chromium ffmpeg`. Both are
  cached outside the repository (`~/.cache/ms-playwright/` on Linux,
  `~/Library/Caches/ms-playwright/` on macOS), so this is a no-op when they are already there.
  Without Playwright's ffmpeg, `recordVideo` fails at `newPage` with "Executable doesn't exist
  at …/ffmpeg-<rev>/ffmpeg-linux".
- **If that download fails** (seen as `403 Blocked by network policy` from `cdn.playwright.dev`),
  the script reads the exact builds from `npx playwright install --dry-run chromium ffmpeg` and:
  - downloads the same Chrome for Testing build from
    `storage.googleapis.com/chrome-for-testing-public/`, Google's own bucket, which such policies
    usually allow. It unpacks it into the runner directory with `unzip`, or with Python's zipfile
    when `unzip` is missing, and then restores the executable bit. Its path becomes
    `DEMO_CHROME_PATH`;
  - symlinks the system ffmpeg into Playwright's `ffmpeg-<rev>/` install location. Playwright's
    recorder runs fine on it.
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

```sh
cd /tmp/skill-atlas-demo-runner
DEMO_APP_URL=http://127.0.0.1:<port>/ DEMO_CHROME_PATH=<from §1> node record.mjs
```

It writes a `.webm` under `/tmp/skill-atlas-demo/` and prints the final URL. If a locator times
out, the step's text or selector doesn't match the page: fix that step and run again. Then,
from the repository root:

```sh
.agents/skills/demo-feature/finish.sh <feature-slug>
```

It writes `<feature-slug>-demo.mp4` (H.264, plays everywhere) to `$AIR_ARTIFACTS_DIR` when set,
so the video is kept as a session artifact. Otherwise it goes to `~/Desktop`, or `~` when there
is no Desktop. Pass a directory as the second argument to override it. The script prints the
video's path, its duration and five frames spread over it.

**Look at the frames** (read the PNGs) before reporting. Check that each shows what the step
meant to show: the filter typed, the right skills listed, the empty state, the opened skill. If
not, fix `record.mjs`, record again and re-run `finish.sh`.

## 4. Clean up

- Stop the server from §2 only if this run started it: `kill <PID>`.
- `rm -rf /tmp/skill-atlas-demo /tmp/skill-atlas-demo-runner /tmp/skill-atlas-serve.log`
  (after the frames are checked: they live in `/tmp/skill-atlas-demo/frames`).
- Leave the shared browser cache and system ffmpeg in place: they are reused next time.
- Confirm `git status` shows nothing new in the repository: this skill is read-only against it.

## 5. Report

Give the video as a link, with its length, and say in one sentence what it shows. Follow with
the steps it walks through, one line each. Mention any workaround §1 had to take (blocked CDN,
installed ffmpeg), and anything the frames showed that looks off in the feature itself.
