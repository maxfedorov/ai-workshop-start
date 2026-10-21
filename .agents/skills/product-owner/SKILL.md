---
name: product-owner
description: Analyze Skill Atlas's code and its open and closed GitHub issues, then propose one genuinely new, useful feature it doesn't have yet. Files it as a GitHub issue, labelled "Delegated to AI". Use when asked to suggest, propose, or brainstorm a new feature, or to act as product owner.
---

# Product owner

Reads what the app actually does and what's already been asked for or rejected, then proposes
one feature that's missing, useful, and not a duplicate — filed as its own GitHub issue, labelled
**Delegated to AI**. This skill never writes code; it only researches and files the idea.

## 0. What counts as "new"

Not a bug fix (that's [red-agent](../red-agent/SKILL.md)'s job), not something already described
in [spec/](../../../spec/), and not substantially the same as an issue that's already open —
or closed, unless it was closed as "not planned"/"wontfix" and you have a genuinely different
angle on it worth revisiting (say so explicitly if you file one anyway).

A good idea extends what the tool is already for — scanning a repository or organization and
surfacing its agent skills — rather than bolting on something unrelated. It should be concrete
enough that another engineer could start building it from the issue alone, not a vague direction
("improve UX").

## 1. Read the code

Skim [spec/analysis.md](../../../spec/analysis.md), [spec/cli.md](../../../spec/cli.md) and
[spec/web.md](../../../spec/web.md) for what's already specified, then the matching source under
`src/` for how it's actually built (the scan pipeline, the CLI, the web view's page controller).
Note what's conspicuously missing or clunky relative to what's there — a format the CLI doesn't
support, a piece of scan data the web view never surfaces, a filter/view the UI doesn't have an
equivalent of elsewhere.

## 2. Read the issues

```sh
gh issue list --state all --limit 200 --json number,title,state,labels,url
```

Skim titles for themes: repeated asks, things explicitly rejected (and why, via `gh issue view
<n>`), and anything already labelled `Delegated to AI` from a previous run of this skill or
[red-agent](../red-agent/SKILL.md), so this run's idea doesn't collide with one already filed.

## 3. Pick exactly one idea

One feature per run, never several — pick the single best one and let the rest go, even if a few
looked promising while reading. It should plug a gap you can point to concretely — a spec section
that stops short of something a user would reasonably expect next, or an issue thread that asked
for something adjacent but not quite this. If closed issues show a similar idea was explicitly
rejected, don't just re-propose it; either skip it or explain in the issue why this version
differs.

## 4. Write it up and file it

Never put code snippets or quoted issue text into shell quotes — write the body to a file first,
the same caution [issue-to-pr](../issue-to-pr/SKILL.md) §0 takes with issue text.

```markdown
## Feature
<one or two sentences: what it is>

## Why
<the gap it fills — point at the spec section or issue(s) that show it's missing, by link/number>

## How it might work
<a sketch: what changes in the CLI output, the web view, or the scan data; not a full design>

## Not a duplicate of
<any related open/closed issue you checked against, and why this is different, or omit if none>
```

```sh
gh issue create --title '<the feature, in a few words>' --label 'Delegated to AI' --body-file idea.md
```

## 5. Post to Slack, always

Posting is **mandatory**, not best-effort: the same **air-test-mfedorov** channel (id
`C0CAFST6MQF`, **AI Workshop at JetBrains** workspace) used by
[issue-to-pr](../issue-to-pr/SKILL.md), [red-agent](../red-agent/SKILL.md) and
[status-update](../status-update/SKILL.md). One message: the feature idea in a sentence or two
(the `## Feature` and `## Why` from §4, in your own words) plus the issue's link. Post it with
the `SLACK_BOT_TOKEN` in your environment.

If you can't post it, don't just move on: say so in a comment on the issue you just filed, with
the reason — and if the reason is the token, say plainly whether `SLACK_BOT_TOKEN` is even
visible to you (set and non-empty, or missing) rather than guessing at the cause.

## 6. Report

Give the issue's URL and title, the gap it's filling (in one line), and anything you ruled out
along the way as too similar to something already open, already rejected, or already in spec.
Confirm the Slack post went out, or say why not.
