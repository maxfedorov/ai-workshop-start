# Skill Atlas

Every agent skill in a repository: `./skill-atlas scan` finds each `SKILL.md` and prints its name,
description and link.

```console
$ npm ci
$ ./skill-atlas scan https://github.com/JetBrains/kotlin
JetBrains/kotlin · 6 skills
…
build-tools-bump-gradle-api — Bumps the Gradle API version that Kotlin Gradle plugins are compiled against in the Kotlin compiler repository.
  https://github.com/JetBrains/kotlin/blob/5ab6270ab772d113e8ad52ebfcaa0109c522ae00/.claude/skills/build-tools-bump-gradle-api/SKILL.md
…
```

`./skill-atlas scan https://github.com/JetBrains` scans an organization: how many repositories, how many
with skills, and each with its number of skills. It needs `GITHUB_TOKEN`: GitHub code search finds the skills.

`./skill-atlas serve [GitHub URL | directory]` opens the same in the browser, at http://127.0.0.1:3000/:
the skills, filtered as you type, and each SKILL.md rendered or as its source (`--port`, `--host`).

Set `GITHUB_TOKEN` for a higher GitHub rate limit. `npm test` runs the tests.

- [spec/](spec/): what it does. [AGENTS.md](AGENTS.md): the definition of done.
- [fixture/](fixture/README.md): a small repository for the tests.
