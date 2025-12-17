# Glob As Transform

Tests the `as` transform pattern on glob patterns without section extraction.
Regression test for issue #368.

## mx.filename

/var @files = <glob-test-*.md> as "- <>.mx.filename"
/show @files.join("\n")

## Direct filename access

/var @names = <glob-test-*.md> as "<>.filename"
/show @names.join(" | ")
