# WITH CLAUSE REFERENCE

The `/with` clause controls pipelines, dependency declarations, and other modifiers applied to directives.

## PIPELINES
- `|` applies condensed pipeline stages inline.
- `with { pipeline: [...] }` uses the expanded object form.

## DEPENDENCIES
- `with { needs: { js: { chalk: "^5" } } }` declares runtime package requirements.

## SECTIONS
- `as` renames sections when showing or importing content.

Legacy TTL/trust syntax has been removed. New capability and security annotations will be introduced as part of the import-security revamp.
