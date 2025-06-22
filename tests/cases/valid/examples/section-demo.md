# Section Extraction Demo

This example demonstrates the section extraction syntax for extracting
sections from markdown files.

## Section extraction with @add

### Extract a specific section:
/add "Introduction" from [docs/guide.md]

### Extract and rename a section:
/add "Original Title" from [docs/api.md] as "# API Reference"

## Section extraction with @text

### Assign a section to a variable:
/text @intro = "Introduction" from [docs/guide.md]

### Extract and rename:
/text @docs = "Installation" from [files/README.md] as "# Getting Started"
/add @docs

## Direct section inclusion

### Include a specific section:
/add "Version 2.0" from [CHANGELOG.md]