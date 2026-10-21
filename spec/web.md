# Web view
`./skill-atlas serve [GitHub URL | directory] [--port 3000] [--host 127.0.0.1]`
A local page over the same scan; *nothing is stored*.
## Page
- The **repository**: its link, and the scanned commit
- The **skills**: name, first sentence and path, *filtered as you type*; see [Filter](#filter)
- The selected skill's **SKILL.md**: *rendered*, or its *source*; its link, path, copies and front matter
- The **skills map**: the skills *grouped by the words their names share*; see [Skills map](#skills-map)
- Another repository: scanned from the page
- An **organization**: how many repositories, how many with skills; each repository and its
  number of skills, *the ones with skills first*, filtered as you type: the [Filter](#filter),
  with the repository's name as its name and `owner/name` as its path; with a filter, the ones
  with skills *still* come first, and within each, those whose name has every word
- A repository chosen from the organization → its skills; its header leads back to the
  organization, and *Back* returns to it *without scanning it again*
- **Scanning** → "Charting skills…" and the source, if there is one; *nothing else*
- A scan that **fails** → "Lost in space", its *message*, the source unless the message names it,
  *Try again* if there is a source, and *Scan something else*; *nothing else*
- The URL holds the source, the skill, the filter and the map: links, reloads and *Back* work
- Keyboard: `/` filters, `↑` `↓` choose, `Esc` clears the filter
## Filter
- **Words**: a skill shows when *every* word is in its name, description or path; case is ignored
- **"A phrase"** in quotes: matched *as a whole*; an unclosed quote runs to the end;
  a quote inside a word ends the word and starts the phrase
- **-word**, **-"a phrase"**: skills that have it are *hidden*
- **name:**, **description:**, **path:** before a word or phrase → only that field is searched;
  any other `x:` is a plain word
- A lone `-`, `""` or an empty `name:` → ignored, as if not typed
- **Order**: skills whose *name* has every word come *first*; otherwise the scan's order
- The matches are *marked*, only in the fields they were searched in; exclusions are not
- No skill matches → "No skill matches the filter." and a button that *clears* it
- In the URL as `?q=…`; typing *replaces* the history entry, it adds none
## Skills map
A repository's skills, grouped by the words their names share: opened from the
repository's header, `Skills map`, in place of the selected skill.
- **Words** of a name: split at anything but a letter or a digit, and at camelCase;
  case is ignored; a word counts *once* per skill
- Little words — `a`, `an`, `and`, `for`, `in`, `of`, `on`, `or`, `the`, `to`, `with` —
  and one-letter ones → *never* a group
- **A group**: a word that *two or more* skills share; a skill is in *every* group of its words
- **Order**: the groups with the most skills first, then by word; in each, the list's order
- In each group, its word is *marked* in the names: as a whole word, never inside another
- A skill that shares no word → under **On their own**
- No word shared → "No two skills share a word in their names." and every skill on its own
- The map shows the skills the [Filter](#filter) leaves; none → "No skill matches the filter."
- No skills in the repository → "No skills were found in this repository."
- A skill chosen on the map → its SKILL.md; *Back* returns to the map
- In the URL as `?view=map`, without a skill; an organization → *no* map
## Details
- `GET /api/scan?source=…`: the scan as JSON; without `source`, the one `serve` was given
- An organization's JSON: `organization`, its `repositories`, each with `skills`, a number
- No source → 400; a failure explained to the user → 422 and its *message*
- Markdown is *escaped first*: no HTML from a repository reaches the page
- Links: only http(s), mailto and anchors; relative ones resolve against the SKILL.md's *link*
- Listens on *127.0.0.1* unless `--host`; port taken → a clear message, exit code 1
