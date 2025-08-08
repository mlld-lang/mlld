# Alligator Glob Concatenation Test

This test verifies that glob patterns concatenate content by default, consistent with single file behavior.

## Single File Behavior

/var @single = <single-file.md>
/show @single
/show `Content: <single-file.md>`

## Glob Pattern Behavior

/var @files = <*.md>
/show @files
/show `All files: <*.md>`

## Field Access on Glob

/var @allFiles = <*.md>
/show @allFiles.content
/show @allFiles[0].fm.title
/show @allFiles[0].content

## Template Interpolation

/var @template = `Combined: @files`
/show @template

## Direct Interpolation

/show `Direct: @files`