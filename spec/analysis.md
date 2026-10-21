# Repository analysis
## Input
A **GitHub repository** URL, a local directory, or a **GitHub organization**; see [Organization](#organization)
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI and web view: *thin clients*.
Skill: id = `repo:path`, name, description, commit, the SKILL.md's *content*, its *copies* and *drifted* copies
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
- **Drifted copies**: the same skill directory under two or more `SKILL_ROOTS`, with the same
  ancestors, but *not* byte-identical → *one* skill, the others are its *drifted* copies; a *warning*,
  `<path>: drifted from <paths>`
  - The skill: the alphabetically *first* path's name, description and file; the other paths, sorted,
    each with *how* it differs from that file
  - **How**: `name differs`, `description differs`, `front matter keys differ: <keys>` (added, removed
    or changed, sorted), `body differs (+N −M lines)` (lines the drifted copy adds and removes);
    nothing of these → `only formatting differs`
  - Different ancestors, `a/.claude/skills/x` and `b/.agents/skills/x` → *two* skills: a monorepo's modules
  - A drifted copy's own byte-identical copies → drifted copies too, each listed
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
  scan: copies once, a drifted group once, shipped and test data not
- Only a `SKILL.md` outside `SKILL_ROOTS` → the repository has *no* skills
- No `GITHUB_TOKEN` → a clear message, exit code 1: code search needs it
- Unknown owner → a clear message, exit code 1
- More than *1000* `SKILL.md` → a *warning*: code search stops there, the scan goes on
