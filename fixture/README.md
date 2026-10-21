# fixture

A small repository for the tests.

| Path | Case |
| --- | --- |
| `.claude/skills/commits` | a skill |
| `.agents/skills/commits` | the same skill, byte-identical: listed as a copy |
| `.github/skills/code-style` | a skill in another agent's folder |
| `.agents/skills/release-checklist` | malformed front matter |
| `agent/skills/writing-lint-checks` | an unusual but recognized folder |
| `src/main/resources/.agents/skills/bundled-skill` | shipped with the product; not counted |
| `testFixtures/.claude/skills/shared-test-helper` | test data; not counted |
| `fixtures/skills-map` | a repository of its own, for the skills map: skills whose names share words; test data when `./fixture` is scanned |
| `fixtures/drifted` | a repository of its own, for drifted copies: `commits` in `.agents`, and edited apart in `.claude` and `.github` (byte-identical to each other); `code-style` at the root and in `module/`, two skills; test data when `./fixture` is scanned |
