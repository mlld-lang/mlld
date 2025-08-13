# Glob Pattern Tests

Test glob patterns for loading multiple files with metadata.

## Basic Glob Pattern

/var @docs = <*.md>
/show `Found @docs.length markdown files`

## Show First File Info

/when @docs.length > 0 => show `First file: @docs.0.filename (@docs.0.tokest estimated tokens)`

## Recursive Glob Pattern

/var @testFiles = <tests/**/*.test.ts>
/show `Found @testFiles.length test files`

## Section Extraction with Glob

/var @sections = <docs/**/*.md # Installation>
/show `Found @sections.length files with Installation sections`

## Token Counting

/var @readme = <README.md>
/show `README tokens: ~@readme.tokest (estimated), @readme.tokens (exact)`

## Frontmatter Access

/var @withFm = <tests/cases/valid/frontmatter/*.md>
/show foreach @file(@withFm) {
  /when @file.fm => `@file.filename has frontmatter: title = @file.fm.title`
}

## JSON File Access

/var @package = <package.json>
/show `Project name: @package.json.name`
/show `Version: @package.json.version`

## Complex Glob with Multiple Extensions

/var @configs = <{src,lib}/**/*.{json,yaml,yml}>
/show `Found @configs.length configuration files`

## Filter by Token Size

/var @largeDocs = <docs/**/*.md>
/var @filtered = foreach @doc(@largeDocs) {
  /when @doc.tokest > 2000 => @doc
}
