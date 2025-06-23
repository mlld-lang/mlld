# Test: Markdown formatter

## Format unformatted markdown
/text @uglyMd = [[
#  Header with extra spaces  

This is    a paragraph with     irregular spacing.

-   Item 1
- Item 2
- Nested item

| Col1|Col2 |Col3|
|---|---|---|
|A|B|C|
]]

/text @prettyMd = @run {echo "@uglyMd"} with { pipeline: [@md] }
/add @prettyMd

## Using uppercase alias
/text @prettyUpper = @run {echo "# Quick test"} with { pipeline: [@MD] }
/add @prettyUpper