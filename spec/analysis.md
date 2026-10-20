# Repository analysis
## Input
A **GitHub repository** URL, or a local directory
## Output
Every `SKILL.md`: **name**, **description**, **link**
## Architecture
Core: fetch → find → parse. CLI: a *thin client*.
Skill: id = `repo:path`, name, description, commit
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
