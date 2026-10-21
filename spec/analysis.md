# Repository analysis
## Input
A **GitHub repository** URL, a local directory, or a **GitHub organization**; see [Organization](#organization)
## Branch, tag or commit
A repository URL can name *what* to scan in it, as GitHub's own pages do: `…/tree/<ref>`,
`…/tree/<ref>/<path>`, `…/commit/<sha>` or `…/blob/<ref>/<path>`. Without one, the default branch.
- The skills as they are *at that ref*; their links pin its *commit*
- The **path** is ignored: the *whole* repository is scanned at that ref
- A **query** or a **fragment**, `?tab=readme-ov-file`, `#diff-…`, `#L5` → ignored, as the path is
- A ref with a `/`, `feature/x` → the *longest* prefix of what follows `tree/` or `blob/` that
  names a commit, as GitHub resolves it; a prefix up to a segment that starts with `.` is never a ref
- A **pinned link** Skill Atlas printed, `…/blob/<commit>/…/SKILL.md` → the repository at that commit
- `…/tree/<default branch>` → the same as the repository URL
- **Listing**: code search only knows the default branch → any other ref is listed from the
  *tree*, even with `GITHUB_TOKEN`; a tree too large → the same fallback and a *warning*
- Unknown ref → `Branch, tag or commit not found: <ref> in <owner>/<repo>`, exit code 1
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI and web view: *thin clients*.
Repository: id, link, the scanned *commit*, and the *ref* it was asked at (empty for the default branch)
Skill: id = `repo:path`, name, description, commit, the SKILL.md's *content*
## Details
- **GitHub API**, no clone; *under 5 s* for intellij-community
- The name: front matter, else the directory
- The link pins the *scanned commit*
- Malformed front matter → a *warning*, the scan goes on
- Unreachable repository → a clear message, exit code 1
## Edge cases
Only a `SKILL.md` under one of `SKILL_ROOTS` — `.agents/skills`, `.claude/skills`,
`.github/skills`, `agent/skills` — **at any depth**, counts as a skill.
- **Duplicates**, e.g. in both `.agents` and `.claude`: *one* skill; the other paths are *copies*
- **Shipped with the product**, under a `src` ancestor (it ends up in the built artifact,
  not in the repository's own skills) → not counted, even when it is not a duplicate
- **Test data**, under a `test`, `tests`, `fixture` or `fixtures` ancestor (for example
  `testFixtures`) → not counted
- Elsewhere, outside every `SKILL_ROOTS` → ignored, *silently*: most of a repository
  is not skills, and that is not a warning
## Organization
A **GitHub organization** or user URL, `https://github.com/<owner>`: every repository,
and how many skills each has.
- **Repositories**: the owner's *own*, archived ones included; *forks* left out: code search
  does not look in them, and their skills are their upstream's
- **Skills**: found by *one* code search over the whole owner; counted as in a repository
  scan: copies once, shipped and test data not
- Only a `SKILL.md` outside `SKILL_ROOTS` → the repository has *no* skills
- No `GITHUB_TOKEN` → a clear message, exit code 1: code search needs it
- Unknown owner → a clear message, exit code 1
- More than *1000* `SKILL.md` → a *warning*: code search stops there, the scan goes on
