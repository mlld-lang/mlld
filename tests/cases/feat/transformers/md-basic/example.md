# Test: Markdown formatter

## Format unformatted markdown
/var @uglyMd = ::
#  Header with extra spaces  

This is    a paragraph with     irregular spacing.

-   Item 1
- Item 2
- Nested item

| Col1|Col2 |Col3|
|---|---|---|
|A|B|C|
::

/var @prettyMd = run {echo "@uglyMd"} with { pipeline: [@md] }
/show @prettyMd

## Using uppercase alias
/var @prettyUpper = run {echo "# Quick test"} with { pipeline: [@MD] }
/show @prettyUpper