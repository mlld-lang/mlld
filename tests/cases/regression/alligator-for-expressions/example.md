# Regression Test: Alligator Syntax in For Expressions

This test covers the bug where alligator syntax (`<file>`) with variable interpolation
returned null when used inside for expressions. The fix added handlers for both
`load-content` and `FileReference` node types in the main interpreter.

## Test 1: Basic file loading in for expression

/var @files = ["alligator-for-test-1.md", "alligator-for-test-2.md", "alligator-for-test-3.md"]
/var @contents = for @f in @files => <@f>
/show `Loaded @contents.length files`

## Test 2: Property access - frontmatter titles

/var @titles = for @f in @files => <@f>.fm.title
/show `Titles: @titles`

## Test 3: Property access - frontmatter authors

/var @authors = for @f in @files => <@f>.fm.author
/show `Authors: @authors`

## Test 4: Property access - filenames

/var @names = for @f in @files => <@f>.filename
/show `Filenames: @names`

## Test 5: Direct interpolation with variable

/var @file = "alligator-for-test-1.md"
/var @single = <@file>
/show `Single file title: @single.fm.title`
