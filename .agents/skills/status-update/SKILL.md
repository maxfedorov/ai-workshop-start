---
name: status-update
description: Summarize the last 3 merged PRs and the last 3 hours of commits, then post a short status report to Slack. Use when asked for a status update, activity summary, or "what's been happening" report.
---

# Status update

Looks at what actually shipped and changed recently — the last 3 merged PRs and the last 3 hours
of commits — writes a short summary, and posts it to Slack: the same **air-test-mfedorov**
channel (id `C0CAFST6MQF`, **AI Workshop at JetBrains** workspace) used by
[issue-to-pr](../issue-to-pr/SKILL.md) and [red-agent](../red-agent/SKILL.md). This skill never
edits code or touches PRs/issues; it only reads history and reports.

## 1. Gather

The last 3 merged PRs:

```sh
gh pr list --state merged --limit 3 --json number,title,url,mergedAt,author
```

Commits from the last 3 hours on the default branch:

```sh
git fetch origin && git log --since="3 hours ago" --pretty=format:'%h %an %s' origin/main
```

Use whichever branch this repo's actually on if not `main` (`gh repo view --json
defaultBranchRef`).

If a merged PR's commits already show up in that git log window, describe it once from the PR's
title, not again as separate commit lines.

## 2. Summarize

A few plain bullets, not a changelog: what got merged, what's still in flight (commits in the
window not yet in a merged PR), and whether each thing is a fix, a feature, or cleanup. Skip
anything trivial (a typo, a rebase, a merge commit) unless it's genuinely all there is.

If the window is empty — no merged PRs, no commits — say that plainly instead of padding it out.

## 3. Post to Slack, always

Posting is **mandatory**, not best-effort: the **air-test-mfedorov** channel (id `C0CAFST6MQF`,
**AI Workshop at JetBrains** workspace) — the same one
[issue-to-pr](../issue-to-pr/SKILL.md) and [red-agent](../red-agent/SKILL.md) use. Post it with
the `SLACK_BOT_TOKEN` in your environment.

If you can't post it, don't just stop: say so in your report, with the reason — and if the reason
is the token, say plainly whether `SLACK_BOT_TOKEN` is even visible to you (set and non-empty, or
missing) rather than guessing at the cause.

## 4. Report

Give back what you posted (the message itself, or a close paraphrase) and confirm the post went
out, or say why not.
