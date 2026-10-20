---
name: code-review
description: Review a pull request, a branch or uncommitted changes in Skill Atlas. Gives a short summary plus inline comments, each saying where the problem is and how to reproduce it. Use when asked to review code or a PR.
---

# Code review

A review is **short**: a few lines of summary, then inline comments. Each comment points at
one line and says how to see the problem. Report only what you reproduced, or are sure of from
the code, and say which in `Verified`. Leave out anything you only suspect.

## 1. Get the change

- A PR: `gh pr view <n>`, `gh pr diff <n>`, `gh pr checks <n>`
- A branch: `git diff main...HEAD`
- Uncommitted work: `git diff HEAD`

Read [AGENTS.md](../../../AGENTS.md) and the parts of [spec/](../../../spec/) that the change
touches. Then read the changed files around the diff, not just the diff itself.

Read the PR description as a list of claims ("both stay still under reduced motion", "the CLI
output is unchanged") and check each one. A claim the code does not keep is a finding.

If you already reviewed this PR, read your earlier review first: both the summaries and the
inline comments, keeping only the ones whose `user.login` is yours:

```sh
gh api --paginate repos/{owner}/{repo}/pulls/<n>/reviews
gh api --paginate repos/{owner}/{repo}/pulls/<n>/comments
```

After a push, an old comment's `line` is `null`; it was on `original_line`. The author's
replies (`in_reply_to_id`) hint at what is fixed, but check each fix yourself. Do not post an
old comment again. Say in the summary which ones are fixed, and comment only on what is new
or still broken.

## 2. Run it

In a fresh checkout of the change:

```sh
npm ci && npm run typecheck && npm test
./skill-atlas help && ./skill-atlas scan ./fixture
```

Then run what the change touches:

- **Core or CLI**: the command on the input the change is about, compared with `main`
- **Server** (`src/web/*.ts`): `./skill-atlas serve ./fixture --port 0`, then `curl` the
  routes and check the status, the headers and the JSON
- **Page** (`src/web/page/`): `curl` proves nothing here. If a headless browser is available,
  load the page and assert on what a user gets: computed styles, the DOM, console errors.
  Emulate what the change depends on, such as `page.emulateMedia({ reducedMotion: 'reduce' })`
  or a 390 px viewport. The Air cloud environment has none for now: its network policy blocks
  `cdn.playwright.dev`, and the repository does not install a browser. Then don't spend time
  trying. Give exact manual steps, mark the comment *manual*, keep only what you are sure of
  from the code, and say `page: manual, no browser` in `Checked`

Write down which checks passed and which failed: they go in the summary.

## 3. Look for, in this order

1. **Correctness**: wrong output, a crash, or behaviour the spec does not describe
2. **Spec and tests** ([AGENTS.md](../../../AGENTS.md)): the spec is updated with the code, and
   every case in the spec has an integration test
3. **Security**: HTML or script from a scanned repository reaching the page, unsafe links,
   files served from outside `src/web/page`, `GITHUB_TOKEN` in output or logs
4. **Page specifics**:
   - the cascade: a rule inside `@media` adds no specificity, so a later rule with the same
     selector beats it
   - `prefers-reduced-motion` stops every new animation and transition
   - the CSP stays as it is: no inline `style=` or `<script>`, no external fonts or images
   - narrow screens still work
   - decorative SVGs are `aria-hidden`
5. **Fit**: does it match the surrounding code (thin clients over the core, nothing stored,
   names and comments in the same style)? Comment only where it costs something

Skip nits the codebase does not care about. Do not comment on taste, and do not repeat
something the CI already reports.

## 4. Write it

**Summary**, at most 6 lines:

```
Verdict: request changes | comment | approve
Checked: npm test 17/17 ✔, typecheck ✔, smoke ✔, CI ✔, page in headless Chromium ✔
2 blockers, 1 minor; the main one: <one line>
Spec: <updated | not needed, because …>; tests: <cover the change | missing for …>
Earlier comments: <2 fixed, 1 still open>   (only on a repeat review)
```

Verdict: any blocker or major → *request changes*; only minors → *comment*; nothing → *approve*.
Post it as that review `event` (see §5), so that *request changes* really blocks the merge.

**Inline comments**: one per problem, on the changed line (the new side of the diff):

```
**[blocker|major|minor]** <the problem, in one sentence>
Where: `src/core/scan.ts:42`, in `readSkill`
Reproduce: `./skill-atlas scan ./fixture` → prints `commits` twice; expected once with `also in …`
Verified: ran it | headless Chromium | manual | by reading the code
Fix: <one sentence that fits the surrounding code, optional>
```

`Reproduce` is an exact command, input, URL or script, then what happens and what should
happen. The best reproduction is one the author can run as is: a failing test they can paste
into `tests/`, or a few lines of browser script for the page.

## 5. Post it (only when asked)

Locally, print the summary and then the comments. On GitHub, post a single review:

```sh
gh api repos/{owner}/{repo}/pulls/<n>/reviews -X POST --input review.json
```

```json
{
  "event": "<REQUEST_CHANGES | COMMENT | APPROVE, from the verdict>",
  "body": "<summary>",
  "comments": [{ "path": "src/core/scan.ts", "line": 42, "side": "RIGHT", "body": "<comment>" }]
}
```

`line` must be a line of the diff. A comment about a line the change did not touch goes in
the summary. GitHub does not let you approve or request changes on your own PR, so use
`COMMENT` there.
