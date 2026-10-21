# Command line
`./skill-atlas scan <GitHub URL | directory>`: a repository, or an organization
`./skill-atlas scan --json <GitHub URL | directory>`: the same, as JSON; see [JSON](#json)
`./skill-atlas serve [GitHub URL | directory]`: the same, in a browser; see [web.md](web.md).
Prints the result **at once**; *nothing is stored*.
`GITHUB_TOKEN`, optional: a higher GitHub rate limit.
## Output
```
JetBrains/kotlin · 6 skills
build-tools-bump-gradle-api — Bumps the Gradle API…
  https://github.com/JetBrains/kotlin/blob/<commit>/…
```
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
## JSON
`--json`, before or after the source: *one* JSON object on stdout, for scripts and CI
- **A repository**: `source`, `repository` (`id`, `url`, `commit`), `skills`, `warnings`
- **Each skill**: `id`, `name`, the *whole* `description`, `path`, `link`, `copies`;
  not its `content`: the link has it
- A **local directory** → an *empty* `commit`, file:// links
- **An organization**: `source`, `organization` (`id`, `url`), `repositories`, `warnings`;
  each repository `id`, `url` and `skills`, a number
- *Every* repository, those without skills too: *most skills first*, then by name
- The same order as the text; the same shape as the web view's `/api/scan`, minus the page's fields
- Warnings: in the JSON *and* on stderr; stdout is *only* the JSON
- A failure → the message on stderr, exit code 1, *nothing* on stdout
- `--json=…`, `--json` twice, another flag, a second source or none → the usage, exit code 1
