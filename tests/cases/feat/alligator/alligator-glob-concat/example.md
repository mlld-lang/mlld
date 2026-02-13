# Alligator Glob Concatenation Test

This test verifies that glob patterns concatenate content by default, consistent with single file behavior.

## Single File Behavior

/var @single = <glob-concat-single.md>
/show @single
/show `Content: <glob-concat-single.md>`

## Glob Pattern Behavior

/var @files = <glob-concat-file*.md>
/show @files.mx.text
/show `All files concatenated via .mx.text`

## Field Access on Glob

/var @allFiles = <glob-concat-file*.md>
/show @allFiles.mx.text
/show `First file title: @allFiles[0].mx.fm.title`
/show @allFiles[0].mx.text

## Template Interpolation

/var @template = `Combined: @files`
/show @template

## Direct Interpolation

/show `Direct: @files`
