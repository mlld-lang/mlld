# Optional File Loading

Test that `<path>?` returns null for missing files and [] for empty globs.

## Missing single file returns null

/var @missing = <optional-load-nonexistent.json>?
/show `missing: @missing`

## Glob with no matches returns empty array

/var @noMatches = <*.nonexistent>?
/show `noMatches: @noMatches.length`

## Existing file works normally

/var @found = <optional-load-data.json>?
/show `found: @found.name`
