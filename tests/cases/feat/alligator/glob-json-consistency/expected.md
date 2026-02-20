# Regression test: glob JSON parsing consistency (mlld-nfkj)

## Single file JSON parsing

Single .name: Alice
## Glob JSON parsing (should work the same)

Glob[0] .name: Alice
## Glob items have .mx metadata via index

Glob[0] .mx.filename: glob-json-a.json
## For loop preserves .mx metadata

Loop: glob-json-a.json has name Alice
Loop: glob-json-b.json has name Bob
