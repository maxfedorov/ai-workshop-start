# Web view
`./skill-atlas serve [GitHub URL | directory] [--port 3000] [--host 127.0.0.1]`
A local page over the same scan; *nothing is stored*.
## Page
- The **repository**: its link, and the scanned commit
- The **skills**: name, first sentence and path, *filtered as you type*
- The selected skill's **SKILL.md**: *rendered*, or its *source*; its link, path, copies and front matter
- Another repository: scanned from the page
- The URL holds the source and the skill: links, reloads and *Back* work
- Keyboard: `/` filters, `↑` `↓` choose, `Esc` clears the filter
## Details
- `GET /api/scan?source=…`: the scan as JSON; without `source`, the one `serve` was given
- No source → 400; a failure explained to the user → 422 and its *message*
- Markdown is *escaped first*: no HTML from a repository reaches the page
- Links: only http(s), mailto and anchors; relative ones resolve against the SKILL.md's *link*
- Listens on *127.0.0.1* unless `--host`; port taken → a clear message, exit code 1
