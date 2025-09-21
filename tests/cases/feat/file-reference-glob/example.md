# File Reference Glob Pattern Tests

This test verifies glob pattern support in file reference interpolation.

## Glob Patterns

/var @allMarkdown = `<*.md>`
/show `Markdown files: @allMarkdown`

/var @allInDir = `<files/*.txt>`
/show `Text files in dir: @allInDir`

## Glob with Field Access

/var @firstMd = `<*.md>[0]`
/show `First markdown file: @firstMd`

## Glob with Pipes

/var @mdAsJson = `<*.md>|@json`
/show `Markdown files as JSON: @mdAsJson`