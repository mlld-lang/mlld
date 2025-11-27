# AST Name List - Glob Pattern

Test that glob patterns with name-lists return per-file structured results.

## List classes from multiple files

/var @results = <service*.ts { class?? }>

/for @fileResult in @results => show "• @fileResult.file: @fileResult.names.join(', ')"
