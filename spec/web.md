# Web view
`./skill-atlas serve [GitHub URL | directory] [--port 3000] [--host 127.0.0.1]`
A local page over the same scan; *nothing is stored*.
## Page
- The **repository**: its link, and the scanned commit
- The **skills**: name, first sentence and path, *filtered as you type*; see [Filter](#filter)
- The selected skill's **SKILL.md**: *rendered*, or its *source*; its link, path, copies and front matter
- Another repository: scanned from the page
- The URL holds the source, the skill and the filter: links, reloads and *Back* work
- Keyboard: `/` filters, `↑` `↓` choose, `Esc` clears the filter
## Filter
- **Words**: a skill shows when *every* word is in its name, description or path; case is ignored
- **"A phrase"** in quotes: matched *as a whole*; an unclosed quote runs to the end
- **-word**, **-"a phrase"**: skills that have it are *hidden*
- **name:**, **description:**, **path:** before a word or phrase → only that field is searched;
  any other `x:` is a plain word
- A lone `-`, `""` or an empty `name:` → ignored, as if not typed
- **Order**: skills whose *name* has every word come *first*; otherwise the scan's order
- The matches are *marked*, only in the fields they were searched in; exclusions are not
- No skill matches → "No skill matches the filter." and a button that *clears* it
- In the URL as `?q=…`; typing *replaces* the history entry, it adds none
## Details
- `GET /api/scan?source=…`: the scan as JSON; without `source`, the one `serve` was given
- No source → 400; a failure explained to the user → 422 and its *message*
- Markdown is *escaped first*: no HTML from a repository reaches the page
- Links: only http(s), mailto and anchors; relative ones resolve against the SKILL.md's *link*
- Listens on *127.0.0.1* unless `--host`; port taken → a clear message, exit code 1
