# Regression Test: Alligator Syntax in For Expressions

This test covers the bug where alligator syntax (`<file>`) with variable interpolation
returned null when used inside for expressions. The fix added handlers for both
`load-content` and `FileReference` node types in the main interpreter.

## Test 1: Basic file loading in for expression

Loaded 3 files
## Test 2: Property access - frontmatter titles

Titles: ["Test File 1","Test File 2","Test File 3"]
## Test 3: Property access - frontmatter authors

Authors: ["Alice","Bob","Charlie"]
## Test 4: Property access - filenames

Filenames: ["alligator-for-test-1.md","alligator-for-test-2.md","alligator-for-test-3.md"]
## Test 5: Direct interpolation with variable

Single file title: Test File 1
