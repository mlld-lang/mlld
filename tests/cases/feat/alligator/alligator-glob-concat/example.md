# Alligator Glob Concatenation Test

This test verifies that glob patterns concatenate content by default, consistent with single file behavior.

## Single File Behavior

/var @single = <glob-concat-single.md>
/show @single
/show `Content: <glob-concat-single.md>`

## Glob Pattern Behavior

/var @files = <glob-concat-file*.md>
/show @files.content
/show `All files concatenated via .content`

## Field Access on Glob

/var @allFiles = <glob-concat-file*.md>
/show @allFiles.content
/show `First file title: @allFiles[0].ctx.fm.title`
/show @allFiles[0].content

## Template Interpolation

/var @template = `Combined: @files`
/show @template

## Direct Interpolation

/show `Direct: @files`