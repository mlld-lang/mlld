# Alligator Glob with Section Rename

This test demonstrates the alligator glob pattern with section extraction and rename using the `as` syntax.

## Setup Test Files

## Single File Section Rename

First, let's test renaming a section from a single file:

### Module: test
This is a test module for demonstrating alligator syntax.

## Glob Pattern with Section Rename

Now let's use a glob pattern to extract and rename sections from multiple files:

### [ai](./ai.mld.md)
AI integration for mlld scripts.

### [array](./array.mld.md)
Array utilities and operations.

### [time](./time.mld.md)
Time and date utilities.

## With Backtick Templates

The rename syntax also supports backtick templates:

## test v1.0.0
This is a test module for demonstrating alligator syntax.

## Complex Field Access

You can access nested fields in frontmatter:

## test by Alice
This module demonstrates field access in rename templates.