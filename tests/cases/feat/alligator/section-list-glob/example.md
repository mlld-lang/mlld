# Section List - Glob Pattern

Test that glob patterns with section-lists return per-file structured results.

## List H2 sections from multiple files

/var @results = <doc*.md # ##??>

/for @fileResult in @results => show "• @fileResult.file: @fileResult.names.join(', ')"
