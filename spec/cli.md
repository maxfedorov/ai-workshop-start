# Command line
`./skill-atlas scan <GitHub URL | directory>`: a repository, or an organization
`./skill-atlas serve [GitHub URL | directory]`: the same, in a browser; see [web.md](web.md).
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
- A **ref** other than the default branch → named in the header: `JetBrains/kotlin @ feature/x · 6 skills`;
  see [Branch, tag or commit](analysis.md#branch-tag-or-commit)
- Sorted by **name**; the description's *first sentence*
- `also in <paths>` for copies; warnings go to *stderr*
## Organization
```
JetBrains · 871 repositories, 2 with skills
JetBrains/kotlin · 6 skills
  https://github.com/JetBrains/kotlin
```
- Only the repositories *with* skills: *most skills first*, then by name
- Warnings go to *stderr*, each after its repository's name
