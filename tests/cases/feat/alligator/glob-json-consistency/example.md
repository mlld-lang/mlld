# Regression test: glob JSON parsing consistency (mlld-nfkj)

## Single file JSON parsing

/var @single = <glob-json-a.json>
/show `Single .data.name: @single.data.name`

## Glob JSON parsing (should work the same)

/var @glob = <glob-json-*.json>
/var @first = @glob[0]
/show `Glob[0] .data.name: @first.data.name`

## Glob items have .mx metadata via index

/show `Glob[0] .mx.filename: @first.mx.filename`

## For loop preserves .mx metadata

/for @item in @glob => show `Loop: @item.mx.filename has name @item.data.name`
