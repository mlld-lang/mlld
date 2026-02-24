---
id: file-loading-basics
title: File Loading Basics
brief: Load file contents, sections, and globs
category: syntax
parent: file-loading
aliases: [file, files, load]
tags: [files, loading, angle-brackets, globs, sections, optional]
related: [file-loading-ast, file-loading-metadata, variables-basics]
related-code: [interpreter/eval/content-loader.ts, grammar/patterns/alligator.peggy]
updated: 2026-02-24
qa_tier: 1
---

```mlld
>> Basic loading
var @content = <README.md>
var @config = <config.json>          >> auto-parsed as object
var @events = <events.jsonl>         >> auto-parsed as array of JSON objects
var @author = <package.json>.author  >> field access
show @events[0].event                >> first JSONL record

>> Globs (returns array)
var @docs = <docs/**/*.md>
show @docs.length
for @doc in @docs => show @doc.mx.filename

>> JSON globs - each item is auto-parsed
var @configs = <configs/*.json>
var @first = @configs[0]
show @first.name                     >> access parsed JSON
show @first.mx.filename              >> file metadata still available

>> With "as" template
var @toc = <docs/*.md> as "- [<>.mx.fm.title](<>.mx.relative)"
```

**Section selection** - extract markdown heading blocks:

```mlld
>> Single section (includes child headings)
var @overview = <guide.md # Overview>

>> Multi-section include list (comma-separated)
var @selected = <guide.md # "Quick Start", Other>

>> Include/exclude sets
var @filtered = <guide.md # "TL;DR", "Titled section", Other; !# tldr, "Another section title">

>> Optional include (no error if missing)
var @maybe = <guide.md # "Migration Notes"?, "Quick Start">

>> Fuzzy heading matching (case/punctuation-insensitive, prefix-based)
var @tldr = <guide.md # tldr>        >> matches heading "TL;DR"
```

Rules:
- Include items are comma-separated after `#`.
- Exclude items are comma-separated after `; !#` (or `; #`).
- Use quotes for multi-word titles and punctuation-heavy titles.
- Add trailing `?` to an include selector to avoid errors when missing.
- Missing non-optional include selectors throw an error.
- Heading matching is fuzzy prefix-based and picks the first heading match.
- Renaming with `as` is only supported when one section is selected.
- Use `; !#` to start excludes. `<file.md # tl;dr !# later>` is invalid.

**Optional load** - returns null for missing files, empty array for empty globs:

```mlld
>> Missing file returns null
var @optional = <config.json>?
when @optional => show "Config loaded"

>> Empty glob returns []
var @matches = <*.nonexistent>?
show @matches.length                 >> 0

>> Existing file works normally
var @readme = <README.md>?
show @readme                         >> file content
```

## See Also

- [File Loading Metadata](./file-loading-metadata.md) - Access `.mx.filename`, `.mx.relative`, and related metadata.
- [File Loading AST](./file-loading-ast.md) - Parse source into AST for structural analysis.
- [Variables Basics](./variables-basics.md) - Combine file-loaded values with standard variable patterns.
