---
name: code-review
description: Review a pull request, a branch or uncommitted changes in Skill Atlas. Gives a short summary plus inline comments, each saying where the problem is and how to reproduce it. Use when asked to review code or a PR.
---

# Code review

A review is **short**: a few lines of summary, then inline comments. Each comment points at
one line and says how to see the problem. If you cannot reproduce something, leave it out.

## 1. Get the change

- A PR: `gh pr view <n>`, `gh pr diff <n>`, `gh pr checks <n>`
- A branch: `git diff main...HEAD`
- Uncommitted work: `git diff HEAD`

Read [AGENTS.md](../../../AGENTS.md) and the parts of [spec/](../../../spec/) that the change
touches. Then read the changed files around the diff, not just the diff itself.

## 2. Run it

In a fresh checkout of the change:

```sh
npm ci && npm run typecheck && npm test
./skill-atlas help && ./skill-atlas scan ./fixture
```

For a web view change, also start `./skill-atlas serve ./fixture --port 0` and check it with
`curl` against `/api/scan`. Write down which commands passed and which failed: they go in the
summary.

## 3. Look for, in this order

1. **Correctness**: wrong output, a crash, or behaviour the spec does not describe
2. **Spec and tests** ([AGENTS.md](../../../AGENTS.md)): the spec is updated with the code, and
   every case in the spec has an integration test
3. **Security**: HTML or script from a scanned repository reaching the page, unsafe links,
   files served from outside `src/web/page`, `GITHUB_TOKEN` in output or logs
4. **Fit**: does it match the surrounding code (thin clients over the core, nothing stored,
   names and comments in the same style)? Comment only where it costs something

Skip nits the codebase does not care about. Do not comment on taste, and do not repeat
something the CI already reports.

## 4. Write it

**Summary**, at most 5 lines:

```
Verdict: request changes | comment | approve
Checked: npm test 17/17 ✔, typecheck ✔, smoke ✔, CI ✔
2 blockers, 1 minor; the main one: <one line>
```

**Inline comments**: one per problem, on the changed line (the new side of the diff):

```
**[blocker|major|minor]** <the problem, in one sentence>
Where: `src/core/scan.ts:42`, in `readSkill`
Reproduce: `./skill-atlas scan ./fixture` → prints `commits` twice; expected once with `also in …`
Fix: <one sentence, optional>
```

`Reproduce` is an exact command, input, URL or test, then what happens and what should happen.
The best reproduction is a failing test the author can paste into `tests/`.

## 5. Post it (only when asked)

Locally, print the summary and then the comments. On GitHub, post a single review:

```sh
gh api repos/{owner}/{repo}/pulls/<n>/reviews -X POST --input review.json
```

```json
{
  "event": "COMMENT",
  "body": "<summary>",
  "comments": [{ "path": "src/core/scan.ts", "line": 42, "side": "RIGHT", "body": "<comment>" }]
}
```

`line` must be a line of the diff. A comment about a line the change did not touch goes in
the summary. GitHub does not let you approve or request changes on your own PR, so use
`COMMENT` there.
