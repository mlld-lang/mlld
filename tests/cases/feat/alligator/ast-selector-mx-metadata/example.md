# AST Selector - MX Metadata

Verify AST selector results expose both convenience fields and `.mx` metadata.

## Single-file metadata mirrors

/var @single = <ast-selector-mx-meta-handler-source.ts { handlePing }>
/show "top: @single[0].name, @single[0].type, @single[0].line"
/show "mx: @single[0].mx.name, @single[0].mx.type, @single[0].mx.line"

## Glob metadata and loop usage

/var @handlers = <ast-selector-mx-meta-handler-*.ts { handle* }>
/show @handlers[0].file.endsWith("ast-selector-mx-meta-handler-source.ts")
/show @handlers[0].mx.relative
/for @h in @handlers => show "@h.mx.name in @h.mx.relative"
