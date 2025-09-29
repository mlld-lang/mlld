# File Reference Glob Pattern Tests

This test verifies glob pattern support in file reference interpolation.

## Glob Patterns

Markdown files: # Markdown File 1

Content of first markdown file.

---

# Markdown File 2

Content of second markdown file.

Text files in dir: Content of file 1.
Content of file 2.

## Glob with Field Access

First markdown file: # Markdown File 1

Content of first markdown file.

## Glob with Pipes

Markdown files as JSON: ["# Markdown File 1\n\nContent of first markdown file.","# Markdown File 2\n\nContent of second markdown file."]