# Glob As Transform

Tests the `as` transform pattern on glob patterns without section extraction.
Regression test for issue #368.

## ctx.filename

/var @files = <glob-test-*.md> as "- <>.ctx.filename"
/show @files.join("\n")

## Direct filename access

/var @names = <glob-test-*.md> as "<>.filename"
/show @names.join(" | ")
