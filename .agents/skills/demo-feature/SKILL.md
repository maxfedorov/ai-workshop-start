---
name: demo-feature
description: Record a short browser demo video of a Skill Atlas feature. Opens (or reuses) the web view in Chromium, performs the feature's interaction, and saves an MP4. Use when asked for a video demo of a feature, a branch or a PR.
---

# Demo a feature

Produces one short MP4 showing a feature working in the browser: the web view performing the
feature's interaction, start to finish, with nothing left running or installed in the
repository afterwards.

## 0. Input

What to demo, given as one or more of:

- a plain description ("filtering the skill list", "rendered Markdown with a working link")
- a branch (`git checkout <branch>` first, if not already on it)
- a PR (`gh pr checkout <n>`, or just `gh pr view <n>` to read it if already checked out)

Read the branch's `spec/` changes or the PR description to know which interaction is the
feature: what to type, what to click, what the result should show. A vague request ("демо
веб-вью") means: scan `./fixture`, filter to one skill, open its rendered SKILL.md — the
smallest tour that touches scan → filter → detail.

## 1. Check the environment

- **ffmpeg**: `which ffmpeg || brew install ffmpeg`. Used only to transcode the recording to
  MP4; Playwright's own recorder produces WebM.
- **Playwright + Chromium**: `npx --yes playwright --version` confirms the CLI resolves.
  Chromium itself lives outside the repo, in `~/Library/Caches/ms-playwright/`, shared by every
  project — `npx --yes playwright install chromium` is a no-op if it is already there, so it is
  safe to run every time rather than probing first.
- **The `playwright` npm package**, to `import` in a recording script: check whether it already
  resolves from the repo (`node -e "await import('playwright')"` from the repo root). It won't
  unless a previous run added it. Don't add it to `package.json` unless asked — this repo has no
  browser-testing dependency today, and `issue-to-pr`'s review step already treats "no browser
  installed" as an acceptable, expected state (see `.agents/skills/code-review/SKILL.md`).
  Instead, create a throwaway working directory and install it there:

  ```sh
  mkdir -p /tmp/skill-atlas-demo-runner && cd /tmp/skill-atlas-demo-runner
  npm init -y >/dev/null 2>&1
  npm install playwright@<version matching npx --yes playwright --version> >/dev/null 2>&1
  ```

  Run the recording script (§3) from that directory. It still drives Chromium against the
  already-shared browser cache, so this install is quick even though it happens per run.

## 2. Start or reuse the app

Check for a server already listening before starting a new one:

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

- **Running**: reuse its URL. If it was started with a different source already loaded, that's
  fine — the demo can scan a different source from the page's own form.
- **Not running**: start one, on a port of its own choosing so it can't collide with anything:

  ```sh
  GITHUB_TOKEN=$(gh auth token 2>/dev/null) ./skill-atlas serve --port 0 &
  ```

  Read the URL it prints (`http://127.0.0.1:<port>/`). Remember the PID (`$!`) — only a server
  *this run* started gets stopped in §4.

## 3. Record

Use `record-template.mjs` in this directory as the starting point; copy it into the throwaway
directory from §1 and edit the steps between `page.goto` and `context.close()` to match the
feature from §0 — which source to scan, what to type into `#filter`, which skill in
`#skill-list` to open, what else to show (a warning, `also in …`, a link). Keep each step
visible for at least ~800ms–1500ms so the video reads clearly at normal speed; a demo under
~15 seconds is usually enough.

```sh
cd /tmp/skill-atlas-demo-runner   # or wherever §1 installed playwright
node record.mjs
```

It writes a `.webm` under `/tmp/skill-atlas-demo/`. Transcode it for easy playback and sharing:

```sh
ffmpeg -y -i /tmp/skill-atlas-demo/*.webm -c:v libx264 -pix_fmt yuv420p -movflags +faststart \
  /tmp/skill-atlas-demo/<feature-slug>-demo.mp4
```

Save the result outside the repository, e.g. `~/Desktop/<feature-slug>-demo.mp4`, unless asked
to commit or attach it somewhere specific (a PR comment, for example).

## 4. Clean up

- Stop the server from §2 only if this run started it: `kill $!` (or the PID noted earlier).
- Remove `/tmp/skill-atlas-demo` and, if created, `/tmp/skill-atlas-demo-runner`.
- Confirm `git status` still shows nothing new in the repository — this skill is read-only
  against it.

## 5. Report

The saved file's path and length (`ffprobe -v error -show_entries format=duration -of
default=noprint_wrappers=1 <file>`), and one sentence on what the recording shows.
